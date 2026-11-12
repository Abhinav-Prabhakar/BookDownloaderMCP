import type { LibgenConfig } from "../types";
import { LibgenError } from "./errors";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

export interface FetchOptions extends RequestInit {
  /** Override the configured timeout for this request. */
  timeoutMs?: number;
}

/**
 * HTTP client tuned for LibGen mirrors: browser-like headers (mirrors reject
 * non-browser agents), timeouts, and retries with exponential backoff.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: LibgenConfig,
    fetchImpl?: FetchLike
  ) {
    this.fetchImpl = fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async fetch(url: string | URL, options: FetchOptions = {}): Promise<Response> {
    const { timeoutMs, ...init } = options;
    const headers = new Headers(init.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", this.config.userAgent);
    if (!headers.has("accept")) {
      headers.set(
        "accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/octet-stream;q=0.8,*/*;q=0.7"
      );
    }
    if (!headers.has("accept-language")) headers.set("accept-language", "en-US,en;q=0.9");

    let lastError: LibgenError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs ?? this.config.timeoutMs);
      const external = init.signal;
      const onAbort = () => controller.abort();
      external?.addEventListener("abort", onAbort, { once: true });

      try {
        const response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
        if (response.ok) return response;

        const snippet = await response.text().catch(() => "");
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const message = `HTTP ${response.status} from ${new URL(String(url)).host}`;

        if (RETRYABLE_STATUS.has(response.status) && attempt < this.config.maxRetries) {
          lastError = new LibgenError(message, {
            code: "MIRROR",
            status: response.status,
            hint: snippet.slice(0, 200) || undefined,
          });
          await sleep(this.backoff(attempt, retryAfter));
          continue;
        }

        throw new LibgenError(message, {
          code: response.status === 404 ? "NOT_FOUND" : "MIRROR",
          status: response.status,
          hint: snippet.slice(0, 200) || "The mirror may be down or blocking this request.",
        });
      } catch (error) {
        if (error instanceof LibgenError && !RETRYABLE_STATUS.has(error.status ?? 0)) throw error;

        if (error instanceof LibgenError) {
          lastError = error;
        } else if (external?.aborted) {
          throw new LibgenError("Download cancelled", { code: "NETWORK", cause: error });
        } else if (timedOut) {
          lastError = new LibgenError(
            `Request to ${new URL(String(url)).host} timed out after ${timeoutMs ?? this.config.timeoutMs}ms`,
            {
              code: "TIMEOUT",
              hint: "Increase LIBGEN_TIMEOUT_MS or try a different mirror.",
            }
          );
        } else {
          lastError = new LibgenError(`Could not reach ${new URL(String(url)).host}`, {
            code: "NETWORK",
            hint: "Check your connection or try another mirror.",
            cause: error,
          });
        }

        if (attempt < this.config.maxRetries) {
          await sleep(this.backoff(attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
        external?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError ?? new LibgenError("Request failed", { code: "UNKNOWN" });
  }

  async getText(url: string | URL, options: FetchOptions = {}): Promise<string> {
    const response = await this.fetch(url, options);
    return response.text();
  }

  private backoff(attempt: number, retryAfterSeconds?: number): number {
    if (retryAfterSeconds !== undefined) {
      return Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
    }
    return Math.min(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 100, MAX_BACKOFF_MS);
  }
}

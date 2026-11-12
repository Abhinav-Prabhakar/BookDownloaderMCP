import os from "node:os";
import path from "node:path";
import type { LibgenConfig } from "./types";

export const CONFIG_URL =
  "https://raw.githubusercontent.com/obsfx/libgen-downloader/configuration/config.v3.json";

/**
 * LibGen mirrors reject requests that do not look like a browser (they answer
 * with a stock "Welcome to nginx" page). A realistic UA is required for search
 * and download requests to work at all.
 */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LibgenConfig {
  return {
    configUrl: env.LIBGEN_CONFIG_URL?.trim() || CONFIG_URL,
    mirrorOverride: env.LIBGEN_MIRROR?.trim() || undefined,
    downloadDir: expandHome(env.LIBGEN_DOWNLOAD_DIR?.trim() || process.cwd()),
    timeoutMs: readInt(env.LIBGEN_TIMEOUT_MS, 30_000),
    maxRetries: readInt(env.LIBGEN_MAX_RETRIES, 2),
    maxDownloadBytes: readInt(env.LIBGEN_MAX_DOWNLOAD_MB, 512) * 1024 * 1024,
    userAgent: env.LIBGEN_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    configTtlMs: readInt(env.LIBGEN_CONFIG_TTL_MS, 60 * 60 * 1000),
    verifyMd5: readBool(env.LIBGEN_VERIFY_MD5, true),
    concurrency: Math.min(Math.max(readInt(env.LIBGEN_CONCURRENCY, 2), 1), 5),
  };
}

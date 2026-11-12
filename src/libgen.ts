import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getAdapter } from "./api/adapters";
import type { Adapter } from "./api/adapters";
import { LibgenPlusAdapter } from "./api/adapters/LibgenPlusAdapter";
import { FALLBACK_MIRRORS, fetchConfig, findWorkingMirror } from "./api/config";
import { fetchDocument } from "./api/document";
import { loadConfig } from "./config";
import { LibgenError, assertMd5, toErrorMessage } from "./core/errors";
import { ensureDir, md5File, uniquePath, writeBodyToFile } from "./core/files";
import { HttpClient } from "./core/http";
import type {
  Config,
  DownloadOptions,
  DownloadOutcome,
  LibgenConfig,
  Mirror,
  MirrorProbe,
  SearchResult,
} from "./types";

export interface ActiveMirror {
  mirror: Mirror;
  adapter: Adapter;
  config: Config;
  probed: Array<{ src: string; ok: boolean; error?: string }>;
}

export interface SearchOptions {
  page?: number;
  pageSize?: number;
}

export interface BulkDownloadOptions extends DownloadOptions {
  concurrency?: number;
}

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/epub+zip": ".epub",
  "application/x-mobipocket-ebook": ".mobi",
  "application/vnd.amazon.ebook": ".azw3",
  "application/x-fictionbook+xml": ".fb2",
  "application/x-djvu": ".djvu",
  "image/vnd.djvu": ".djvu",
  "application/zip": ".zip",
  "application/x-rar-compressed": ".rar",
  "application/vnd.rar": ".rar",
  "application/x-7z-compressed": ".7z",
  "text/plain": ".txt",
};

function expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

/** Parses `content-disposition`, preferring RFC 5987 `filename*`. */
export function parseContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(header);
  if (encoded?.[2]) {
    try {
      return decodeURIComponent(encoded[2].trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded[2].trim().replace(/^"|"$/g, "");
    }
  }

  const plain = /filename\s*=\s*("([^"]+)"|([^;]+))/i.exec(header);
  const value = (plain?.[2] ?? plain?.[3] ?? "").trim();
  return value || null;
}

function extensionFor(contentType: string): string {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return CONTENT_TYPE_EXTENSIONS[mime] ?? ".bin";
}

/**
 * High-level LibGen+ client: mirror discovery, search, download-URL resolution
 * and verified downloads. One instance keeps a warm mirror for the process.
 */
export class LibgenClient {
  readonly config: LibgenConfig;
  private readonly http: HttpClient;
  private cachedConfig: Config | null = null;
  private configLoadedAt = 0;
  private activeMirror: ActiveMirror | null = null;

  constructor(config: LibgenConfig = loadConfig(), http?: HttpClient) {
    this.config = config;
    this.http = http ?? new HttpClient(config);
  }

  async getConfig(force = false): Promise<Config> {
    if (this.config.mirrorOverride) {
      return {
        latestVersion: "override",
        mirrors: [{ src: this.normaliseMirror(this.config.mirrorOverride), type: "libgen-plus" }],
      };
    }

    const fresh =
      this.cachedConfig !== null && Date.now() - this.configLoadedAt < this.config.configTtlMs;
    if (!force && fresh) return this.cachedConfig as Config;

    try {
      this.cachedConfig = await fetchConfig(this.http, this.config.configUrl);
    } catch (error) {
      if (this.cachedConfig) return this.cachedConfig;
      this.cachedConfig = { latestVersion: "fallback", mirrors: FALLBACK_MIRRORS };
      void error;
    }

    this.configLoadedAt = Date.now();
    return this.cachedConfig;
  }

  async ensureMirrorReady(force = false): Promise<ActiveMirror> {
    if (!force && this.activeMirror) return this.activeMirror;

    const config = await this.getConfig(force);
    const mirrors = [...config.mirrors];
    if (this.activeMirror) {
      const index = mirrors.findIndex((mirror) => mirror.src === this.activeMirror?.mirror.src);
      if (index > 0) mirrors.unshift(mirrors.splice(index, 1)[0] as Mirror);
    }

    const selection = await findWorkingMirror(this.http, mirrors, {
      timeoutMs: Math.max(this.config.timeoutMs, 15_000),
    });

    this.activeMirror = {
      mirror: selection.mirror,
      adapter: getAdapter(selection.mirror.src, selection.mirror.type),
      config,
      probed: selection.probed,
    };

    return this.activeMirror;
  }

  getActiveMirror(): Mirror | null {
    return this.activeMirror?.mirror ?? null;
  }

  async listMirrors(): Promise<{
    latestVersion: string;
    configured: Mirror[];
    active: Mirror | null;
    probed: ActiveMirror["probed"] | [];
  }> {
    const config = await this.getConfig();
    return {
      latestVersion: config.latestVersion,
      configured: config.mirrors,
      active: this.getActiveMirror(),
      probed: this.activeMirror?.probed ?? [],
    };
  }

  async setMirror(mirrorSrc: string): Promise<Mirror> {
    const src = this.normaliseMirror(mirrorSrc);
    const mirror: Mirror = { src, type: "libgen-plus" };
    const selection = await findWorkingMirror(this.http, [mirror], {
      timeoutMs: Math.max(this.config.timeoutMs, 15_000),
    });

    this.activeMirror = {
      mirror: selection.mirror,
      adapter: getAdapter(selection.mirror.src, selection.mirror.type),
      config: await this.getConfig(),
      probed: selection.probed,
    };

    return selection.mirror;
  }

  async status(): Promise<{ active: Mirror | null; probes: MirrorProbe[] }> {
    const config = await this.getConfig();
    const probes: MirrorProbe[] = [];

    for (const mirror of config.mirrors) {
      const started = Date.now();
      try {
        const url = new URL("/index.php", mirror.src);
        url.searchParams.set("req", "libgen");
        url.searchParams.set("res", "1");
        const html = await this.http.getText(url, {
          timeoutMs: Math.max(this.config.timeoutMs, 15_000),
        });
        const ok = html.includes("tablelibgen");
        probes.push({
          src: mirror.src,
          ok,
          latencyMs: Date.now() - started,
          error: ok ? undefined : "search page did not contain a results table",
        });
      } catch (error) {
        probes.push({
          src: mirror.src,
          ok: false,
          latencyMs: Date.now() - started,
          error: toErrorMessage(error),
        });
      }
    }

    return { active: this.getActiveMirror(), probes };
  }

  async search(
    query: string,
    pageNumber = 1,
    pageSize = 25,
    options: { retryOnFailure?: boolean } = {}
  ): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      throw new LibgenError("Search query is too short", {
        code: "USAGE",
        hint: "Provide at least two characters.",
      });
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new LibgenError("page must be a positive integer", { code: "USAGE" });
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new LibgenError("pageSize must be between 1 and 100", { code: "USAGE" });
    }

    const { adapter } = await this.ensureMirrorReady();
    const searchURL = adapter.getSearchURL(trimmed, pageNumber, pageSize);

    try {
      return await this.runSearch(adapter, searchURL, trimmed);
    } catch (error) {
      if (options.retryOnFailure === false) throw error;
      // The warm mirror may have died between requests: re-probe and retry once.
      const fallback = await this.ensureMirrorReady(true);
      return this.runSearch(
        fallback.adapter,
        fallback.adapter.getSearchURL(trimmed, pageNumber, pageSize),
        trimmed
      );
    }
  }

  async getDownloadUrl(md5: string): Promise<string> {
    const hash = assertMd5(md5);
    const { adapter } = await this.ensureMirrorReady();
    const detailUrl = adapter.getDetailPageURL(hash);
    const document = await fetchDocument(this.http, detailUrl);
    const url = adapter.getMainDownloadURLFromDocument(document);

    if (!url) {
      throw new LibgenError(`No download link found for md5 ${hash}`, {
        code: "NOT_FOUND",
        hint: "The record may have no downloadable file, or the mirror changed its page layout.",
      });
    }

    return url;
  }

  async download(md5: string, options: DownloadOptions = {}): Promise<DownloadOutcome> {
    const raw = md5;
    try {
      const hash = assertMd5(raw);
      const downloadUrl = await this.getDownloadUrl(hash);
      const response = await this.http.fetch(downloadUrl, {
        headers: { accept: "application/octet-stream,*/*" },
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        throw new LibgenError("The mirror returned a web page instead of a file", {
          code: "DOWNLOAD",
          hint: "Download keys expire; retry or pick another search result.",
        });
      }

      const filename =
        parseContentDisposition(response.headers.get("content-disposition")) ??
        `${hash}${extensionFor(contentType)}`;

      const directory = expandHome(options.downloadDir || this.config.downloadDir);
      await ensureDir(directory);
      const destination = uniquePath(directory, filename, options.overwrite);
      const partial = `${destination}.part`;

      const written = await writeBodyToFile(response.body, partial, {
        maxBytes: this.config.maxDownloadBytes,
      });
      await fs.rename(partial, destination);

      const shouldVerify = options.verifyMd5 ?? this.config.verifyMd5;
      const md5Verified = shouldVerify ? (await md5File(destination)) === hash : undefined;

      return {
        md5: hash,
        status: "ok",
        path: destination,
        filename: path.basename(destination),
        bytes: written.bytes,
        md5Verified,
      };
    } catch (error) {
      return { md5: raw, status: "error", error: toErrorMessage(error) };
    }
  }

  async downloadMany(
    md5List: string[],
    options: BulkDownloadOptions = {}
  ): Promise<DownloadOutcome[]> {
    const limit = Math.min(Math.max(options.concurrency ?? this.config.concurrency, 1), 5);
    const results = new Array<DownloadOutcome>(md5List.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < md5List.length) {
        const index = cursor;
        cursor += 1;
        const md5 = md5List[index] as string;
        results[index] = await this.download(md5, options);
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, md5List.length) }, worker));
    return results;
  }

  private async runSearch(
    adapter: Adapter,
    searchURL: string,
    query: string
  ): Promise<SearchResult[]> {
    const document = await fetchDocument(this.http, searchURL);
    const table = document.querySelector("#tablelibgen");
    if (!table) {
      throw new LibgenError(`The mirror returned no results table for "${query}"`, {
        code: "MIRROR",
        hint: "The mirror is blocking requests or is down; trying another mirror usually fixes it.",
      });
    }

    return adapter.parseEntries(document).map((entry) => ({
      ...entry,
      md5: LibgenPlusAdapter.extractMd5(entry.mirror),
      mirrorUrl: entry.mirror ? adapter.getPageURL(entry.mirror) : adapter.baseURL,
    }));
  }

  private normaliseMirror(src: string): string {
    const trimmed = src.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new LibgenError(`Invalid mirror URL: ${src}`, {
        code: "USAGE",
        hint: "Mirror URLs must start with http:// or https://.",
      });
    }
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
}

export const defaultClient = (): LibgenClient => new LibgenClient();

export async function searchBooks(query: string, page = 1, pageSize = 25): Promise<SearchResult[]> {
  return new LibgenClient().search(query, page, pageSize);
}

export async function getDirectDownloadUrlByMd5(md5: string): Promise<string> {
  return new LibgenClient().getDownloadUrl(md5);
}

export async function downloadByMd5(
  md5: string,
  options?: DownloadOptions
): Promise<DownloadOutcome> {
  return new LibgenClient().download(md5, options);
}

export async function downloadByMd5List(
  md5List: string[],
  options?: BulkDownloadOptions
): Promise<DownloadOutcome[]> {
  return new LibgenClient().downloadMany(md5List, options);
}

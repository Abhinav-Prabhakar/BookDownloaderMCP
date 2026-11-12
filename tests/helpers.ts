import fs from "node:fs";
import path from "node:path";
import type { FetchLike } from "../src/core/http";
import { loadConfig } from "../src/config";
import type { LibgenConfig } from "../src/types";

export const FIXTURES = path.resolve(process.cwd(), "tests", "fixtures");

export const SEARCH_HTML = fs.readFileSync(path.join(FIXTURES, "search.html"), "utf8");
export const DETAIL_HTML = fs.readFileSync(path.join(FIXTURES, "detail.html"), "utf8");

/** md5 of the ASCII string "hello world" — used to test verification. */
export const HELLO_MD5 = "5eb63bbbe01eeed093cb22bb8f5acdc3";

export function testConfig(overrides: Partial<LibgenConfig> = {}): LibgenConfig {
  return {
    ...loadConfig({}),
    downloadDir: overrides.downloadDir ?? "/tmp/book-downloader-mcp-tests",
    maxRetries: 0,
    timeoutMs: 1_000,
    configTtlMs: 60_000,
    verifyMd5: true,
    concurrency: 2,
    ...overrides,
  };
}

export interface RecordedRequest {
  url: URL;
  init?: RequestInit;
}

export function recordingFetch(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>
) {
  const calls: RecordedRequest[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

export function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

export function fileResponse(
  body: string,
  options: { filename?: string; contentType?: string } = {}
) {
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/pdf",
    "content-length": String(Buffer.byteLength(body)),
  };
  if (options.filename) {
    headers["content-disposition"] = `attachment; filename="${options.filename}"`;
  }
  return new Response(body, { status: 200, headers });
}

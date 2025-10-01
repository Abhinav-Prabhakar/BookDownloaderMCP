import fetch from "node-fetch";
import { Adapter } from "../api/adapters/Adapter";
import { getAdapter } from "../api/adapters";
import { Config, Mirror, fetchConfig, findMirror } from "../api/data/config";
import { getDocument } from "../api/data/document";
import { downloadFile } from "../api/data/download";
import { attempt } from "../utils";
import { SEARCH_PAGE_SIZE, httpAgent } from "../settings";
import { Entry } from "../api/models/Entry";

let currentConfig: Config | null = null;
let currentMirror: Mirror | null = null;
let adapter: Adapter | null = null;

export async function ensureMirrorReady(): Promise<{ adapter: Adapter; mirror: Mirror; config: Config }> {
  if (adapter && currentMirror && currentConfig) {
    return { adapter, mirror: currentMirror, config: currentConfig };
  }

  const cfg = await attempt(fetchConfig);
  if (!cfg) {
    throw new Error("Couldn't fetch configuration");
  }

  const mir = await findMirror(cfg.mirrors, () => {});
  if (!mir) {
    throw new Error("Couldn't find a working mirror");
  }

  adapter = getAdapter(mir.src, mir.type);
  currentConfig = cfg;
  currentMirror = mir;

  return { adapter, mirror: mir, config: cfg };
}

export interface SearchResultEntry extends Entry {
  md5?: string | null;
  resolvedMirrorUrl?: string;
}

export async function searchBooks(query: string, pageNumber = 1, pageSize = SEARCH_PAGE_SIZE): Promise<SearchResultEntry[]> {
  const { adapter } = await ensureMirrorReady();
  const searchURL = adapter.getSearchURL(query, pageNumber, pageSize);
  const pageDocument = await attempt(() => getDocument(searchURL));
  if (!pageDocument) {
    throw new Error(`Couldn't fetch the search page for "${query}"`);
  }
  const entries = adapter.parseEntries(pageDocument) || [];

  const enhanced = entries.map((e) => {
    const resolvedMirrorUrl = adapter.getPageURL(e.mirror);
    let md5: string | null = null;
    try {
      const url = new URL(resolvedMirrorUrl);
      md5 = url.searchParams.get("md5");
    } catch (_) {
      md5 = null;
    }
    return { ...e, md5, resolvedMirrorUrl } as SearchResultEntry;
  });

  return enhanced;
}

export async function getDirectDownloadUrlByMd5(md5: string): Promise<string> {
  const { adapter } = await ensureMirrorReady();
  const detailPageUrl = adapter.getDetailPageURL(md5);
  const detailPageDocument = await attempt(() => getDocument(detailPageUrl));
  if (!detailPageDocument) {
    throw new Error("Failed to get detail page document");
  }
  const downloadUrl = adapter.getMainDownloadURLFromDocument(detailPageDocument);
  if (!downloadUrl) {
    throw new Error("Failed to find direct download url");
  }
  return downloadUrl;
}

export interface DownloadOutcome {
  md5: string;
  path?: string;
  filename?: string;
  total?: number;
  status: "ok" | "error";
  error?: string;
}

export async function downloadByMd5(md5: string): Promise<DownloadOutcome> {
  try {
    const downloadUrl = await getDirectDownloadUrlByMd5(md5);
    const resp = await attempt(() => fetch(downloadUrl, { agent: httpAgent }));
    if (!resp) {
      throw new Error("Failed to start download stream");
    }

    const result = await downloadFile({
      downloadStream: resp as any,
      onStart: () => {},
      onData: () => {},
    });

    return { md5, path: result.path, filename: result.filename, total: result.total, status: "ok" };
  } catch (e: any) {
    return { md5, status: "error", error: e?.message || String(e) };
  }
}

export async function downloadByMd5List(md5List: string[]): Promise<DownloadOutcome[]> {
  const outcomes: DownloadOutcome[] = [];
  for (const md5 of md5List) {
    outcomes.push(await downloadByMd5(md5));
  }
  return outcomes;
}

export function getActiveMirror(): Mirror | null {
  return currentMirror;
}

export function getActiveConfig(): Config | null {
  return currentConfig;
}

export async function setActiveMirror(mirrorSrc: string): Promise<Mirror> {
  const cfg = currentConfig || (await fetchConfig());
  const mir = cfg.mirrors.find((m) => m.src === mirrorSrc);
  if (!mir) {
    throw new Error(`Mirror not found: ${mirrorSrc}`);
  }
  adapter = getAdapter(mir.src, mir.type);
  currentMirror = mir;
  currentConfig = cfg;
  return mir;
}

export type MirrorType = "libgen-plus";

export interface Mirror {
  src: string;
  type: MirrorType;
}

export interface LibgenConfig {
  /** Remote JSON describing the current LibGen+ mirrors. */
  configUrl: string;
  /** Skip the remote config entirely and use these mirrors. */
  mirrorOverride?: string;
  downloadDir: string;
  timeoutMs: number;
  maxRetries: number;
  maxDownloadBytes: number;
  userAgent: string;
  configTtlMs: number;
  verifyMd5: boolean;
  concurrency: number;
}

export interface Config {
  latestVersion: string;
  mirrors: Mirror[];
}

export interface Entry {
  id: string;
  authors: string;
  title: string;
  publisher: string;
  year: string;
  pages: string;
  language: string;
  size: string;
  extension: string;
  /** Raw `href` of the mirror link from the results table. */
  mirror: string;
}

export interface SearchResult extends Entry {
  /** MD5 of the file, when the mirror link exposes it. */
  md5: string | null;
  /** Absolute URL of the book's detail page. */
  mirrorUrl: string;
}

export interface DownloadOutcome {
  md5: string;
  status: "ok" | "error";
  path?: string;
  filename?: string;
  bytes?: number;
  /** Whether the file's MD5 matches the LibGen md5. */
  md5Verified?: boolean;
  error?: string;
}

export interface DownloadOptions {
  downloadDir?: string;
  overwrite?: boolean;
  verifyMd5?: boolean;
}

export interface MirrorProbe {
  src: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

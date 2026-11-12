export {
  LibgenClient,
  downloadByMd5,
  downloadByMd5List,
  getDirectDownloadUrlByMd5,
  parseContentDisposition,
  searchBooks,
  type ActiveMirror,
  type BulkDownloadOptions,
  type SearchOptions,
} from "./libgen";
export { createServer, SERVER_NAME, VERSION, type CreateServerOptions } from "./mcp/server";
export { TOOLS, type ToolContext, type ToolDefinition } from "./mcp/tools";
export { loadConfig, CONFIG_URL, DEFAULT_USER_AGENT } from "./config";
export { LibgenError, toErrorMessage, type LibgenErrorCode } from "./core/errors";
export { HttpClient, type FetchLike, type FetchOptions } from "./core/http";
export { getAdapter, Adapter, LibgenPlusAdapter } from "./api/adapters";
export { fetchConfig, findWorkingMirror, FALLBACK_MIRRORS } from "./api/config";
export type {
  Config,
  DownloadOptions,
  DownloadOutcome,
  Entry,
  LibgenConfig,
  Mirror,
  MirrorProbe,
  MirrorType,
  SearchResult,
} from "./types";

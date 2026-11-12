import type { Entry } from "../../types";

export abstract class Adapter {
  abstract readonly baseURL: string;

  abstract parseEntries(document: Document): Entry[];
  abstract getPageURL(pathname: string): string;
  abstract getSearchURL(query: string, pageNumber: number, pageSize: number): string;
  abstract getDetailPageURL(md5: string): string;
  abstract getMainDownloadURLFromDocument(document: Document): string | null;
}

import { randomUUID } from "node:crypto";
import type { Entry } from "../../types";
import { clearText } from "../document";
import { Adapter } from "./Adapter";

const MD5_IN_URL = /[?&]md5=([a-fA-F0-9]{32})/;

function cellAt(row: Element, index: number): Element | undefined {
  return row.children[index] ?? undefined;
}

function textAt(row: Element, index: number): string {
  return clearText(cellAt(row, index)?.textContent ?? "");
}

function normaliseAuthors(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed
    .split(";")
    .flatMap((part) => (part.includes(",") && !trimmed.includes(";") ? part.split(",") : part))
    .map((author) => author.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Parser for LibGen+ (`libgen.li`-style) mirrors.
 *
 * The results table has nine columns: title, authors, publisher, year,
 * language, pages, size, extension, mirror. The title cell is messy: it starts
 * with the series name, then a badge, then the actual title anchor.
 */
export class LibgenPlusAdapter extends Adapter {
  constructor(readonly baseURL: string) {
    super();
  }

  parseEntries(document: Document): Entry[] {
    const rows = document.querySelectorAll<HTMLTableRowElement>("#tablelibgen > tbody > tr");
    const entries: Entry[] = [];

    for (const row of Array.from(rows)) {
      if (row.children.length < 8) continue;

      const title = this.extractTitle(row);
      if (!title) continue;

      const mirrorLink = cellAt(row, 8)?.querySelector("a")?.getAttribute("href") ?? "";

      entries.push({
        id: randomUUID(),
        authors: normaliseAuthors(textAt(row, 1)),
        title,
        publisher: textAt(row, 2),
        year: textAt(row, 3),
        language: textAt(row, 4),
        pages: textAt(row, 5),
        size: textAt(row, 6),
        extension: textAt(row, 7),
        mirror: mirrorLink,
      });
    }

    return entries;
  }

  getPageURL(pathname: string): string {
    return new URL(pathname, this.baseURL).toString();
  }

  getSearchURL(query: string, pageNumber: number, pageSize: number): string {
    const url = new URL("/index.php", this.baseURL);
    url.searchParams.set("req", query);
    url.searchParams.set("page", String(pageNumber));
    url.searchParams.set("res", String(pageSize));
    return url.toString();
  }

  getDetailPageURL(md5: string): string {
    const url = new URL("/ads.php", this.baseURL);
    url.searchParams.set("md5", md5);
    return url.toString();
  }

  getMainDownloadURLFromDocument(document: Document): string | null {
    const direct =
      document.querySelector<HTMLAnchorElement>("#main a[href*='get.php']") ??
      document.querySelector<HTMLAnchorElement>(
        "#main > tbody > tr:nth-child(1) > td:nth-child(2) > a"
      );

    const href = direct?.getAttribute("href");
    if (!href) return null;
    return this.getPageURL(href);
  }

  /** Extracts the md5 embedded in an `ads.php` / `get.php` mirror link. */
  static extractMd5(href: string): string | null {
    if (!href) return null;
    const match = MD5_IN_URL.exec(href);
    if (match?.[1]) return match[1].toLowerCase();
    try {
      const value = new URL(href, "https://example.invalid").searchParams.get("md5");
      return value && /^[a-fA-F0-9]{32}$/.test(value) ? value.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  private extractTitle(row: Element): string {
    const cell = cellAt(row, 0);
    if (!cell) return "";

    // The real title is the first direct anchor that is neither the series
    // link nor the "#1" edition badge.
    for (const child of Array.from(cell.children)) {
      if (child.tagName !== "A") continue;
      const href = child.getAttribute("href") ?? "";
      if (href.startsWith("series.php")) continue;

      const clone = child.cloneNode(true) as Element;
      clone.querySelectorAll("i, font, nobr").forEach((node) => node.remove());
      const text = clearText(clone.textContent ?? "");
      if (text && !text.startsWith("#")) return text;
    }

    // Rows without an edition link keep the title in the <b> element.
    const bold = cell.querySelector("b");
    if (bold) {
      const text = clearText(bold.textContent ?? "");
      if (text) return text;
    }

    const clone = cell.cloneNode(true) as Element;
    clone.querySelectorAll("nobr, font, script, style").forEach((node) => node.remove());
    return clearText(clone.textContent ?? "");
  }
}

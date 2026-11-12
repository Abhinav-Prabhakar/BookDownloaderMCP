import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/api/document";
import { LibgenPlusAdapter } from "../src/api/adapters/LibgenPlusAdapter";
import { SEARCH_HTML, DETAIL_HTML } from "./helpers";

describe("LibgenPlusAdapter", () => {
  const adapter = new LibgenPlusAdapter("https://libgen.li/");

  it("builds search, detail and page URLs", () => {
    const search = new URL(adapter.getSearchURL("deep learning", 2, 50));
    expect(search.origin + search.pathname).toBe("https://libgen.li/index.php");
    expect(search.searchParams.get("req")).toBe("deep learning");
    expect(search.searchParams.get("page")).toBe("2");
    expect(search.searchParams.get("res")).toBe("50");

    const detail = new URL(adapter.getDetailPageURL("24ef8155fece65f9c2509e517a3e99ca"));
    expect(detail.pathname).toBe("/ads.php");
    expect(detail.searchParams.get("md5")).toBe("24ef8155fece65f9c2509e517a3e99ca");

    expect(adapter.getPageURL("/ads.php?md5=x")).toBe("https://libgen.li/ads.php?md5=x");
    expect(adapter.getPageURL("get.php?md5=x")).toBe("https://libgen.li/get.php?md5=x");
  });

  it("parses rows, skipping empty ones", () => {
    const entries = adapter.parseEntries(parseDocument(SEARCH_HTML));

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      title: "The Art of War",
      authors: "Leo Tolstoy, Sun Tzu",
      publisher: "Penguin",
      year: "2011",
      language: "English",
      pages: "48",
      size: "58 MB",
      extension: "cbr",
      mirror: "/get.php?md5=07fa8b415fc7e4b2aa4c9ef66f0b3488",
    });
  });

  it("ignores the series name and badge when extracting the title", () => {
    const entries = adapter.parseEntries(parseDocument(SEARCH_HTML));

    expect(entries[1]?.title).toBe(
      "Probabilistic Machine Learning: An Introduction (Adaptive Computation and Machine Learning series)"
    );
    expect(entries[1]?.title).not.toContain("War of the Orcs");
    expect(entries[1]?.title).not.toContain("9780262046824");
  });

  it("normalises semicolon-separated authors", () => {
    const entries = adapter.parseEntries(parseDocument(SEARCH_HTML));

    expect(entries[1]?.authors).toBe("Murphy, Kevin P., Smith, John");
  });

  it("returns an empty list when the results table is missing", () => {
    expect(adapter.parseEntries(parseDocument("<html><body></body></html>"))).toEqual([]);
  });

  it("resolves the download link from the detail page", () => {
    const document = parseDocument(DETAIL_HTML);
    expect(adapter.getMainDownloadURLFromDocument(document)).toBe(
      "https://libgen.li/get.php?md5=5eb63bbbe01eeed093cb22bb8f5acdc3&key=X3IHZTX53Y27RASW"
    );
  });

  it("returns null when the detail page has no download link", () => {
    expect(adapter.getMainDownloadURLFromDocument(parseDocument("<html></html>"))).toBeNull();
  });

  it("extracts md5 values from mirror links", () => {
    expect(
      LibgenPlusAdapter.extractMd5("/ads.php?md5=24EF8155FECE65F9C2509E517A3E99CA&downloadname=x")
    ).toBe("24ef8155fece65f9c2509e517a3e99ca");
    expect(LibgenPlusAdapter.extractMd5("get.php?md5=07fa8b415fc7e4b2aa4c9ef66f0b3488")).toBe(
      "07fa8b415fc7e4b2aa4c9ef66f0b3488"
    );
    expect(LibgenPlusAdapter.extractMd5("/file.php?id=123")).toBeNull();
    expect(LibgenPlusAdapter.extractMd5("")).toBeNull();
  });
});

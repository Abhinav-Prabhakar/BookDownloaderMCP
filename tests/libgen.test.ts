import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibgenError } from "../src/core/errors";
import { HttpClient } from "../src/core/http";
import { LibgenClient } from "../src/libgen";
import type { LibgenConfig } from "../src/types";
import {
  DETAIL_HTML,
  HELLO_MD5,
  SEARCH_HTML,
  fileResponse,
  htmlResponse,
  recordingFetch,
  testConfig,
} from "./helpers";

const OTHER_MD5 = "24ef8155fece65f9c2509e517a3e99ca";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "bdmcp-client-"));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

function makeClient(
  handler: Parameters<typeof recordingFetch>[0],
  overrides: Partial<LibgenConfig> = {}
) {
  const config = testConfig({
    downloadDir: dir,
    mirrorOverride: "https://mirror.test/",
    ...overrides,
  });
  const { fetchImpl, calls } = recordingFetch(handler);
  const client = new LibgenClient(config, new HttpClient(config, fetchImpl));
  return { client, calls, config };
}

const isProbe = (url: URL) =>
  url.pathname === "/index.php" && url.searchParams.get("req") === "libgen";

describe("LibgenClient.search", () => {
  it("probes the mirror, then returns results with md5 and absolute URLs", async () => {
    const { client, calls } = makeClient((url) => {
      if (url.pathname === "/index.php") return htmlResponse(SEARCH_HTML);
      return new Response("unexpected", { status: 500 });
    });

    const results = await client.search("art of war", 1, 25);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "The Art of War",
      md5: "07fa8b415fc7e4b2aa4c9ef66f0b3488",
      mirrorUrl: "https://mirror.test/get.php?md5=07fa8b415fc7e4b2aa4c9ef66f0b3488",
    });
    expect(results[1]?.md5).toBe(OTHER_MD5);

    expect(isProbe(calls[0]!.url)).toBe(true);
    expect(calls[1]!.url.searchParams.get("req")).toBe("art of war");
    expect(calls[1]!.url.searchParams.get("res")).toBe("25");
  });

  it("validates the query and paging", async () => {
    const { client } = makeClient(() => htmlResponse(SEARCH_HTML));

    await expect(client.search("a")).rejects.toBeInstanceOf(LibgenError);
    await expect(client.search("valid", 0)).rejects.toThrow(/page/);
    await expect(client.search("valid", 1, 500)).rejects.toThrow(/pageSize/);
  });

  it("fails over to another mirror when the warm one stops working", async () => {
    let searches = 0;
    const { client, calls } = makeClient(
      (url) => {
        if (url.hostname === "raw.githubusercontent.com") {
          return new Response(
            JSON.stringify({
              latest_version: "3.4.0",
              mirrors: [
                { src: "https://dead.test/", type: "libgen-plus" },
                { src: "https://live.test/", type: "libgen-plus" },
              ],
            })
          );
        }
        if (url.pathname === "/index.php") {
          searches += 1;
          // First two calls: probe of dead.test and live.test. Then the search
          // on the still-warm mirror fails, forcing a re-probe.
          if (url.hostname === "dead.test") return htmlResponse("<html>nginx</html>");
          if (searches === 3) return htmlResponse("<html>mirror died</html>");
          return htmlResponse(SEARCH_HTML);
        }
        return new Response("unexpected", { status: 500 });
      },
      { mirrorOverride: undefined }
    );

    const results = await client.search("art of war");

    expect(results.length).toBeGreaterThan(0);
    expect(calls.some((call) => call.url.hostname === "dead.test")).toBe(true);
    expect(calls.some((call) => call.url.hostname === "live.test")).toBe(true);
  });
});

describe("LibgenClient.download", () => {
  const routes = (url: URL) => {
    if (isProbe(url)) return htmlResponse(SEARCH_HTML);
    if (url.pathname === "/ads.php") return htmlResponse(DETAIL_HTML);
    if (url.pathname === "/get.php") {
      return fileResponse("hello world", { filename: "hello world.pdf" });
    }
    return new Response("not found", { status: 404 });
  };

  it("streams the file, verifies the md5 and reports the saved path", async () => {
    const { client } = makeClient(routes);

    const outcome = await client.download(HELLO_MD5);

    expect(outcome.status).toBe("ok");
    expect(outcome.filename).toBe("hello world.pdf");
    expect(outcome.bytes).toBe(11);
    expect(outcome.md5Verified).toBe(true);
    expect(await fsp.readFile(outcome.path as string, "utf8")).toBe("hello world");
  });

  it("flags files whose content does not match the requested md5", async () => {
    const { client } = makeClient(routes);

    const outcome = await client.download(OTHER_MD5);

    expect(outcome.status).toBe("ok");
    expect(outcome.md5Verified).toBe(false);
  });

  it("adds a suffix instead of overwriting an existing file", async () => {
    await fsp.writeFile(path.join(dir, "hello world.pdf"), "old");
    const { client } = makeClient(routes);

    const outcome = await client.download(HELLO_MD5);

    expect(outcome.filename).toBe("hello world (1).pdf");
    expect(await fsp.readFile(path.join(dir, "hello world.pdf"), "utf8")).toBe("old");
  });

  it("rejects HTML error pages from the file endpoint", async () => {
    const { client } = makeClient((url) => {
      if (isProbe(url)) return htmlResponse(SEARCH_HTML);
      if (url.pathname === "/ads.php") return htmlResponse(DETAIL_HTML);
      return htmlResponse("<html>expired key</html>");
    });

    const outcome = await client.download(HELLO_MD5);

    expect(outcome.status).toBe("error");
    expect(outcome.error).toMatch(/web page/);
  });

  it("returns an error outcome for invalid md5 values", async () => {
    const { client } = makeClient(routes);
    const outcome = await client.download("nope");
    expect(outcome.status).toBe("error");
    expect(outcome.error).toMatch(/valid MD5/);
  });

  it("downloads a batch and reports per-item failures", async () => {
    let fileRequests = 0;
    const { client } = makeClient((url) => {
      if (isProbe(url)) return htmlResponse(SEARCH_HTML);
      if (url.pathname === "/ads.php") return htmlResponse(DETAIL_HTML);
      fileRequests += 1;
      if (fileRequests === 1) return fileResponse("hello world", { filename: "a.pdf" });
      return new Response("boom", { status: 500 });
    });

    const outcomes = await client.downloadMany([HELLO_MD5, OTHER_MD5], { concurrency: 2 });

    expect(outcomes).toHaveLength(2);
    expect(outcomes.filter((outcome) => outcome.status === "ok")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "error")).toHaveLength(1);
  });
});

describe("mirror management", () => {
  it("lists configured mirrors", async () => {
    const { client } = makeClient((url) =>
      isProbe(url) ? htmlResponse(SEARCH_HTML) : htmlResponse("")
    );

    await client.ensureMirrorReady();
    const mirrors = await client.listMirrors();

    expect(mirrors.configured).toEqual([{ src: "https://mirror.test/", type: "libgen-plus" }]);
    expect(mirrors.active?.src).toBe("https://mirror.test/");
  });

  it("rejects invalid mirror URLs", async () => {
    const { client } = makeClient(() => htmlResponse(""));
    await expect(client.setMirror("not-a-url")).rejects.toBeInstanceOf(LibgenError);
  });

  it("probes mirrors and reports health", async () => {
    const { client } = makeClient(
      (url) => {
        if (url.hostname === "raw.githubusercontent.com") {
          return new Response(
            JSON.stringify({
              latest_version: "3.4.0",
              mirrors: [
                { src: "https://dead.test/", type: "libgen-plus" },
                { src: "https://live.test/", type: "libgen-plus" },
              ],
            })
          );
        }
        if (url.hostname === "live.test") return htmlResponse(SEARCH_HTML);
        return htmlResponse("<html>nginx</html>");
      },
      { mirrorOverride: undefined }
    );

    const status = await client.status();

    expect(status.active).toBeNull();
    expect(status.probes).toEqual([
      expect.objectContaining({ src: "https://dead.test/", ok: false }),
      expect.objectContaining({ src: "https://live.test/", ok: true }),
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { fetchConfig, findWorkingMirror } from "../src/api/config";
import { loadConfig } from "../src/config";
import { LibgenError } from "../src/core/errors";
import { HttpClient } from "../src/core/http";
import { htmlResponse, recordingFetch, testConfig } from "./helpers";

const CONFIG_BODY = JSON.stringify({
  latest_version: "3.4.0",
  mirrors: [
    { src: "https://libgen.li/", type: "libgen-plus" },
    { src: "https://broken.example/", type: "unknown-type" },
    { src: "https://libgen.vg/", type: "libgen-plus" },
  ],
});

describe("fetchConfig", () => {
  it("parses and filters the mirror list", async () => {
    const { fetchImpl } = recordingFetch(() => new Response(CONFIG_BODY));
    const http = new HttpClient(testConfig(), fetchImpl);

    const config = await fetchConfig(http, "https://config.example/config.json");

    expect(config.latestVersion).toBe("3.4.0");
    expect(config.mirrors).toEqual([
      { src: "https://libgen.li/", type: "libgen-plus" },
      { src: "https://libgen.vg/", type: "libgen-plus" },
    ]);
  });

  it("reports an actionable error when the config is unreachable", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new TypeError("offline");
    });
    const http = new HttpClient(testConfig(), fetchImpl);

    const error = await fetchConfig(http, "https://config.example/config.json").catch(
      (err: unknown) => err
    );

    expect((error as LibgenError).code).toBe("CONFIG");
    expect((error as LibgenError).hint).toContain("LIBGEN_MIRROR");
  });
});

describe("findWorkingMirror", () => {
  it("skips mirrors that serve a placeholder page", async () => {
    const { fetchImpl, calls } = recordingFetch((url) => {
      if (url.hostname === "dead.example") {
        return htmlResponse("<title>Welcome to nginx!</title>");
      }
      return htmlResponse('<table id="tablelibgen"><tbody></tbody></table>');
    });
    const http = new HttpClient(testConfig(), fetchImpl);

    const selection = await findWorkingMirror(http, [
      { src: "https://dead.example/", type: "libgen-plus" },
      { src: "https://live.example/", type: "libgen-plus" },
    ]);

    expect(selection.mirror.src).toBe("https://live.example/");
    expect(selection.probed).toEqual([
      {
        src: "https://dead.example/",
        ok: false,
        error: "search page did not contain a results table",
      },
      { src: "https://live.example/", ok: true, error: undefined },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url.pathname).toBe("/index.php");
    expect(calls[0]!.url.searchParams.get("req")).toBe("libgen");
  });

  it("throws when every mirror fails", async () => {
    const { fetchImpl } = recordingFetch(() => new Response("down", { status: 503 }));
    const http = new HttpClient(testConfig(), fetchImpl);

    const error = await findWorkingMirror(http, [
      { src: "https://dead.example/", type: "libgen-plus" },
    ]).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(LibgenError);
    expect((error as LibgenError).code).toBe("MIRROR");
  });
});

describe("loadConfig", () => {
  it("reads env overrides", () => {
    const config = loadConfig({
      LIBGEN_DOWNLOAD_DIR: "~/Books",
      LIBGEN_MIRROR: "https://mirror.example/",
      LIBGEN_TIMEOUT_MS: "5000",
      LIBGEN_MAX_DOWNLOAD_MB: "10",
      LIBGEN_CONCURRENCY: "9",
      LIBGEN_VERIFY_MD5: "false",
    });

    expect(config.downloadDir).toMatch(/Books$/);
    expect(config.downloadDir.startsWith("~")).toBe(false);
    expect(config.mirrorOverride).toBe("https://mirror.example/");
    expect(config.timeoutMs).toBe(5000);
    expect(config.maxDownloadBytes).toBe(10 * 1024 * 1024);
    expect(config.concurrency).toBe(5);
    expect(config.verifyMd5).toBe(false);
  });

  it("clamps invalid numbers to safe defaults", () => {
    const config = loadConfig({ LIBGEN_TIMEOUT_MS: "nope", LIBGEN_CONCURRENCY: "0" });
    expect(config.timeoutMs).toBe(30_000);
    expect(config.concurrency).toBe(1);
  });
});

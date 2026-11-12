import { describe, expect, it } from "vitest";
import { LibgenError } from "../src/core/errors";
import { HttpClient } from "../src/core/http";
import { htmlResponse, recordingFetch, testConfig } from "./helpers";

describe("HttpClient", () => {
  it("sends browser-like headers so mirrors do not serve placeholder pages", async () => {
    const { fetchImpl, calls } = recordingFetch(() => htmlResponse("<html>ok</html>"));
    const client = new HttpClient(testConfig(), fetchImpl);

    await client.fetch("https://libgen.li/index.php?req=test");

    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("user-agent")).toContain("Mozilla/5.0");
    expect(headers.get("accept")).toContain("text/html");
    expect(headers.get("accept-language")).toContain("en-US");
  });

  it("honours a custom user agent", async () => {
    const { fetchImpl, calls } = recordingFetch(() => htmlResponse("ok"));
    const client = new HttpClient(testConfig({ userAgent: "my-agent/1.0" }), fetchImpl);

    await client.fetch("https://libgen.li/");

    expect(new Headers(calls[0]!.init?.headers).get("user-agent")).toBe("my-agent/1.0");
  });

  it("retries retryable statuses and then succeeds", async () => {
    let attempt = 0;
    const { fetchImpl, calls } = recordingFetch(() => {
      attempt += 1;
      return attempt === 1 ? new Response("busy", { status: 503 }) : htmlResponse("ok");
    });
    const client = new HttpClient(testConfig({ maxRetries: 1 }), fetchImpl);

    const response = await client.fetch("https://libgen.li/");
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("does not retry a 404", async () => {
    const { fetchImpl, calls } = recordingFetch(() => new Response("nope", { status: 404 }));
    const client = new HttpClient(testConfig({ maxRetries: 3 }), fetchImpl);

    const error = await client.fetch("https://libgen.li/").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(LibgenError);
    expect((error as LibgenError).code).toBe("NOT_FOUND");
    expect(calls).toHaveLength(1);
  });

  it("times out slow requests", async () => {
    const { fetchImpl } = recordingFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const client = new HttpClient(testConfig({ timeoutMs: 5 }), fetchImpl);

    const error = await client.fetch("https://libgen.li/").catch((err: unknown) => err);

    expect((error as LibgenError).code).toBe("TIMEOUT");
    expect((error as LibgenError).hint).toContain("LIBGEN_TIMEOUT_MS");
  });

  it("wraps network failures", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new TypeError("fetch failed");
    });
    const client = new HttpClient(testConfig(), fetchImpl);

    const error = await client.fetch("https://libgen.li/").catch((err: unknown) => err);

    expect((error as LibgenError).code).toBe("NETWORK");
  });
});

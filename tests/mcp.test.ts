import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpClient } from "../src/core/http";
import { LibgenClient } from "../src/libgen";
import { createServer } from "../src/mcp/server";
import { TOOLS } from "../src/mcp/tools";
import {
  DETAIL_HTML,
  HELLO_MD5,
  SEARCH_HTML,
  fileResponse,
  htmlResponse,
  recordingFetch,
  testConfig,
} from "./helpers";

let dir: string;
const closers: Array<() => Promise<void>> = [];

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "bdmcp-mcp-"));
});

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  await fsp.rm(dir, { recursive: true, force: true });
});

function defaultRoutes(url: URL) {
  if (url.pathname === "/index.php" && url.searchParams.get("req") === "libgen") {
    return htmlResponse(SEARCH_HTML);
  }
  if (url.pathname === "/index.php") return htmlResponse(SEARCH_HTML);
  if (url.pathname === "/ads.php") return htmlResponse(DETAIL_HTML);
  if (url.pathname === "/get.php") {
    return fileResponse("hello world", { filename: "hello world.pdf" });
  }
  return new Response("not found", { status: 404 });
}

async function connect(handler: Parameters<typeof recordingFetch>[0] = defaultRoutes) {
  const config = testConfig({ downloadDir: dir, mirrorOverride: "https://mirror.test/" });
  const { fetchImpl, calls } = recordingFetch(handler);
  const client = new LibgenClient(config, new HttpClient(config, fetchImpl));
  const server = createServer({ config, client });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcp = new Client({ name: "vitest", version: "1.0.0" });
  await mcp.connect(clientTransport);
  closers.push(async () => {
    await mcp.close();
    await server.close();
  });

  return { mcp, calls };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? "";
}

describe("MCP server", () => {
  it("lists all seven tools with schemas", async () => {
    const { mcp } = await connect();

    const { tools } = await mcp.listTools();

    expect(tools).toHaveLength(TOOLS.length);
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "libgen_bulk_download",
      "libgen_download",
      "libgen_get_download_url",
      "libgen_list_mirrors",
      "libgen_search",
      "libgen_set_mirror",
      "libgen_status",
    ]);
    for (const tool of tools) expect(tool.inputSchema.type).toBe("object");
  });

  it("searches and returns JSON results", async () => {
    const { mcp } = await connect();

    const result = await mcp.callTool({
      name: "libgen_search",
      arguments: { query: "art of war" },
    });
    const payload = JSON.parse(textOf(result)) as {
      query: string;
      count: number;
      results: Array<{ md5: string }>;
    };

    expect(result.isError).toBeFalsy();
    expect(payload.query).toBe("art of war");
    expect(payload.count).toBe(2);
    expect(payload.results[0]?.md5).toBe("07fa8b415fc7e4b2aa4c9ef66f0b3488");
  });

  it("downloads through the tool and reports verification", async () => {
    const { mcp } = await connect();

    const result = await mcp.callTool({
      name: "libgen_download",
      arguments: { md5: HELLO_MD5 },
    });
    const payload = JSON.parse(textOf(result)) as {
      status: string;
      filename: string;
      md5Verified: boolean;
    };

    expect(payload.status).toBe("ok");
    expect(payload.filename).toBe("hello world.pdf");
    expect(payload.md5Verified).toBe(true);
  });

  it("returns isError for failed downloads instead of throwing", async () => {
    const { mcp } = await connect((url) => {
      if (url.pathname === "/index.php") return htmlResponse(SEARCH_HTML);
      if (url.pathname === "/ads.php") return htmlResponse(DETAIL_HTML);
      return new Response("nope", { status: 500 });
    });

    const result = await mcp.callTool({
      name: "libgen_download",
      arguments: { md5: HELLO_MD5 },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result)).status).toBe("error");
  });

  it("rejects malformed md5 arguments through the schema", async () => {
    const { mcp } = await connect();

    const result = await mcp.callTool({
      name: "libgen_get_download_url",
      arguments: { md5: "not-an-md5" },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("validation error");
  });

  it("reports mirror status", async () => {
    const { mcp } = await connect();

    const result = await mcp.callTool({ name: "libgen_status", arguments: {} });
    const payload = JSON.parse(textOf(result)) as { probes: Array<{ ok: boolean }> };

    expect(payload.probes[0]?.ok).toBe(true);
  });
});

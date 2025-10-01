import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { version as pkgVersion } from "../../package.json";
import {
  ensureMirrorReady,
  getActiveMirror,
  getActiveConfig,
  setActiveMirror,
  searchBooks,
  getDirectDownloadUrlByMd5,
  downloadByMd5,
  downloadByMd5List,
} from "./libgen";

async function main() {
  const server = new Server(
    { name: "libgen-downloader-mcp", version: pkgVersion },
    { capabilities: { tools: {} } }
  );

  server.tool({
    name: "libgen.ensureMirror",
    description: "Ensures a working LibGen+ mirror is selected and returns it.",
    inputSchema: z.object({}),
    handler: async () => {
      const { mirror, config } = await ensureMirrorReady();
      return { content: [{ type: "json", value: { mirror, config } }] };
    },
  });

  server.tool({
    name: "libgen.getActiveMirror",
    description: "Returns the currently selected mirror if any.",
    inputSchema: z.object({}),
    handler: async () => {
      return { content: [{ type: "json", value: { mirror: getActiveMirror() } }] };
    },
  });

  server.tool({
    name: "libgen.setActiveMirror",
    description: "Sets the active mirror by exact URL (must exist in configuration).",
    inputSchema: z.object({ mirrorSrc: z.string() }),
    handler: async ({ mirrorSrc }) => {
      const mirror = await setActiveMirror(mirrorSrc);
      return { content: [{ type: "json", value: { mirror } }] };
    },
  });

  server.tool({
    name: "libgen.search",
    description: "Search books from LibGen+ mirrors.",
    inputSchema: z.object({
      query: z.string().min(3),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    }),
    handler: async ({ query, page, pageSize }) => {
      const results = await searchBooks(query, page || 1, pageSize);
      return { content: [{ type: "json", value: results }] };
    },
  });

  server.tool({
    name: "libgen.getDownloadUrl",
    description: "Resolve a direct download URL for a given md5.",
    inputSchema: z.object({ md5: z.string().length(32) }),
    handler: async ({ md5 }) => {
      const url = await getDirectDownloadUrlByMd5(md5);
      return { content: [{ type: "json", value: { md5, url } }] };
    },
  });

  server.tool({
    name: "libgen.download",
    description: "Download a file by md5 to the current working directory.",
    inputSchema: z.object({ md5: z.string().length(32) }),
    handler: async ({ md5 }) => {
      const outcome = await downloadByMd5(md5);
      return { content: [{ type: "json", value: outcome }] };
    },
  });

  server.tool({
    name: "libgen.bulkDownload",
    description: "Download multiple files by a list of md5 hashes.",
    inputSchema: z.object({ md5List: z.array(z.string().length(32)).min(1) }),
    handler: async ({ md5List }) => {
      const outcomes = await downloadByMd5List(md5List);
      return { content: [{ type: "json", value: outcomes }] };
    },
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("MCP server crashed", err);
  process.exit(1);
});

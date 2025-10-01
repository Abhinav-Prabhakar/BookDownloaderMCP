import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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

  // Handle list_tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "libgen.ensureMirror",
          description: "Ensures a working LibGen+ mirror is selected and returns it.",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "libgen.getActiveMirror",
          description: "Returns the currently selected mirror if any.",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        },
        {
          name: "libgen.setActiveMirror",
          description: "Sets the active mirror by exact URL (must exist in configuration).",
          inputSchema: {
            type: "object",
            properties: {
              mirrorSrc: { type: "string" }
            },
            required: ["mirrorSrc"]
          }
        },
        {
          name: "libgen.search",
          description: "Search books from LibGen+ mirrors.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", minLength: 3 },
              page: { type: "number", minimum: 1 },
              pageSize: { type: "number", minimum: 1, maximum: 100 }
            },
            required: ["query"]
          }
        },
        {
          name: "libgen.getDownloadUrl",
          description: "Resolve a direct download URL for a given md5.",
          inputSchema: {
            type: "object",
            properties: {
              md5: { type: "string", pattern: "^[a-fA-F0-9]{32}$" }
            },
            required: ["md5"]
          }
        },
        {
          name: "libgen.download",
          description: "Download a file by md5 to the current working directory.",
          inputSchema: {
            type: "object",
            properties: {
              md5: { type: "string", pattern: "^[a-fA-F0-9]{32}$" }
            },
            required: ["md5"]
          }
        },
        {
          name: "libgen.bulkDownload",
          description: "Download multiple files by a list of md5 hashes.",
          inputSchema: {
            type: "object",
            properties: {
              md5List: {
                type: "array",
                items: { type: "string", pattern: "^[a-fA-F0-9]{32}$" },
                minItems: 1
              }
            },
            required: ["md5List"]
          }
        }
      ]
    };
  });

  // Handle call_tool requests
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "libgen.ensureMirror": {
          const { mirror, config } = await ensureMirrorReady();
          return {
            content: [{ type: "text", text: JSON.stringify({ mirror, config }, null, 2) }]
          };
        }

        case "libgen.getActiveMirror": {
          const mirror = getActiveMirror();
          return {
            content: [{ type: "text", text: JSON.stringify({ mirror }, null, 2) }]
          };
        }

        case "libgen.setActiveMirror": {
          const { mirrorSrc } = args as { mirrorSrc: string };
          const mirror = await setActiveMirror(mirrorSrc);
          return {
            content: [{ type: "text", text: JSON.stringify({ mirror }, null, 2) }]
          };
        }

        case "libgen.search": {
          const { query, page, pageSize } = args as { query: string; page?: number; pageSize?: number };
          const results = await searchBooks(query, page || 1, pageSize);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
          };
        }

        case "libgen.getDownloadUrl": {
          const { md5 } = args as { md5: string };
          const url = await getDirectDownloadUrlByMd5(md5);
          return {
            content: [{ type: "text", text: JSON.stringify({ md5, url }, null, 2) }]
          };
        }

        case "libgen.download": {
          const { md5 } = args as { md5: string };
          const outcome = await downloadByMd5(md5);
          return {
            content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }]
          };
        }

        case "libgen.bulkDownload": {
          const { md5List } = args as { md5List: string[] };
          const outcomes = await downloadByMd5List(md5List);
          return {
            content: [{ type: "text", text: JSON.stringify(outcomes, null, 2) }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("MCP server crashed", err);
  process.exit(1);
});

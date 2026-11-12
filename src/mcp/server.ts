import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "../config";
import { toErrorMessage } from "../core/errors";
import { LibgenClient } from "../libgen";
import type { LibgenConfig } from "../types";
import { TOOLS, type ToolContext } from "./tools";

export const SERVER_NAME = "book-downloader-mcp";
export const VERSION = "4.0.1";

const INSTRUCTIONS = `LibGen MCP searches Library Genesis and downloads files to the machine running the server.

Workflow:
1. libgen_search with a title, author or ISBN.
2. libgen_download with the md5 of a result (or libgen_get_download_url to inspect the link first).
3. Use libgen_bulk_download for several files.

Notes:
- Downloads land in LIBGEN_DOWNLOAD_DIR (default: the server's working directory). Pass downloadDir to override per call.
- Files are verified against their LibGen md5; check the md5Verified field.
- Mirrors rotate often. If a call fails, run libgen_status, then libgen_set_mirror with a working URL.
- Only download material you are legally allowed to access.`;

export interface CreateServerOptions {
  config?: LibgenConfig;
  client?: LibgenClient;
}

function serialize(data: unknown): string {
  if (typeof data === "string") return data;
  if (data === undefined) return "null";
  return JSON.stringify(data, null, 2);
}

/** Builds a transport-agnostic MCP server around a LibgenClient. */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const client = options.client ?? new LibgenClient(config);
  const ctx: ToolContext = { client };

  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION, title: "LibGen MCP" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          idempotentHint: tool.readOnly,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async (args) => {
        try {
          const data = await tool.handler(args as Record<string, unknown>, ctx);
          return { content: [{ type: "text" as const, text: serialize(data) }] };
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${toErrorMessage(error)}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

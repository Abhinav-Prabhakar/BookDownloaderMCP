import { z } from "zod";
import type { LibgenClient } from "../libgen";

export interface ToolContext {
  client: LibgenClient;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodRawShape;
  readOnly: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

const md5Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{32}$/, "md5 must be 32 hexadecimal characters")
  .describe("LibGen md5 of the file (32 hex characters), from a search result.");

export const TOOLS: ToolDefinition[] = [
  {
    name: "libgen_search",
    title: "Search LibGen",
    description:
      "Search Library Genesis (LibGen+) for books and papers. Returns title, authors, year, language, size, extension, md5 and the detail page URL. Mirrors are discovered automatically and rotated on failure.",
    readOnly: true,
    inputSchema: {
      query: z.string().min(2).describe("Search terms, e.g. an author, title or ISBN."),
      page: z.number().int().min(1).max(100).optional().describe("Result page. Defaults to 1."),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page (1-100). Defaults to 25."),
    },
    handler: async (args, { client }) => {
      const query = String(args.query);
      const page = (args.page as number | undefined) ?? 1;
      const pageSize = (args.pageSize as number | undefined) ?? 25;
      const results = await client.search(query, page, pageSize);
      return { query, page, pageSize, count: results.length, results };
    },
  },
  {
    name: "libgen_get_download_url",
    title: "Resolve a download URL",
    description:
      "Resolve the direct download URL for an md5 without downloading. Useful for handing the link to another tool or a browser.",
    readOnly: true,
    inputSchema: { md5: md5Schema },
    handler: async (args, { client }) => {
      const md5 = String(args.md5);
      return { md5, url: await client.getDownloadUrl(md5) };
    },
  },
  {
    name: "libgen_download",
    title: "Download a book",
    description:
      "Download one file by md5. Streams to disk with a size cap, verifies the file against its LibGen md5, and never overwrites an existing file unless overwrite=true. Returns the saved path, byte count and verification result.",
    readOnly: false,
    inputSchema: {
      md5: md5Schema,
      downloadDir: z
        .string()
        .optional()
        .describe("Directory to save into. Defaults to LIBGEN_DOWNLOAD_DIR or the process cwd."),
      overwrite: z
        .boolean()
        .optional()
        .describe("Overwrite an existing file instead of adding a numeric suffix."),
      verifyMd5: z
        .boolean()
        .optional()
        .describe("Verify the downloaded file's MD5. Defaults to true."),
    },
    handler: async (args, { client }) =>
      client.download(String(args.md5), {
        downloadDir: args.downloadDir as string | undefined,
        overwrite: args.overwrite as boolean | undefined,
        verifyMd5: args.verifyMd5 as boolean | undefined,
      }),
  },
  {
    name: "libgen_bulk_download",
    title: "Download several books",
    description:
      "Download a list of md5s with bounded concurrency. Failures are reported per item; one bad md5 does not abort the batch.",
    readOnly: false,
    inputSchema: {
      md5List: z
        .array(md5Schema)
        .min(1)
        .max(20)
        .describe("Between 1 and 20 md5 hashes to download."),
      downloadDir: z.string().optional().describe("Directory to save into."),
      overwrite: z.boolean().optional().describe("Overwrite existing files."),
      concurrency: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Parallel downloads (1-5). Defaults to 2."),
    },
    handler: async (args, { client }) =>
      client.downloadMany(args.md5List as string[], {
        downloadDir: args.downloadDir as string | undefined,
        overwrite: args.overwrite as boolean | undefined,
        concurrency: args.concurrency as number | undefined,
      }),
  },
  {
    name: "libgen_list_mirrors",
    title: "List mirrors",
    description:
      "Show the configured LibGen+ mirrors, which one is active, and the configuration version.",
    readOnly: true,
    inputSchema: {},
    handler: async (_args, { client }) => client.listMirrors(),
  },
  {
    name: "libgen_set_mirror",
    title: "Set active mirror",
    description:
      "Pin a specific LibGen+ mirror for this session. The mirror is probed first, so an unreachable URL is rejected immediately.",
    readOnly: false,
    inputSchema: {
      mirrorSrc: z.url().describe("Base URL of a LibGen+ mirror, e.g. https://libgen.li/."),
    },
    handler: async (args, { client }) => {
      const mirror = await client.setMirror(String(args.mirrorSrc));
      return { mirror };
    },
  },
  {
    name: "libgen_status",
    title: "Check mirror health",
    description:
      "Probe every configured mirror with a real search request and report latency and errors. Use this when searches fail.",
    readOnly: true,
    inputSchema: {},
    handler: async (_args, { client }) => client.status(),
  },
];

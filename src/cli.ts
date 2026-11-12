#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config";
import { toErrorMessage } from "./core/errors";
import { LibgenClient } from "./libgen";
import { createServer, SERVER_NAME, VERSION } from "./mcp/server";

const HELP = `${SERVER_NAME} ${VERSION}

Usage:
  libgen-mcp [options]

Options:
  --status           Probe the configured mirrors, print a report, then exit
  --version          Print the version
  --help             Print this help

Environment:
  LIBGEN_DOWNLOAD_DIR    Where downloads are saved. Default: current directory
  LIBGEN_MIRROR          Pin a LibGen+ mirror instead of discovering one
  LIBGEN_CONFIG_URL      Override the remote mirror configuration
  LIBGEN_TIMEOUT_MS      Per-request timeout. Default: 30000
  LIBGEN_MAX_RETRIES     Retries for flaky mirrors. Default: 2
  LIBGEN_MAX_DOWNLOAD_MB Size cap per file. Default: 512
  LIBGEN_CONCURRENCY     Parallel downloads for bulk calls. Default: 2
  LIBGEN_VERIFY_MD5      Verify downloads. Default: true
  LIBGEN_USER_AGENT      User-Agent for mirror requests

Examples:
  npx -y book-downloader-mcp
  npx -y book-downloader-mcp --status
  LIBGEN_DOWNLOAD_DIR=~/Books npx -y book-downloader-mcp

Docs: https://github.com/Abhinav-Prabhakar/BookDownloaderMCP
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      status: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    console.log(VERSION);
    return;
  }

  const config = loadConfig();

  if (values.status) {
    const client = new LibgenClient(config);
    console.log(`${SERVER_NAME} ${VERSION}`);
    console.log(`  download dir: ${config.downloadDir}`);
    const { active, probes } = await client.status();
    console.log(`  active mirror: ${active?.src ?? "none"}`);
    for (const probe of probes) {
      const state = probe.ok ? "ok" : "FAILED";
      console.log(
        `  ${probe.src} — ${state} (${probe.latencyMs}ms)${probe.error ? `: ${probe.error}` : ""}`
      );
    }
    if (!probes.some((probe) => probe.ok)) process.exit(1);
    return;
  }

  const server = createServer({ config });
  await server.connect(new StdioServerTransport());
  console.error(`${SERVER_NAME} ${VERSION} running on stdio (downloads → ${config.downloadDir})`);
}

main().catch((error) => {
  console.error(`fatal: ${toErrorMessage(error)}`);
  process.exit(1);
});

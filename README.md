# Book Downloader MCP

[![npm version](https://img.shields.io/npm/v/book-downloader-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/book-downloader-mcp)
[![npm downloads](https://img.shields.io/npm/dm/book-downloader-mcp?logo=npm)](https://www.npmjs.com/package/book-downloader-mcp)
[![License: WTFPL](https://img.shields.io/badge/license-WTFPL-brightgreen.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)](package.json)

**Ask your AI for a book, get the file.**

A Model Context Protocol server for [Library Genesis](https://libgen.li) (LibGen+). Search, resolve and download ebooks from Claude, Cursor, VS Code, Windsurf, Zed or any other MCP client — with automatic mirror discovery, MD5 verification and bounded concurrency.

```
You: Find me "The Art of War" and download it.
Claude: → libgen_search(query: "the art of war")
        25 results. → libgen_download(md5: "07fa8b41…")
        Saved /Users/you/Books/The Art of War.pdf (58 MB, md5 verified).
```

---

## Contents

- [Why this server](#why-this-server)
- [Quick start](#quick-start)
- [Tools](#tools)
- [Example prompts](#example-prompts)
- [Configuration](#configuration)
- [Docker](#docker)
- [Programmatic API](#programmatic-api)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Legal](#legal)

## Why this server

- **It actually works in 2026.** LibGen+ mirrors answer non-browser user agents with a stock nginx page, so most scrapers look like the site is down. This server sends real browser headers, then verifies a mirror by running a live search rather than trusting a 200.
- **Mirrors die constantly.** Every configured mirror is probed with a real request; the warm mirror is re-probed and rotated automatically when a call fails.
- **Downloads you can trust.** Files stream to disk with a size cap, a `.part` file, and an MD5 check against the LibGen record. Existing files are never silently overwritten.
- **Safe by construction.** Filenames are sanitized (including Windows reserved names and traversal attempts), and the server refuses expired-key HTML pages instead of saving them as `.pdf`.
- **Made for agents.** Seven focused, snake_case tools with Zod-validated inputs and actionable error messages, plus a `--status` CLI probe for when a tool call fails.

## Quick start

The package runs on demand through `npx`; there is nothing to install globally.

**Claude Code**

```bash
claude mcp add libgen \
  --env LIBGEN_DOWNLOAD_DIR=~/Books \
  -- npx -y book-downloader-mcp
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "libgen": {
      "command": "npx",
      "args": ["-y", "book-downloader-mcp"],
      "env": {
        "LIBGEN_DOWNLOAD_DIR": "~/Books"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`), **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) and **Cline** use the same shape:

```json
{
  "mcpServers": {
    "libgen": {
      "command": "npx",
      "args": ["-y", "book-downloader-mcp"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "libgen": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "book-downloader-mcp"]
    }
  }
}
```

**Anything else** — the generic stdio snippet:

```json
{
  "command": "npx",
  "args": ["-y", "book-downloader-mcp"]
}
```

Check mirror health before wiring it into a client:

```bash
npx -y book-downloader-mcp --status
```

## Tools

| Tool                      | Read-only | What it does                                                                         |
| ------------------------- | :-------: | ------------------------------------------------------------------------------------ |
| `libgen_search`           |     ✓     | Search by title, author or ISBN. Returns metadata plus the md5 needed for downloads. |
| `libgen_get_download_url` |     ✓     | Resolve the direct download URL for an md5 without downloading.                      |
| `libgen_download`         |     —     | Download one file, verify its MD5, report the saved path and size.                   |
| `libgen_bulk_download`    |     —     | Download 1–20 md5s with bounded concurrency; failures are reported per item.         |
| `libgen_list_mirrors`     |     ✓     | Show configured mirrors, the active one, and the config version.                     |
| `libgen_set_mirror`       |     —     | Pin a specific LibGen+ mirror for the session (probed before use).                   |
| `libgen_status`           |     ✓     | Probe every mirror with a real search and report latency and errors.                 |

Search results carry `title`, `authors`, `publisher`, `year`, `language`, `pages`, `size`, `extension`, `md5` and `mirrorUrl`. Downloads return `status`, `path`, `filename`, `bytes` and `md5Verified`.

Set `LIBGEN_DOWNLOAD_DIR` once, or pass `downloadDir` per call. Relative paths resolve against the server's working directory.

## Example prompts

- “Search LibGen for the 3rd edition of _Computer Networks_ by Tanenbaum.”
- “Find an EPUB of _Dune_ and download the smallest result.”
- “Download these five books into ~/Research/Books.”
- “LibGen search is failing — check the mirrors and switch to a working one.”
- “Get me the direct download link for this md5, I'll use `curl`.”

## Configuration

All settings are environment variables; each has a safe default.

| Variable                 | Default                   | Description                                                                  |
| ------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| `LIBGEN_DOWNLOAD_DIR`    | process cwd               | Where downloads are saved. `~` is expanded.                                  |
| `LIBGEN_MIRROR`          | —                         | Pin a LibGen+ mirror (e.g. `https://libgen.li/`) instead of discovering one. |
| `LIBGEN_CONFIG_URL`      | upstream `config.v3.json` | Remote JSON listing the current mirrors.                                     |
| `LIBGEN_TIMEOUT_MS`      | `30000`                   | Per-request timeout.                                                         |
| `LIBGEN_MAX_RETRIES`     | `2`                       | Retries for 429/5xx/network failures, with exponential backoff.              |
| `LIBGEN_MAX_DOWNLOAD_MB` | `512`                     | Per-file size cap.                                                           |
| `LIBGEN_CONCURRENCY`     | `2`                       | Parallel downloads for bulk calls (clamped to 1–5).                          |
| `LIBGEN_VERIFY_MD5`      | `true`                    | Verify downloads against the LibGen md5.                                     |
| `LIBGEN_CONFIG_TTL_MS`   | `3600000`                 | How long to cache the mirror list.                                           |
| `LIBGEN_USER_AGENT`      | Chrome UA                 | Override the browser user agent.                                             |

CLI flags: `--status` (probe mirrors and exit), `--version`, `--help`.

## Docker

```bash
docker build -t book-downloader-mcp .

# Mount a folder so downloads persist outside the container
docker run -i --rm \
  -v "$HOME/Books:/books" \
  -e LIBGEN_DOWNLOAD_DIR=/books \
  book-downloader-mcp
```

Mount a host folder to keep downloads after the container exits; the image defaults `LIBGEN_DOWNLOAD_DIR` to `/books`.

## Programmatic API

```ts
import { LibgenClient, searchBooks, downloadByMd5, downloadByMd5List } from "book-downloader-mcp";

// One-off helpers (each creates a client)
const results = await searchBooks("the art of war", 1, 10);
const best = results.find((entry) => entry.extension === "pdf");

if (best?.md5) {
  const outcome = await downloadByMd5(best.md5, { downloadDir: "~/Books" });
  console.log(outcome.status, outcome.path, outcome.md5Verified);
}

// Reuse one client to keep the warm mirror and config cache
const client = new LibgenClient();
const status = await client.status();
const outcomes = await client.downloadMany(
  results.flatMap((entry) => (entry.md5 ? [entry.md5] : [])).slice(0, 3),
  { concurrency: 2 }
);
```

Useful exports: `LibgenClient`, `createServer`, `TOOLS`, `loadConfig`, `HttpClient`, `LibgenPlusAdapter`, `LibgenError`, `searchBooks`, `downloadByMd5`, `downloadByMd5List`.

## Development

```bash
npm install
npm run dev            # run the server from source with reload
npm test               # 50 vitest tests
npm run test:coverage
npm run typecheck
npm run lint
npm run build          # emit dist/ and .d.ts
node dist/cli.js --status
```

Project layout:

```
src/
  cli.ts               CLI entry point (stdio server, --status)
  config.ts            Environment parsing
  libgen.ts            Client: mirror discovery, search, download, bulk
  core/                HTTP (browser headers, retries), files, errors
  api/                 Mirror config, HTML parsing, LibGen+ adapter
  mcp/                 MCPServer factory and the seven tool definitions
tests/                 Adapter, HTTP, config, files, client and MCP tests
```

Pull requests are welcome. Run `npm run lint && npm test && npm run build` before opening one.

## Troubleshooting

| Symptom                                            | Fix                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| “No working LibGen mirror found”                   | Run `npx -y book-downloader-mcp --status`. If every mirror fails, set `LIBGEN_MIRROR` to a current LibGen+ URL. |
| Search returns nothing                             | Try fewer, more specific terms. LibGen+ matches titles, authors and ISBNs, not full sentences.                  |
| `The mirror returned a web page instead of a file` | The download key expired. Re-run the search and download a fresh md5.                                           |
| `md5Verified: false`                               | The mirror served a different file than the record describes. Inspect it before trusting it.                    |
| Download exceeds the size limit                    | Raise `LIBGEN_MAX_DOWNLOAD_MB` or pass a smaller result.                                                        |
| Empty `md5` in a result                            | That row has no direct file (e.g. a metadata-only record). Pick another result.                                 |

## Legal

This project only provides a client for Library Genesis mirrors operated by third parties. It does not host, mirror or distribute any content. Downloading copyrighted material without permission may be illegal where you live — you are responsible for what you download. The original project is [obsfx/libgen-downloader](https://github.com/obsfx/libgen-downloader).

## License

[WTFPL](LICENSE) © Ömercan Balandı, with maintenance by Abhinav Prabhakar.

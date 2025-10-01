# libgen-downloader + MCP Server

libgen-downloader is a Node.js/TypeScript tool for searching and downloading ebooks from LibGen mirrors. It originally provided an interactive TUI, and now also ships with a non-interactive MCP (Model Context Protocol) server so LLMs and automation can programmatically search, resolve download URLs, and download files.

Highlights
- Interactive CLI/TUI for humans
- New MCP server for LLM tool-calls (non-interactive)
- Bulk downloading and direct download by MD5
- Automatic mirror discovery for LibGen+ mirrors
- Resilient network requests with retries

Important Update
After the original libgen mirrors were blocked (see status at https://open-slum.org/), libgen-downloader now uses libgen+ mirrors as its primary source. Live mirror configuration is fetched from the configuration branch: https://github.com/obsfx/libgen-downloader/blob/configuration/config.v3.json

Installation
- Global install: npm i -g libgen-downloader
- Standalone executables: https://github.com/obsfx/libgen-cli-downloader/releases
- Node.js requirement: Node 16+ recommended

Usage (Interactive CLI)
- Start TUI: libgen-downloader
- Search from CLI: libgen-downloader -s "The Art of War"
- Bulk download by MD5 list file: libgen-downloader -b ./MD5_LIST.txt
- Print direct URL by MD5: libgen-downloader -u 1234567890abcdef1234567890abcdef
- Download by MD5: libgen-downloader -d 1234567890abcdef1234567890abcdef

Features (CLI)
- Interactive UI with React + Ink
- Non-blocking direct downloading
- Bulk downloading
- Keyboard shortcuts (e.g., J/K for navigation, Tab to queue, D to download)
- Automatic configuration fetch + dynamic mirror selection
- Retries on failed network requests

New: MCP Server (for LLMs and automation)
libgen-downloader now includes an MCP server exposing LibGen operations over stdio for LLM tool calls. This allows non-interactive environments (e.g., Claude with MCP) to search and download without a TUI.

Binary
- libgen-mcp (installed globally as part of this package)

Run locally (from a clone)
- npm run start:mcp

Run compiled (after build)
- npm run build:mcp
- libgen-mcp

Claude Desktop (example)
Add to your claude_desktop_config.json:
{
  "mcpServers": {
    "libgen": {
      "command": "libgen-mcp"
    }
  }
}
Then restart Claude Desktop. The tools below will be available to the assistant.

MCP Tools
1) libgen.ensureMirror
- Ensures configuration is fetched and a working mirror is selected
- Input: {}
- Output: { mirror, config }

2) libgen.getActiveMirror
- Returns the currently selected mirror (if any)
- Input: {}
- Output: { mirror }

3) libgen.setActiveMirror
- Manually select an active mirror by its src from config
- Input: { mirrorSrc: string }
- Output: { mirror }

4) libgen.search
- Search books on LibGen+
- Input: { query: string (min 3), page?: number = 1, pageSize?: number }
- Output: Array of entries with fields: { id, authors, title, publisher, year, pages, language, size, extension, mirror, md5?, resolvedMirrorUrl? }
  - md5 is extracted from resolvedMirrorUrl when available

5) libgen.getDownloadUrl
- Resolve a direct download URL for a given MD5
- Input: { md5: string (32 hex) }
- Output: { md5, url }

6) libgen.download
- Download a file by MD5 to the current working directory
- Input: { md5: string (32 hex) }
- Output: { md5, status: "ok" | "error", path?, filename?, total?, error? }

7) libgen.bulkDownload
- Download multiple files by a list of MD5 hashes
- Input: { md5List: string[] (each 32 hex) }
- Output: Array of outcomes like libgen.download

Notes and Behavior
- Downloads use Content-Disposition headers to derive filenames and write to the current working directory
- Network requests are retried with small delays
- Mirrors are auto-discovered from the remote configuration; you can override using libgen.setActiveMirror
- Parsing and behavior is adapted for libgen+ HTML structure

Programmatic Examples (LLM-style)
- Search: Call libgen.ensureMirror, then libgen.search with { query: "deep learning", page: 1 }
- Get direct URL: Call libgen.getDownloadUrl with { md5 }
- Download: Call libgen.download with { md5 }
- Bulk download: Call libgen.bulkDownload with a list of md5 strings

Development
- Build: npm run build
- Run TUI dev: npm start
- Run MCP dev: npm run start:mcp
- Lint: npm run lint

Architecture Overview
- TUI (React/Ink/Zustand): interactive features, pagination, queues
- Core data layer: HTML parsing (jsdom), fetch, mirror discovery, resilient attempts
- MCP server: thin wrapper exposing search and download capabilities using the same core logic

Changelog (selected)
- v3.0.0
  - libgen+ mirrors as primary source
  - Dropped search-by filtering options to maintain compatibility with libgen+
  - Dropped alternative downloads feature for now
- v2.x
  - Alternative downloads, progress indicators, cache, -s CLI search, shortcuts
- v1.x
  - Rewrote UI with React/Ink/Zustand, bulk download, improved error handling, retries

License
- WTFPL

Disclaimer
- This tool accesses third-party mirrors which may be blocked or unstable.
- Use responsibly and comply with applicable laws in your jurisdiction.

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.1] — 2026-11-12

- Point `mcpName` and the registry manifest at the correctly-cased GitHub
  namespace (`io.github.Abhinav-Prabhakar/book-downloader-mcp`); the registry
  treats the namespace as case-sensitive.
- Shorten the registry description to fit the 100-character limit.

No runtime changes.

## [4.0.0] — 2026-11-12

A full rewrite of the server. The code is now organised into small, testable
modules with one typed tool registry, and the MCP surface was redesigned.

### Added

- Seven snake_case tools: `libgen_search`, `libgen_get_download_url`,
  `libgen_download`, `libgen_bulk_download`, `libgen_list_mirrors`,
  `libgen_set_mirror`, `libgen_status`.
- MD5 verification of every completed download (`md5Verified` in the result).
- Streaming downloads with a byte cap, a `.part` file, and cleanup on failure.
- Filename sanitisation (path traversal, Windows reserved names, length cap)
  and suffix-based collision handling; `overwrite` is opt-in.
- Bounded-concurrency bulk downloads (1–5 workers, per-item error reporting).
- Mirror health checks that run a real search instead of trusting an HTTP 200,
  plus `--status` in the CLI and automatic mirror rotation on failure.
- 50 tests covering the adapter, HTTP client, config, files, client and MCP
  handshake.

### Changed

- Requests are sent with a browser `User-Agent`, `Accept` and `Accept-Language`.
  LibGen+ mirrors answer non-browser agents with a 641-byte nginx placeholder
  page, which made the server appear broken in 2026.
- The title parser now skips the series name, the `#1` edition badge and the
  ISBN block, so titles no longer come back as `War of the Orcs #1`.
- Errors are `LibgenError` instances with a code and a hint, surfaced to the
  model as one-line actionable messages.
- Requires Node.js 20 or newer; `jsdom` moved to v27, MCP SDK to 1.32.
- Dependencies are `@modelcontextprotocol/sdk`, `jsdom` and `zod` only.

### Removed

- The Groq integration and its `GROQ_API_KEY` requirement.
- Jest, `ts-jest`, `axios`, the TUI leftovers, the `.idea` project files and the
  bundled `standalone-executables` scripts.
- The dotted tool names (`libgen.search`, `libgen.download`, …). Clients get
  clear `unknown tool` errors and must migrate to the snake_case names.

## [3.0.3] — 2025-06-14

- Documentation refresh and package metadata updates.

## [3.0.2] — 2025-06

- Test coverage with mocked HTTP, MCP SDK compatibility fixes, better retries.

## [3.0.0] — 2025-05

- LibGen+ mirrors as the primary source.
- Removed search filtering for LibGen+ compatibility.

## [2.x] — 2025-03

- Alternative download sources, progress indicators, CLI search shortcuts.

## [1.x] — 2024

- Initial MCP server, bulk downloads, mirror discovery and retries.

# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Project overview

`book-downloader-mcp` is a Model Context Protocol server plus a small
programmatic API for searching and downloading ebooks from LibGen+ mirrors. It
is plain CommonJS TypeScript with no build-time framework, targeting Node 20+.

The only runtime dependencies are `@modelcontextprotocol/sdk`, `jsdom` and `zod`.

## Commands

```bash
npm install
npm run build          # tsc -> dist/ (tsconfig.build.json)
npm run typecheck      # tsc --noEmit over src + tests
npm test               # vitest run (50 tests)
npm run test:coverage  # coverage thresholds are enforced
npm run lint
npm run format
node dist/cli.js --status
```

Run `npm run lint && npm test && npm run build` before committing.

## Architecture

```
src/
  cli.ts               parseArgs wrapper; stdio server or --status report
  config.ts            env parsing (LIBGEN_* variables) with safe defaults
  libgen.ts            LibgenClient — mirror lifecycle, search, download, bulk
  core/http.ts         HttpClient: browser headers, timeouts, retries/backoff
  core/files.ts        filename sanitisation, unique paths, streaming + md5
  core/errors.ts       LibgenError with code/hint; toErrorMessage
  api/config.ts        remote mirror config + findWorkingMirror
  api/document.ts      jsdom helpers
  api/adapters/        Adapter contract + LibgenPlusAdapter (HTML parsing)
  mcp/tools.ts         the seven tool definitions (name, schema, handler)
  mcp/server.ts        transport-agnostic McpServer factory
tests/                 vitest suites + HTML fixtures
```

Data flow: `tools` -> `LibgenClient` -> `Adapter` (URLs + parsing) ->
`HttpClient` -> `libgen.li`-style mirror.

## Things to be careful about

- **User-Agent matters.** LibGen+ mirrors serve a 641-byte nginx placeholder to
  non-browser agents. Tests assert the browser headers in `core/http.ts`; do not
  remove them.
- **Probe with a real search.** A 200 on `/` proves nothing. Mirror health is
  determined by whether the response contains `tablelibgen`.
- **Do not trust the title cell.** It starts with the series name and an edition
  badge before the real title. `LibgenPlusAdapter.extractTitle` skips those.
- **Downloads are verified.** Streaming writes to `<file>.part`, enforces
  `LIBGEN_MAX_DOWNLOAD_MB`, and compares the md5. Keep the cleanup path intact.
- Tests never hit the network: they inject a `FetchLike` into `HttpClient`.
  `tests/helpers.ts` has the fixtures and `recordingFetch`.
- The npm package is `book-downloader-mcp`; the MCP registry name in
  `package.json#mcpName` must stay in sync with `server.json`.

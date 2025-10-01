# LibGen Downloader + MCP Server

A powerful Node.js/TypeScript tool for searching and downloading ebooks from LibGen mirrors, featuring a Model Context Protocol (MCP) server for seamless LLM integration.

## 🚀 Features

- **MCP Server Integration**: Enable LLMs (like Claude) to search and download books via tool calls
- **Programmatic API**: Full Node.js API for automated workflows
- **Bulk Downloads**: Download multiple books simultaneously by MD5
- **Smart Mirror Discovery**: Automatic detection and failover for LibGen+ mirrors
- **Resilient Operations**: Built-in retries and error handling for network requests
- **TypeScript Support**: Full type definitions included

## 📦 Installation

### For MCP Server (LLM Integration)
```bash
npm install -g libgen-mcp-downloader
```

### For Programmatic Use
```bash
npm install libgen-mcp-downloader
```

**Requirements**: Node.js 16+ recommended

## 🤖 MCP Server Setup

### Claude Desktop Integration

1. Install globally:
```bash
npm install -g @rovodev/libgen-mcp-server
```

2. Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "libgen": {
      "command": "libgen-mcp"
    }
  }
}
```

3. Restart Claude Desktop

The assistant will now have access to LibGen search and download capabilities!

### Other MCP Clients

Run the MCP server directly:
```bash
libgen-mcp
```

Or from source:
```bash
npm run start:mcp
```

## 💻 Programmatic Usage

### Basic Example

```javascript
const libgen = require('@rovodev/libgen-mcp-server');

async function searchAndDownload() {
  // Initialize mirror connection
  await libgen.ensureMirrorReady();
  
  // Search for books
  const results = await libgen.searchBooks('The Art of War');
  console.log(`Found ${results.length} results`);
  
  if (results.length > 0) {
    const book = results[0];
    console.log(`Downloading: ${book.title} by ${book.authors}`);
    
    // Get direct download URL
    const url = await libgen.getDirectDownloadUrlByMd5(book.md5);
    console.log(`Download URL: ${url}`);
    
    // Download the file
    const outcome = await libgen.downloadByMd5(book.md5);
    if (outcome.status === 'ok') {
      console.log(`Downloaded to: ${outcome.path}`);
    }
  }
}

searchAndDownload();
```

### TypeScript Example

```typescript
import * as libgen from '@rovodev/libgen-mcp-server';

async function bulkDownload(searchQuery: string) {
  await libgen.ensureMirrorReady();
  
  const results = await libgen.searchBooks(searchQuery, 1, 10);
  const md5List = results
    .filter(book => book.md5)
    .map(book => book.md5!)
    .slice(0, 3); // Download first 3 books
  
  const outcomes = await libgen.downloadByMd5List(md5List);
  outcomes.forEach(outcome => {
    if (outcome.status === 'ok') {
      console.log(`✓ Downloaded: ${outcome.filename}`);
    } else {
      console.log(`✗ Failed: ${outcome.error}`);
    }
  });
}
```

### API Reference

- `ensureMirrorReady()`: Initialize mirror configuration
- `searchBooks(query, page?, pageSize?)`: Search for books  
- `getDirectDownloadUrlByMd5(md5)`: Get download URL for a book
- `downloadByMd5(md5)`: Download a single book
- `downloadByMd5List(md5Array)`: Bulk download multiple books

## 🛠 MCP Tools Reference

When connected via MCP, the following tools are available to LLMs:

### Core Operations

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `libgen.ensureMirror` | Initialize and select working mirror | `{}` | `{ mirror, config }` |
| `libgen.getActiveMirror` | Get currently selected mirror | `{}` | `{ mirror }` |
| `libgen.setActiveMirror` | Manually set active mirror | `{ mirrorSrc: string }` | `{ mirror }` |

### Search & Discovery

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `libgen.search` | Search books on LibGen+ | `{ query: string, page?: number, pageSize?: number }` | Array of book entries with metadata |

**Search Result Fields**: `id`, `authors`, `title`, `publisher`, `year`, `pages`, `language`, `size`, `extension`, `mirror`, `md5`, `resolvedMirrorUrl`

### Download Operations

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `libgen.getDownloadUrl` | Get direct download URL | `{ md5: string }` | `{ md5, url }` |
| `libgen.download` | Download single file | `{ md5: string }` | `{ md5, status, path?, filename?, total?, error? }` |
| `libgen.bulkDownload` | Download multiple files | `{ md5List: string[] }` | Array of download outcomes |

### Example MCP Workflow

```javascript
// 1. Initialize
await mcp.call("libgen.ensureMirror", {});

// 2. Search
const results = await mcp.call("libgen.search", { 
  query: "machine learning", 
  page: 1 
});

// 3. Download first result
if (results.length > 0) {
  const outcome = await mcp.call("libgen.download", { 
    md5: results[0].md5 
  });
}
```

## ⚠️ Important Notes

- **Mirror Status**: LibGen mirrors can be unstable. The tool automatically discovers working mirrors from the configuration
- **File Locations**: Downloads are saved to the current working directory with original filenames
- **Network Resilience**: Built-in retries handle temporary network issues
- **LibGen+ Compatibility**: Optimized for LibGen+ mirror structure and parsing

## 🔧 Development

### Building the Project

```bash
npm run build          # Compile TypeScript
npm run build:mcp      # Build and run MCP server
npm run watch          # Watch mode for development
```

### Running Locally

```bash
npm run start:mcp      # Start MCP server in development
npm run lint           # Run ESLint
npm run format         # Format code with Prettier
```

### Testing

```bash
npm test               # Run all tests
npm run test:ci        # Run tests in CI mode
```

**Optional Integration Tests**: Set environment variables for Groq API testing:
- `GROQ_API_KEY`: Your Groq API key
- `RUN_GROQ_TESTS=1`: Enable integration tests

Create a `.env` file (gitignored) or use `.env.test` for testing. See `.env.example` for reference.

## 🏗 Architecture

- **Core Layer**: HTML parsing (jsdom), HTTP requests, mirror discovery, retry logic
- **MCP Server**: Stdio-based server exposing LibGen operations as MCP tools
- **Programmatic API**: Direct function exports for Node.js integration
- **Mirror Management**: Dynamic configuration fetching and automatic failover

## 📋 Changelog

### v3.0.2 (Current)
- ✅ Full test coverage with proper mocking
- ✅ Updated MCP SDK compatibility
- ✅ Enhanced error handling and retries
- ✅ Improved documentation and examples

### v3.0.0
- 🔄 LibGen+ mirrors as primary source
- ➖ Removed search filtering for LibGen+ compatibility
- ➖ Temporarily removed alternative downloads

### v2.x
- ➕ Alternative downloads, progress indicators
- ➕ CLI search capabilities and shortcuts
- ➕ Caching system

### v1.x
- 🔄 Complete UI rewrite with React/Ink/Zustand
- ➕ Bulk download functionality
- ✅ Enhanced error handling and retry logic

## 📄 License

**WTFPL** - Do What The F*ck You Want To Public License

## ⚖️ Legal Disclaimer

This tool accesses third-party LibGen mirrors which may be:
- Blocked or unstable in certain regions
- Subject to local laws and regulations

**Use responsibly and ensure compliance with applicable laws in your jurisdiction.**

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

**Repository**: https://github.com/obsfx/libgen-downloader

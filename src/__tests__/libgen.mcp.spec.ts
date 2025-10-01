import nock from 'nock';
import { Config } from '../api/data/config';

// Mock downloadFile to avoid file I/O in tests
jest.mock('../api/data/download', () => ({
  downloadFile: jest.fn(async () => ({ path: './sample.pdf', filename: 'sample.pdf', total: 10 }))
}));

// Mock the config fetch as well to avoid network calls
jest.mock('../api/data/config', () => ({
  fetchConfig: jest.fn(async () => ({
    latestVersion: '3.0.0',
    mirrors: [{ src: 'https://libgen.rs', type: 'libgen-plus' }],
  })),
  findMirror: jest.fn(async (mirrors: any[]) => mirrors[0]),
}));

// Import after mocks
const { searchBooks, getDirectDownloadUrlByMd5, downloadByMd5, ensureMirrorReady } = require('../mcp/libgen');

// Mock configuration fetch
const config: Config = {
  latestVersion: '3.0.0',
  mirrors: [
    { src: 'https://libgen.rs', type: 'libgen-plus' },
  ],
};

const SEARCH_HTML = `
<html><body>
  <table id="tablelibgen"><tbody>
    <tr>
      <td>
        <a>Book Title</a>
      </td>
      <td>Author One; Author Two</td>
      <td>Publisher</td>
      <td>2023</td>
      <td>EN</td>
      <td>300</td>
      <td>5 MB</td>
      <td>pdf</td>
      <td><a href="/ads.php?md5=0123456789abcdef0123456789abcdef">link</a></td>
    </tr>
  </tbody></table>
</body></html>`;

const DETAIL_HTML = `
<table id="main"><tbody>
  <tr>
    <td></td>
    <td><a href="/get.php?md5=0123456789abcdef0123456789abcdef">download</a></td>
  </tr>
</tbody></table>
`;

describe('MCP libgen functions', () => {
  beforeAll(() => {
    // search page
    nock('https://libgen.rs')
      .persist()
      .get(/\/index.php.*/)
      .reply(200, SEARCH_HTML);

    // detail page
    nock('https://libgen.rs')
      .persist()
      .get(/\/ads.php.*/)
      .reply(200, DETAIL_HTML);

    // download
    nock('https://libgen.rs')
      .persist()
      .get(/\/get.php.*/)
      .reply(200, 'file-bytes', {
        'content-disposition': 'attachment; filename="sample.pdf"',
        'content-length': '10'
      });
  });

  afterAll(() => {
    nock.cleanAll();
  });

  test('ensureMirrorReady selects a mirror', async () => {
    const { mirror, config } = await ensureMirrorReady();
    expect(mirror.src).toContain('libgen.rs');
    expect(config.mirrors.length).toBeGreaterThan(0);
  });

  test('searchBooks returns enhanced entries with md5', async () => {
    const results = await searchBooks('test', 1, 25);
    expect(results.length).toBe(1);
    expect(results[0].md5).toBe('0123456789abcdef0123456789abcdef');
    expect(results[0].resolvedMirrorUrl).toContain('/ads.php');
  });

  test('getDirectDownloadUrlByMd5 finds get.php url', async () => {
    const url = await getDirectDownloadUrlByMd5('0123456789abcdef0123456789abcdef');
    expect(url).toContain('/get.php?md5=');
  });

  test('downloadByMd5 returns ok outcome', async () => {
    const res = await downloadByMd5('0123456789abcdef0123456789abcdef');
    expect(res.status).toBe('ok');
    expect(res.filename).toBe('sample.pdf');
  }, 10000);
});

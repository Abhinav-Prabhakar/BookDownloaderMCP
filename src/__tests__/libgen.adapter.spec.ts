import { JSDOM } from 'jsdom';
import { LibgenPlusAdapter } from '../api/adapters/LibgenPlusAdapter';

describe('LibgenPlusAdapter', () => {
  const base = 'https://libgen.rs/';
  const adapter = new LibgenPlusAdapter(base);

  test('getPageURL joins base + path', () => {
    expect(adapter.getPageURL('/foo/bar')).toBe('https://libgen.rs/foo/bar');
  });

  test('getSearchURL constructs proper query', () => {
    const url = adapter.getSearchURL('deep learning', 2, 25);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://libgen.rs/index.php');
    expect(u.searchParams.get('req')).toBe('deep learning');
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('res')).toBe('25');
  });

  test('getDetailPageURL', () => {
    const url = adapter.getDetailPageURL('abcdef0123456789abcdef0123456789');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://libgen.rs/ads.php');
    expect(u.searchParams.get('md5')).toBe('abcdef0123456789abcdef0123456789');
  });

  test('getMainDownloadURLFromDocument parses anchor', () => {
    const html = `
      <table id="main"><tbody>
        <tr>
          <td></td>
          <td><a href="/get.php?md5=abcdef0123456789abcdef0123456789">download</a></td>
        </tr>
      </tbody></table>
    `;
    const doc = new JSDOM(html).window.document;
    const url = adapter.getMainDownloadURLFromDocument(doc)!;
    expect(url).toBe('https://libgen.rs/get.php?md5=abcdef0123456789abcdef0123456789');
  });

  test('parseEntries returns [] when container missing', () => {
    const doc = new JSDOM('<html><body></body></html>').window.document;
    expect(adapter.parseEntries(doc)).toEqual([]);
  });

  test('parseEntries extracts rows', () => {
    const html = `
      <table id="tablelibgen"><tbody>
        <tr>
          <td>
            <a>War and Peace</a> <nobr>ignore</nobr> <span>Vol. 1</span>
          </td>
          <td>Leo Tolstoy</td>
          <td>The Publisher</td>
          <td>1869</td>
          <td>EN</td>
          <td>1200</td>
          <td>10 MB</td>
          <td>pdf</td>
          <td><a href="/ads.php?md5=abcdabcdabcdabcdabcdabcdabcdabcd">link</a></td>
        </tr>
      </tbody></table>
    `;
    const doc = new JSDOM(html).window.document;
    const rows = adapter.parseEntries(doc)!;
    expect(rows.length).toBe(1);
    expect(rows[0].title).toContain('War and Peace');
    expect(rows[0].authors).toContain('Leo Tolstoy');
    expect(rows[0].mirror).toContain('/ads.php?md5=');
  });
});

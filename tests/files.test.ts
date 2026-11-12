import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibgenError } from "../src/core/errors";
import { md5File, sanitizeFilename, uniquePath, writeBodyToFile } from "../src/core/files";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "bdmcp-"));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe("sanitizeFilename", () => {
  it("strips paths and traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("..\\..\\windows\\system32\\cmd.exe")).toBe("cmd.exe");
    expect(sanitizeFilename("/absolute/path/book.pdf")).toBe("book.pdf");
  });

  it("replaces characters that are illegal on Windows", () => {
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.pdf')).toBe("a_b_c_d_e_f_g_h.pdf");
  });

  it("handles empty and dot-only names", () => {
    expect(sanitizeFilename("")).toBe("download");
    expect(sanitizeFilename("...")).toBe("download");
  });

  it("escapes Windows reserved device names", () => {
    expect(sanitizeFilename("CON.txt")).toBe("_CON.txt");
    expect(sanitizeFilename("nul")).toBe("_nul");
  });

  it("caps the length but keeps the extension", () => {
    const name = sanitizeFilename(`${"a".repeat(300)}.pdf`, 40);
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("uniquePath", () => {
  it("returns the original path when free", () => {
    expect(uniquePath(dir, "book.pdf")).toBe(path.join(dir, "book.pdf"));
  });

  it("adds a numeric suffix instead of overwriting", async () => {
    await fsp.writeFile(path.join(dir, "book.pdf"), "one");
    expect(uniquePath(dir, "book.pdf")).toBe(path.join(dir, "book (1).pdf"));

    await fsp.writeFile(path.join(dir, "book (1).pdf"), "two");
    expect(uniquePath(dir, "book.pdf")).toBe(path.join(dir, "book (2).pdf"));
  });

  it("overwrites when asked", async () => {
    await fsp.writeFile(path.join(dir, "book.pdf"), "one");
    expect(uniquePath(dir, "book.pdf", true)).toBe(path.join(dir, "book.pdf"));
  });
});

describe("writeBodyToFile", () => {
  function body(text: string) {
    return new Response(text).body;
  }

  it("writes the file, counts bytes and hashes it", async () => {
    const destination = path.join(dir, "out.txt");
    const result = await writeBodyToFile(body("hello world"), destination);

    expect(result.bytes).toBe(11);
    expect(result.md5).toBe(crypto.createHash("md5").update("hello world").digest("hex"));
    expect(await fsp.readFile(destination, "utf8")).toBe("hello world");
  });

  it("enforces the size limit and removes the partial file", async () => {
    const destination = path.join(dir, "big.bin");

    await expect(writeBodyToFile(body("0123456789"), destination, { maxBytes: 5 })).rejects.toThrow(
      /limit/
    );
    expect(fs.existsSync(destination)).toBe(false);
  });

  it("rejects an empty body", async () => {
    await expect(writeBodyToFile(null, path.join(dir, "x"))).rejects.toBeInstanceOf(LibgenError);
  });
});

describe("md5File", () => {
  it("hashes files from disk", async () => {
    const file = path.join(dir, "hello.txt");
    await fsp.writeFile(file, "hello world");
    expect(await md5File(file)).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
  });
});

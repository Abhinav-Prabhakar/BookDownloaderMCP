import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LibgenError } from "./errors";

const WINDOWS_RESERVED = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/** Makes an untrusted filename safe on macOS, Linux and Windows. */
export function sanitizeFilename(input: string, maxLength = 140): string {
  const base = path.basename(input.replace(/\\/g, "/"));
  let name = base
    // eslint-disable-next-line no-control-regex -- control characters are exactly what we strip
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");

  if (!name) name = "download";

  const stem = name.split(".")[0]?.toUpperCase() ?? "";
  if (WINDOWS_RESERVED.has(stem)) name = `_${name}`;

  if (name.length > maxLength) {
    const ext = path.extname(name).slice(0, 16);
    name = `${name.slice(0, Math.max(1, maxLength - ext.length))}${ext}`;
  }

  return name;
}

export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/** Returns a path that does not overwrite an existing file (unless asked to). */
export function uniquePath(dir: string, filename: string, overwrite = false): string {
  const safe = sanitizeFilename(filename);
  const target = path.join(dir, safe);
  if (overwrite || !fs.existsSync(target)) return target;

  const ext = path.extname(safe);
  const stem = ext ? safe.slice(0, -ext.length) : safe;
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(dir, `${stem} (${index})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  throw new LibgenError(`Could not find a free filename for ${safe}`, { code: "DOWNLOAD" });
}

export async function md5File(filePath: string): Promise<string> {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export interface WrittenFile {
  bytes: number;
  md5: string;
}

/**
 * Streams a fetch body to disk while hashing it, enforcing a size cap and
 * cleaning up partial files on failure.
 */
export async function writeBodyToFile(
  body: ReadableStream<Uint8Array> | null,
  destination: string,
  options: { maxBytes?: number; signal?: AbortSignal } = {}
): Promise<WrittenFile> {
  if (!body) {
    throw new LibgenError("The mirror returned an empty response body", { code: "DOWNLOAD" });
  }

  let bytes = 0;
  const hash = crypto.createHash("md5");
  const maxBytes = options.maxBytes ?? 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (maxBytes > 0 && bytes > maxBytes) {
        callback(
          new LibgenError(`Download exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`, {
            code: "DOWNLOAD",
            hint: "Raise LIBGEN_MAX_DOWNLOAD_MB if this is a legitimate file.",
          })
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  const stream = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
  try {
    await pipeline(stream, counter, fs.createWriteStream(destination, { flags: "w" }), {
      signal: options.signal,
    });
  } catch (error) {
    await fsp.rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }

  return { bytes, md5: hash.digest("hex") };
}

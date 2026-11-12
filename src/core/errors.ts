export type LibgenErrorCode =
  | "CONFIG"
  | "NETWORK"
  | "TIMEOUT"
  | "MIRROR"
  | "PARSE"
  | "NOT_FOUND"
  | "DOWNLOAD"
  | "INTEGRITY"
  | "USAGE"
  | "UNKNOWN";

export interface LibgenErrorOptions {
  code?: LibgenErrorCode;
  status?: number;
  hint?: string;
  cause?: unknown;
}

export class LibgenError extends Error {
  readonly code: LibgenErrorCode;
  readonly status?: number;
  readonly hint?: string;

  constructor(message: string, options: LibgenErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "LibgenError";
    this.code = options.code ?? "UNKNOWN";
    this.status = options.status;
    this.hint = options.hint;
  }

  toToolMessage(): string {
    return this.hint ? `${this.message} — ${this.hint}` : this.message;
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof LibgenError) return error.toToolMessage();
  if (error instanceof Error) return error.message;
  return String(error);
}

/** LibGen md5 values are 32 lowercase hex characters. */
export const MD5_PATTERN = /^[a-fA-F0-9]{32}$/;

export function assertMd5(md5: string): string {
  const value = md5.trim().toLowerCase();
  if (!MD5_PATTERN.test(value)) {
    throw new LibgenError(`"${md5}" is not a valid MD5 hash`, {
      code: "USAGE",
      hint: "LibGen md5 values are 32 hexadecimal characters, e.g. 0123456789abcdef0123456789abcdef.",
    });
  }
  return value;
}

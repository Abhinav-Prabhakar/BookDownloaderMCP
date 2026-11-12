import type { HttpClient } from "../core/http";
import { LibgenError } from "../core/errors";
import type { Config, Mirror } from "../types";

/** Used when the remote configuration cannot be fetched. */
export const FALLBACK_MIRRORS: Mirror[] = [
  { src: "https://libgen.li/", type: "libgen-plus" },
  { src: "https://libgen.vg/", type: "libgen-plus" },
  { src: "https://libgen.gl/", type: "libgen-plus" },
  { src: "https://libgen.bz/", type: "libgen-plus" },
  { src: "https://libgen.la/", type: "libgen-plus" },
];

interface RawConfig {
  latest_version?: unknown;
  mirrors?: unknown;
}

function isMirror(value: unknown): value is Mirror {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { src?: unknown; type?: unknown };
  return typeof candidate.src === "string" && candidate.type === "libgen-plus";
}

export async function fetchConfig(http: HttpClient, url: string): Promise<Config> {
  let raw: RawConfig;
  try {
    const response = await http.fetch(url);
    raw = (await response.json()) as RawConfig;
  } catch (error) {
    throw new LibgenError("Could not fetch the LibGen mirror configuration", {
      code: "CONFIG",
      hint: `Check your network, or pin a mirror with LIBGEN_MIRROR. (${url})`,
      cause: error,
    });
  }

  const mirrors = Array.isArray(raw.mirrors) ? raw.mirrors.filter(isMirror) : [];
  if (mirrors.length === 0) {
    throw new LibgenError("The LibGen mirror configuration contains no usable mirrors", {
      code: "CONFIG",
      hint: "Set LIBGEN_MIRROR to a LibGen+ URL manually.",
    });
  }

  return {
    latestVersion: typeof raw.latest_version === "string" ? raw.latest_version : "unknown",
    mirrors,
  };
}

export interface MirrorSelection {
  mirror: Mirror;
  /** Every mirror that was probed, in order. */
  probed: Array<{ src: string; ok: boolean; error?: string }>;
}

/**
 * Probes mirrors by running a tiny real search. A homepage check is not enough:
 * mirrors answer 200 with placeholder pages when their search backend is down.
 */
export async function findWorkingMirror(
  http: HttpClient,
  mirrors: Mirror[],
  options: { probeQuery?: string; timeoutMs?: number } = {}
): Promise<MirrorSelection> {
  const probeQuery = options.probeQuery ?? "libgen";
  const probed: MirrorSelection["probed"] = [];

  for (const mirror of mirrors) {
    const url = new URL("/index.php", mirror.src);
    url.searchParams.set("req", probeQuery);
    url.searchParams.set("res", "1");

    try {
      const html = await http.getText(url, { timeoutMs: options.timeoutMs });
      const usable = html.includes("tablelibgen");
      probed.push({
        src: mirror.src,
        ok: usable,
        error: usable ? undefined : "search page did not contain a results table",
      });
      if (usable) return { mirror, probed };
    } catch (error) {
      probed.push({
        src: mirror.src,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new LibgenError("No working LibGen mirror found", {
    code: "MIRROR",
    hint: "All configured mirrors failed. LibGen mirrors rotate frequently; set LIBGEN_MIRROR to a known-good LibGen+ URL.",
  });
}

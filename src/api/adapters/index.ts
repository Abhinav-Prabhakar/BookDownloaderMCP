import type { MirrorType } from "../../types";
import { Adapter } from "./Adapter";
import { LibgenPlusAdapter } from "./LibgenPlusAdapter";

export function getAdapter(mirrorURL: string, mirrorType: MirrorType): Adapter {
  switch (mirrorType) {
    case "libgen-plus":
      return new LibgenPlusAdapter(mirrorURL);
    default:
      throw new Error(`Unknown mirror type: ${String(mirrorType)}`);
  }
}

export { Adapter, LibgenPlusAdapter };

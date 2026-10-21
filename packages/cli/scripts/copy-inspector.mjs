// Bundles the built inspector next to the CLI so `engram ui` works when installed.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../../apps/inspector/dist");
const dest = join(here, "../dist/inspector");
if (!existsSync(src)) {
  console.warn("inspector not built — skipping (run `pnpm --filter @engram/inspector build`)");
} else {
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log("inspector copied to dist/inspector");
}

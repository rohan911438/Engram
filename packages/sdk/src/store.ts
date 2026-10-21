import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A JSON file written atomically (temp file + rename). */
export class JsonFile<T> {
  constructor(readonly path: string) {}

  read(): T | null {
    if (!existsSync(this.path)) return null;
    return JSON.parse(readFileSync(this.path, "utf8")) as T;
  }

  write(value: T): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

/**
 * The `.engram/` folder — Engram's local copy of the agent's mind, like `.git/`.
 *
 *   config.json          agent name, public key, namespaces
 *   agent.key            Ed25519 signing key (secret)
 *   master.key           wraps the data keys (secret)
 *   vault.json           wrapped per-episode data keys
 *   HEAD                 current commit ID
 *   objects/<kind>/<id>.json
 */
export class LocalStore {
  constructor(readonly root: string) {}

  file<T>(...parts: string[]): JsonFile<T> {
    return new JsonFile<T>(join(this.root, ...parts));
  }

  exists(): boolean {
    return existsSync(join(this.root, "config.json"));
  }

  readText(name: string): string | null {
    const p = join(this.root, name);
    return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
  }

  writeText(name: string, value: string): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(join(this.root, name), value + "\n", { mode: 0o600 });
  }

  put<T>(kind: string, id: string, value: T): void {
    this.file<T>("objects", kind, `${safe(id)}.json`).write(value);
  }

  get<T>(kind: string, id: string): T | null {
    return this.file<T>("objects", kind, `${safe(id)}.json`).read();
  }

  list<T>(kind: string): T[] {
    const dir = join(this.root, "objects", kind);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as T);
  }
}

/** Belief keys look like "b_rent@2"; '@' is fine on all platforms but be strict anyway. */
function safe(id: string): string {
  if (!/^[A-Za-z0-9_@.-]+$/.test(id)) throw new Error(`invalid object id: ${id}`);
  return id;
}

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NicheRun, RunReport } from "../shared/schema";

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function newId(now = new Date()): string {
  return `${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(2).toString("hex")}`;
}

/** One JSON file per run: <baseDir>/runs/<id>.json and <baseDir>/niches/<id>.json. */
export function createFileStore(baseDir: string) {
  const collections = {
    runs: { dir: join(baseDir, "runs"), schema: RunReport },
    niches: { dir: join(baseDir, "niches"), schema: NicheRun },
  } as const;
  type Kind = keyof typeof collections;

  async function save(kind: Kind, doc: { id: string }) {
    if (!SAFE_ID.test(doc.id)) throw new Error(`Unsafe id: ${doc.id}`);
    const { dir } = collections[kind];
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${doc.id}.json`), JSON.stringify(doc, null, 2));
  }

  async function get(kind: Kind, id: string) {
    if (!SAFE_ID.test(id)) return null; // also blocks path traversal
    const { dir, schema } = collections[kind];
    try {
      return schema.parse(JSON.parse(await readFile(join(dir, `${id}.json`), "utf8")));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async function list(kind: Kind, limit = 50) {
    const { dir } = collections[kind];
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    // Ids start with an ISO timestamp, so name order is time order.
    const ids = files.map((f) => f.slice(0, -5)).sort().reverse().slice(0, limit);
    const docs = await Promise.all(ids.map((id) => get(kind, id).catch(() => null)));
    return docs.filter((d) => d !== null);
  }

  return {
    saveRun: (r: RunReport) => save("runs", r),
    getRun: (id: string) => get("runs", id) as Promise<RunReport | null>,
    listRuns: () => list("runs") as Promise<RunReport[]>,
    saveNiche: (n: NicheRun) => save("niches", n),
    getNiche: (id: string) => get("niches", id) as Promise<NicheRun | null>,
    listNiches: () => list("niches") as Promise<NicheRun[]>,
  };
}

export type Store = ReturnType<typeof createFileStore>;

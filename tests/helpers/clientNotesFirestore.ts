import type { Firestore } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type Ref = { path: string; id: string };
type Snapshot = { id: string; ref: Ref; exists: boolean; data: () => Data | undefined };
type QueryOptions = { field?: string; direction?: string; limit?: number; before?: Snapshot; due?: number };

/** In-memory Firestore boundary for note API/worker integration tests. */
export function clientNotesFirestore() {
  const records = new Map<string, Data>();
  const writes: string[] = [];
  let tail = Promise.resolve();
  const snapshot = (ref: Ref): Snapshot => {
    const data = records.get(ref.path);
    return { id: ref.id, ref, exists: Boolean(data), data: () => data ? { ...data } : undefined };
  };
  const node = (path: string, options: QueryOptions = {}): object => ({
    path, id: path.split("/").at(-1)!,
    collection: (name: string) => node(`${path}/${name}`),
    doc: (id: string) => node(`${path}/${id}`),
    orderBy: (field: string, direction: string) => node(path, { ...options, field, direction }),
    limit: (limit: number) => node(path, { ...options, limit }),
    startAfter: (before: Snapshot) => node(path, { ...options, before }),
    where: (field: string, op: string, due: number) => {
      if (field !== "reminderAtMs" || op !== "<=") throw new Error("Unsupported test query");
      return node(path, { ...options, due });
    },
    get: async () => {
      if (path.split("/").length % 2 === 0) return snapshot(node(path) as Ref);
      let entries = [...records.entries()].filter(([key]) => key.slice(0, key.lastIndexOf("/")) === path);
      if (options.due !== undefined) entries = entries.filter(([, data]) => typeof data.reminderAtMs === "number" && data.reminderAtMs <= options.due!);
      const field = options.field ?? (options.due !== undefined ? "reminderAtMs" : "createdAtMs");
      const direction = options.direction === "desc" ? -1 : 1;
      entries.sort(([a, left], [b, right]) => direction * (Number(left[field]) - Number(right[field]) || a.localeCompare(b)));
      if (options.before) entries = entries.slice(entries.findIndex(([key]) => key === options.before!.ref.path) + 1);
      const docs = entries.slice(0, options.limit ?? Infinity).map(([key]) => snapshot(node(key) as Ref));
      return { docs, size: docs.length };
    },
  });
  const db = {
    collection: (name: string) => node(name),
    doc: (path: string) => node(path),
    runTransaction: <T>(callback: (transaction: object) => Promise<T>): Promise<T> => {
      const run = tail.then(async () => {
        const operations: (() => void)[] = [];
        const stage = (ref: Ref, operation: () => void) => { operations.push(() => { writes.push(ref.path); operation(); }); };
        const result = await callback({
          get: async (ref: Ref) => {
            if (operations.length) throw new Error("Firestore transactions must read before writing");
            return snapshot(ref);
          },
          set: (ref: Ref, data: Data) => stage(ref, () => records.set(ref.path, { ...data })),
          update: (ref: Ref, data: Data) => stage(ref, () => {
            const current = records.get(ref.path);
            if (!current) throw new Error("Cannot update a missing document");
            const next = { ...current, ...data };
            for (const key of Object.keys(next)) if (next[key] === "__delete__") delete next[key];
            records.set(ref.path, next);
          }),
          delete: (ref: Ref) => stage(ref, () => records.delete(ref.path)),
        });
        operations.forEach(operation => operation());
        return result;
      });
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as Firestore;
  return { db, records, writes };
}

import type { Firestore } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type Filter = [string, string, unknown];
export function privateFirestore() {
  const records = new Map<string, Data>();
  let sequence = 0;
  const field = (data: Data, path: string): unknown => path.split(".").reduce<unknown>((v, key) => (v as Data)?.[key], data);
  const apply = (path: string, data: Data, merge = false) => {
    const next = merge ? { ...records.get(path), ...data } : { ...data };
    for (const [key, value] of Object.entries(next)) {
      const method = (value as { methodName?: string } | null)?.methodName;
      if (method === "FieldValue.delete") delete next[key];
      if (method === "FieldValue.serverTimestamp") next[key] = new Date();
    }
    records.set(path, next);
  };
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, ref: node(path), exists: records.has(path), updateTime: new Date(), data: () => records.get(path) });
  function node(path: string, filters: Filter[] = [], max = Infinity, group = false): TestNode {
    const ref: TestNode = {
      path, id: path.split("/").at(-1)!, firestore: db,
      get parent() { return node(path.slice(0, path.lastIndexOf("/"))); },
      collection: name => node(`${path}/${name}`), doc: (id = `synthetic-auto-${++sequence}`) => node(`${path}/${id}`),
      where: (f, op, value) => node(path, [...filters, [f, op, value]], max, group),
      orderBy: () => ref, select: () => ref, limit: n => node(path, filters, n, group),
      get: async () => {
        if (!group && path.split("/").length % 2 === 0) return snapshot(path);
        const docs = [...records].filter(([key, data]) => (group ? key.split("/").at(-2) === path : key.slice(0, key.lastIndexOf("/")) === path)
          && filters.every(([f, op, value]) => op === "==" ? field(data, f) === value : op === "<=" ? Number(field(data, f)) <= Number(value) : false))
          .slice(0, max).map(([key]) => snapshot(key));
        return { docs, size: docs.length, empty: !docs.length };
      },
      set: async (data, options) => apply(path, data, options?.merge),
      update: async data => apply(path, data, true),
      delete: async () => { records.delete(path); },
    };
    return ref;
  }
  function batch() {
    const pending: (() => void)[] = [];
    return {
      get: (ref: TestNode) => ref.get(),
      set: (ref: TestNode, data: Data, opts?: { merge?: boolean }) => pending.push(() => apply(ref.path, data, opts?.merge)),
      update: (ref: TestNode, data: Data) => pending.push(() => apply(ref.path, data, true)),
      create: (ref: TestNode, data: Data) => pending.push(() => { if (records.has(ref.path)) throw new Error("Exists"); apply(ref.path, data); }),
      delete: (ref: TestNode) => pending.push(() => { records.delete(ref.path); }),
      commit: async () => { pending.forEach(write => write()); },
    };
  }
  const db = {
    collection: (name: string) => node(name), doc: (path: string) => node(path),
    collectionGroup: (name: string) => node(name, [], Infinity, true), batch,
    runTransaction: async <T>(work: (tx: ReturnType<typeof batch>) => Promise<T>) => {
      const tx = batch(); const result = await work(tx); await tx.commit(); return result;
    },
  };
  return { records, db: db as unknown as Firestore };
}

type TestNode = {
  path: string; id: string; firestore: unknown; parent: TestNode;
  collection: (name: string) => TestNode; doc: (id?: string) => TestNode;
  where: (field: string, op: string, value: unknown) => TestNode;
  orderBy: () => TestNode; select: () => TestNode; limit: (n: number) => TestNode;
  get: () => Promise<unknown>; set: (data: Data, opts?: { merge?: boolean }) => Promise<void>; update: (data: Data) => Promise<void>; delete: () => Promise<void>;
};

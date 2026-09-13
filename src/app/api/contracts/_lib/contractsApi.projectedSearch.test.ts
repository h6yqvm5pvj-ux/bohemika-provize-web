import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { parseContractListFilters } from "./contractsApi.listFilters";
import {
  canUseProjectedContractSearch, readProjectedContractSearchPage,
} from "./contractsApi.projectedSearch";
import type { ContractDoc } from "./contractsApi.types";

const ownerEmail = "owner@example.test";
const filters = (values: Record<string, string> = {}) => parseContractListFilters(
  new URLSearchParams({ q: "novak", ...values }),
);
type Entry = { id: string; data: ContractDoc };
const entry = (id: string, data: Partial<ContractDoc> = {}): Entry => ({
  id, data: { clientName: "Jan Novák", productKey: "neon", contractSignedDate: new Date("2026-09-10"), ...data },
});

function database(entries: Entry[], options: {
  hydrationError?: Error;
  queryError?: Error;
  missingReadTime?: boolean;
  missingDocument?: boolean;
  afterProjection?: () => void;
} = {}) {
  const readTime = Timestamp.fromMillis(Date.parse("2026-09-12T12:00:00Z"));
  const state = { projectedFields: [] as string[], hydrated: [] as string[], bytes: 0 };
  let atReadTime: Entry[] = [];
  const doc = (item: Entry, projection?: string[]) => ({
    id: item.id, ref: { path: `users/${ownerEmail}/entries/${item.id}` },
    exists: !options.missingDocument,
    data: () => projection ? Object.fromEntries(projection
      .filter(field => Object.hasOwn(item.data, field))
      .map(field => [field, item.data[field as keyof ContractDoc]])) : item.data,
  });
  const get = vi.fn(async () => {
    if (options.queryError) throw options.queryError;
    atReadTime = entries.map(item => ({ id: item.id, data: { ...item.data } }));
    const docs = [...atReadTime].sort((a, b) => a.id < b.id ? -1 : 1)
      .map(item => doc(item, state.projectedFields));
    state.bytes = Buffer.byteLength(JSON.stringify(docs.map(item => item.data())));
    options.afterProjection?.();
    return { docs, readTime: options.missingReadTime ? undefined : readTime };
  });
  const runTransaction = vi.fn(async (work: (transaction: unknown) => Promise<unknown>, transactionOptions: unknown) => {
    expect(transactionOptions).toEqual({ readOnly: true, readTime });
    if (options.hydrationError) throw options.hydrationError;
    return work({ getAll: async (...refs: Array<{ path: string }>) => {
      state.hydrated = refs.map(ref => ref.path.split("/").at(-1)!);
      // Return reverse order to ensure the original page ordering is preserved.
      return [...state.hydrated].reverse().map(id => doc(atReadTime.find(item => item.id === id)!));
    } });
  });
  const db = {
    collection: (name: string) => {
      expect(name).toBe("users");
      return { doc: (owner: string) => {
        expect(owner).toBe(ownerEmail);
        return { collection: (nested: string) => {
          expect(nested).toBe("entries");
          return { select: (...fields: string[]) => {
            state.projectedFields = fields;
            return { get };
          } };
        } };
      } };
    },
    runTransaction,
  } as unknown as Firestore;
  return { db, state, get, runTransaction };
}

describe("projected legacy contract search", () => {
  it("scans only search/date fields and fetches complete documents only for the page plus one", async () => {
    const entries = Array.from({ length: 300 }, (_, index) => entry(String(index).padStart(3, "0"), {
      clientName: index < 296 ? "Someone else" : "Žaneta Nováková",
      items: [{ title: "Commission", amount: 1234.56, code: "A1" }],
      note: "x".repeat(20_000),
    } as Partial<ContractDoc>));
    const { db, state } = database(entries);
    const page = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 2 });
    expect(page?.map(doc => doc.id)).toEqual(["299", "298", "297"]);
    expect(page?.[0].data()).toEqual(entries[299].data);
    expect(state.hydrated).toEqual(["299", "298", "297"]);
    expect(state.projectedFields).toEqual(["clientName", "contractNumber", "contractSignedDate", "createdAt", "productKey"]);
    expect(state.bytes).toBeLessThan(100_000);
    expect(Buffer.byteLength(JSON.stringify(entries))).toBeGreaterThan(6_000_000);
  });

  it("finds legacy compact contract numbers and Czech substrings without any stored search keys", async () => {
    const { db } = database([
      entry("name", { clientName: "Žaneta Nováková" }),
      entry("number", { clientName: "Other", contractNumber: "AB 12/34" }),
      entry("outside", { clientName: "Different", contractNumber: "ZZ999" }),
    ]);
    for (const [q, expected] of [["aneta", "name"], ["ab1234", "number"], ["12/34", "number"]]) {
      const page = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters({ q }), cursor: null, pageSize: 30 });
      expect(page?.map(doc => doc.id)).toEqual([expected]);
    }
  });

  it("preserves the date/ID cursor across equal timestamps and historical createdAt fallback", async () => {
    const ts = Date.parse("2026-09-10");
    const { db } = database([
      entry("c"), entry("b"), entry("a"),
      entry("legacy", { contractSignedDate: null, createdAt: "2026-09-09" }),
      entry("backfilled", { contractSignedDate: "2020-01-01", createdAt: "2026-09-12" }),
    ]);
    const first = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 2 });
    expect(first?.map(doc => doc.id)).toEqual(["c", "b", "a"]);
    const second = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: { ts, key: `${ownerEmail}___b` }, pageSize: 2 });
    expect(second?.map(doc => doc.id)).toEqual(["a", "legacy", "backfilled"]);
    const oldCursor = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: { ts, key: null }, pageSize: 2 });
    expect(oldCursor?.map(doc => doc.id)).toEqual(["legacy", "backfilled"]);
  });

  it("keeps undated matches after dated rows and honors signedFrom without substituting creation time", async () => {
    const { db } = database([
      entry("undated", { contractSignedDate: null }),
      entry("created", { contractSignedDate: null, createdAt: "2026-09-09" }),
      entry("old-signed", { contractSignedDate: "2020-01-01", createdAt: "2026-09-12" }),
      entry("missing-name", { clientName: null }),
      entry("missing-product", { productKey: undefined }),
    ]);
    const page = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 30 });
    expect(page?.map(doc => doc.id)).toEqual(["missing-product", "created", "old-signed", "undated"]);
    const recent = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters({ signedFrom: "2026-09-01" }), cursor: null, pageSize: 30 });
    expect(recent?.map(doc => doc.id)).toEqual(["missing-product", "created"]);
  });

  it("returns a genuine empty result without hydrating documents", async () => {
    const { db, runTransaction } = database([entry("other", { clientName: "Someone else" })]);
    expect(await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 30 })).toEqual([]);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it("uses the first query readTime when a contract changes during hydration", async () => {
    const entries = [entry("a", { total: 10 })];
    const original = { ...entries[0].data };
    const { db, runTransaction } = database(entries, {
      afterProjection: () => { entries[0].data = { clientName: "Other", total: 99 }; },
    });
    const page = await readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 30 });
    expect(page?.[0].data()).toEqual(original);
    expect(runTransaction).toHaveBeenCalledOnce();
  });

  it.each(["activeOnly", "unpaidOnly", "refreshOnly", "stornoOnly", "maturedOnly", "categories", "institutions", "commissionAudit", "mode"])("leaves the full-document path for %s filters", async key => {
    const value = ({ categories: "auto", institutions: "cpp", commissionAudit: "difference", mode: "anniversary" } as Record<string, string>)[key] ?? "1";
    const selected = filters({ [key]: value });
    const { db, get } = database([]);
    expect(canUseProjectedContractSearch(selected)).toBe(false);
    expect(await readProjectedContractSearchPage({ db, ownerEmail, filters: selected, cursor: null, pageSize: 30 })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("does not project an unfiltered list", () => {
    expect(canUseProjectedContractSearch(undefined)).toBe(false);
    expect(canUseProjectedContractSearch(filters({ q: "" }))).toBe(false);
  });

  it.each(["expired-read-time", "query-error", "missing-read-time", "missing-document"])("propagates %s for the caller's complete fallback", async failure => {
    const { db } = database([entry("a")], {
      hydrationError: failure === "expired-read-time" ? new Error("read time is too old") : undefined,
      queryError: failure === "query-error" ? new Error("query unavailable") : undefined,
      missingReadTime: failure === "missing-read-time",
      missingDocument: failure === "missing-document",
    });
    await expect(readProjectedContractSearchPage({ db, ownerEmail, filters: filters(), cursor: null, pageSize: 30 })).rejects.toThrow();
  });
});

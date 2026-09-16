import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFilteredContractPage, CONTRACT_FILTER_PROJECTION } from "./contractsApi.filteredPage";
import { CONTRACT_SEARCH_PROJECTION } from "./contractsApi.projectedSearch";
import { parseContractListFilters } from "./contractsApi.listFilters";
import type { ContractDoc } from "./contractsApi.types";

const owner = "owner@example.test";
type RecordItem = { id: string; owner: string; data: ContractDoc };
const record = (id: string, data: Partial<ContractDoc> = {}, user = owner): RecordItem => ({ id, owner: user, data: {
  clientName: "Jan Novák", productKey: "cppAuto", paid: true, contractSignedDate: "2026-09-10", policyStartDate: "2025-09-20", ...data,
} });
function database(records: RecordItem[], failOwner?: string) {
  const state = { owners: [] as string[], fields: [] as string[][], hydrated: [] as string[] };
  const readTime = Timestamp.fromMillis(Date.parse("2026-09-13"));
  const doc = (item: RecordItem, fields?: readonly string[]) => ({ id: item.id, exists: true,
    ref: { path: `users/${item.owner}/entries/${item.id}` },
    data: () => fields ? Object.fromEntries(fields.filter(key => key in item.data).map(key => [key, item.data[key as keyof ContractDoc]])) : item.data,
  });
  const db = { collection: () => ({ doc: (email: string) => ({ collection: () => {
    const get = async (fields?: string[]) => {
      state.owners.push(email); if (email === failOwner) throw new Error("Read failed");
      return { docs: records.filter(item => item.owner === email).map(item => doc(item, fields)), readTime };
    };
    return { get: () => get(), select: (...fields: string[]) => { state.fields.push(fields); return { get: () => get(fields) }; } };
  } }) }), runTransaction: async (fn: (transaction: unknown) => Promise<unknown>, options: unknown) => {
    expect(options).toEqual({ readOnly: true, readTime });
    return fn({ getAll: async (...refs: { path: string }[]) => refs.reverse().map(ref => {
      state.hydrated.push(ref.path); return doc(records.find(item => `users/${item.owner}/entries/${item.id}` === ref.path)!);
    }) });
  } } as unknown as Firestore;
  return { db, state };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
const filter = (values: Record<string, string>) => parseContractListFilters(new URLSearchParams(values));

describe("complete filtered contract pagination", () => {
  it("finds old team search matches beyond the first 1,500 records without search indexes", async () => {
    const second = "second@example.test";
    const records = Array.from({ length: 1600 }, (_, i) => record(String(i), { clientName: "Jana Černá" }));
    records.push(record("old-match", { clientName: "Žaneta Nováková", contractSignedDate: "2020-01-01" }, second));
    const { db, state } = database(records);
    const matches = await readFilteredContractPage({ db, owners: [owner, second], filters: filter({ q: "novakova zaneta" }), cursor: null, pageSize: 20 });
    expect(matches.map(item => item.doc.id)).toEqual(["old-match"]);
    expect(state.hydrated).toEqual([`users/${second}/entries/old-match`]);
    expect(state.fields).toEqual([[...CONTRACT_SEARCH_PROJECTION], [...CONTRACT_SEARCH_PROJECTION]]);
  });

  it("finds historical signing positions beyond the first page and preserves pagination", async () => {
    const records = Array.from({ length: 1500 }, (_, i) => record(String(i), { position: "poradce5" }));
    records.push(record("old-b", { position: "poradce2", contractSignedDate: "2020-01-01" }),
      record("old-a", { position: "manazer4", contractSignedDate: "2020-01-01" }), record("missing"));
    const { db } = database(records);
    const filters = filter({ positions: "poradce2,manazer4" });
    const first = await readFilteredContractPage({ db, owners: [owner], filters, cursor: null, pageSize: 1 });
    expect(first.map(item => item.doc.id)).toEqual(["old-b", "old-a"]);
    const next = await readFilteredContractPage({ db, owners: [owner], filters, cursor: { ts: Date.parse("2020-01-01"), key: `${owner}___old-b` }, pageSize: 1 });
    expect(next.map(item => item.doc.id)).toEqual(["old-a"]);
  });

  it("finds a legacy unpaid replacement older than 1,500 non-matching rows", async () => {
    const records = Array.from({ length: 1500 }, (_, index) => record(String(index)));
    records.push(record("legacy-match", { paid: undefined, isRefresh: true, contractSignedDate: "2020-01-01", note: "Full document" }));
    const { db, state } = database(records);
    const matches = await readFilteredContractPage({ db, owners: [owner], filters: filter({ unpaidOnly: "1", refreshOnly: "1", categories: "auto", institutions: "cpp" }), cursor: null, pageSize: 20 });
    expect(matches.map(item => item.doc.id)).toEqual(["legacy-match"]);
    expect(matches[0].doc.data()?.note).toBe("Full document");
    expect(state.fields).toEqual([[...CONTRACT_FILTER_PROJECTION]]);
    expect(state.hydrated).toHaveLength(1);
  });

  it("finds dynamically matured records even with a stale active index", async () => {
    const { db } = database([record("matured", { lifecycleStatus: "active", policyEndDate: "2026-09-12" }), record("active")]);
    expect((await readFilteredContractPage({ db, owners: [owner], filters: filter({ maturedOnly: "1" }), cursor: null, pageSize: 20 })).map(item => item.doc.id)).toEqual(["matured"]);
  });

  it("applies multi-owner filters before taking page plus one and never reads unselected owners", async () => {
    const second = "second@example.test";
    const { db, state } = database([record("a", { paid: false }), record("b", { paid: false }), record("c", { paid: false }, second), record("private", { paid: false }, "unselected@example.test")]);
    const selected = filter({ unpaidOnly: "1", institutions: "cpp" });
    const first = await readFilteredContractPage({ db, owners: [owner, second], filters: selected, cursor: null, pageSize: 1 });
    expect(first.map(item => item.doc.id)).toEqual(["c", "b"]);
    const next = await readFilteredContractPage({ db, owners: [owner, second], filters: selected, cursor: { ts: Date.parse("2026-09-10"), key: `${second}___c` }, pageSize: 1 });
    expect(next.map(item => item.doc.id)).toEqual(["b", "a"]);
    expect(new Set(state.owners)).toEqual(new Set([owner, second]));
  });

  it("combines anniversary with search and excludes new or ended policies", async () => {
    const { db } = database([record("match"), record("new", { policyStartDate: "2026-09-20" }), record("storno", { status: "storno" }), record("name", { clientName: "Other" })]);
    expect((await readFilteredContractPage({ db, owners: [owner], filters: filter({ mode: "anniversary", q: "novak" }), cursor: null, pageSize: 20 })).map(item => item.doc.id)).toEqual(["match"]);
  });

  it("retains full commission inputs and filters differences before pagination", async () => {
    const { db, state } = database([record("normal"), record("difference", { commissionPayouts: [{ key: "difference", code: "A101", amount: 10, expectedAmount: 100, difference: -90, status: "difference" }] })]);
    const matches = await readFilteredContractPage({ db, owners: [owner], filters: filter({ commissionAudit: "difference", commissionCode: "a101" }), cursor: null, pageSize: 1 });
    expect(matches.map(item => item.doc.id)).toEqual(["difference"]); expect(state.fields).toEqual([]); expect(state.hydrated).toEqual([]);
  });

  it("fails instead of silently returning an incomplete team result", async () => {
    const { db } = database([record("one")], "broken@example.test");
    await expect(readFilteredContractPage({ db, owners: [owner, "broken@example.test"], filters: filter({ activeOnly: "1" }), cursor: null, pageSize: 20 })).rejects.toThrow("Read failed");
  });
});

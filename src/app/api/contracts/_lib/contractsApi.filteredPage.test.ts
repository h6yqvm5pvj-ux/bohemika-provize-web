import { PDF_FIELDS } from "./contractsApi.withoutPdf";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFilteredContractPage as readPage, CONTRACT_FILTER_PROJECTION } from "./contractsApi.filteredPage";
import { CONTRACT_SEARCH_PROJECTION } from "./contractsApi.projectedSearch";
import { parseContractListFilters } from "./contractsApi.listFilters";
import type { ContractDoc } from "./contractsApi.types";

const owner = "owner@example.test";
const readFilteredContractPage = (options: Omit<Parameters<typeof readPage>[0], "viewer">) =>
  readPage({ ...options, viewer: { viewerEmail: owner, teamEmails: [] } }).then(result => result.matches);
type RecordItem = { id: string; owner: string; data: ContractDoc };
const record = (id: string, data: Partial<ContractDoc> = {}, user = owner): RecordItem => ({ id, owner: user, data: {
  clientName: "Jan Novák", productKey: "cppAuto", paid: true, contractSignedDate: "2026-09-10", policyStartDate: "2025-09-20", ...data,
} });
function database(records: RecordItem[], failOwner?: string) {
  const state = { owners: [] as string[], fields: [] as string[][], hydrated: [] as string[], projectedReads: 0 };
  const readTime = Timestamp.fromMillis(Date.parse("2026-09-13"));
  const doc = (item: RecordItem, fields?: readonly string[]) => ({ id: item.id, exists: true,
    ref: { path: `users/${item.owner}/entries/${item.id}` },
    data: () => fields ? Object.fromEntries(fields.filter(key => key in item.data).map(key => [key, item.data[key as keyof ContractDoc]])) : item.data,
  });
  const stored = new Map<string, Record<string, unknown>>();
  const cacheRef = (path: string): any => ({ path, get: async () => ({ data: () => stored.get(path), readTime }),
    collection: (name: string) => ({ doc: (id: string) => cacheRef(`${path}/${name}/${id}`) }) });
  const db = { collection: (name: string) => name === "hallOfFameOwners" ? { doc: (id: string) => cacheRef(id) } : ({ doc: (email: string) => ({ collection: () => {
    const query = (matches: (item: RecordItem) => boolean) => {
      const get = async (fields?: string[]) => {
        state.owners.push(email); if (email === failOwner) throw new Error("Read failed");
        const docs = records.filter(item => item.owner === email && matches(item)).map(item => doc(item, fields));
        state.projectedReads += docs.length;
        return { docs, readTime };
      };
      return {
        get: () => get(),
        select: (...fields: string[]) => { state.fields.push(fields); return { get: () => get(fields) }; },
      };
    };
    return {
      ...query(() => true),
      doc: (id: string) => ({ path: `users/${email}/entries/${id}` }),
      where: (key: keyof ContractDoc, operator: "==" | "in", value: string | string[]) =>
        query(item => operator === "==" ? item.data[key] === value : (value as string[]).includes(item.data[key] as string)),
    };
  } }) }), runTransaction: async (fn: (transaction: unknown) => Promise<unknown>, options: unknown) => {
    if (!(options as { readTime?: unknown })?.readTime) return fn({
      getAll: (...refs: ReturnType<typeof cacheRef>[]) => Promise.all(refs.map(ref => ref.get())),
      get: (query: { get: () => unknown }) => query.get(),
      set: (ref: { path: string }, data: Record<string, unknown>) => stored.set(ref.path, data),
      delete: (ref: { path: string }) => stored.delete(ref.path),
    });
    expect(options).toEqual({ readOnly: true, readTime });
    return fn({ getAll: async (...refs: { path: string }[]) => refs.filter(ref => ref.path).reverse().map(ref => {
      state.hydrated.push(ref.path); return doc(records.find(item => `users/${item.owner}/entries/${item.id}` === ref.path)!);
    }) });
  } } as unknown as Firestore;
  return { db, state };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
const filter = (values: Record<string, string>) => parseContractListFilters(new URLSearchParams(values));

describe("complete filtered contract pagination", () => {
  it.each([{}, { activeOnly: "1" }, { withoutPdfOnly: "1" }])("limits plate search to the selected portfolios with %o", async options => {
    const teamOwner = "team@example.test";
    const outside = "outside@example.test";
    const { db, state } = database([
      record("own", { carPlate: "1AB 2345" }),
      record("team", { carPlate: "1AB2345" }, teamOwner),
      record("outside", { carPlate: "1AB2345" }, outside),
    ]);
    const params = new URLSearchParams({ q: "1ab-2345" });
    for (const [key, value] of Object.entries(options)) params.set(key, value);
    const filters = parseContractListFilters(params, { searchVehiclePlate: true });
    const rows = await readFilteredContractPage({ db, owners: [owner, teamOwner], filters, cursor: null, pageSize: 10 });
    expect(rows.map(row => row.doc.id).sort()).toEqual(["own", "team"]);
    expect(state.owners).not.toContain(outside);
  });

  it("reads only matching original contract numbers and preserves exact formatting and pagination on legacy records", async () => {
    const number = "TEST-004/X";
    const unrelatedOwner = "private@example.test";
    const { db, state } = database([
      ...Array.from({ length: 1200 }, (_, i) => record(`unrelated-${i}`, { contractNumber: String(i) })),
      record("a", { contractNumber: number }),
      record("b", { contractNumber: number }),
      record("other-format", { contractNumber: "test004x" }),
      record("private", { contractNumber: number }, unrelatedOwner),
    ]);
    const options = { db, owners: [owner], filters: filter({ q: `=${number}` }), pageSize: 1 };
    const first = await readFilteredContractPage({ ...options, cursor: null });
    expect(first.map(item => item.doc.id)).toEqual(["b", "a"]);
    expect(state.projectedReads).toBe(2);
    const second = await readFilteredContractPage({ ...options, cursor: { ts: first[0].ts!, key: `${owner}___b` } });
    expect(second.map(item => item.doc.id)).toEqual(["a"]);
    expect(state.owners).toEqual([owner, owner]);
  });

  it("counts missing storno estimates across pages and distinguishes zero and a linked payment without usable timing", async () => {
    const storno = { productKey: "flexi", status: "storno", stornoDate: "2026-09-11", policyStartDate: "2025-01-01" } as const;
    const payment = { code: "A101", amount: 1000, status: "paid", statementDate: "2025-03-01", writtenBy: owner };
    const foreign = "foreign@example.test";
    const { db, state } = database([
      record("a", { ...storno, commissionPayouts: [{ ...payment, writtenBy: foreign }] }),
      record("b", { ...storno, commissionPayouts: [{ ...payment, statementDate: "2026-09-30" }] }),
      record("past", { ...storno, policyStartDate: "2019-01-01", commissionPayouts: [{ ...payment, statementDate: "2019-02-01" }] }),
      record("estimated", { ...storno, commissionPayouts: [payment] }),
      record("active"), record("foreign", storno, foreign),
    ]);
    const options = { db, owners: [owner, foreign], filters: filter({ commissionAudit: "missing_storno_estimate" }),
      viewer: { viewerEmail: owner, teamEmails: [] }, pageSize: 1 };
    const first = await readPage({ ...options, cursor: null });
    expect(first.totalCount).toBe(2);
    expect(first.matches.map(match => [match.doc.id, match.stornoEstimateIssue])).toEqual([
      ["b", "payout_date"], ["a", "missing_payout"],
    ]);
    const second = await readPage({ ...options, cursor: { ts: Date.parse("2026-09-10"), key: `${owner}___b` } });
    expect(second.totalCount).toBe(2);
    expect(second.matches.map(match => match.doc.id)).toEqual(["a"]);
    expect(state.owners).toEqual([owner, owner]);
    expect(state.hydrated).not.toContain(`users/${owner}/entries/active`);
  });

  it("filters by PDF attachment before pagination and projects only attachment metadata needed for the check", async () => {
    const records = Array.from({ length: 1500 }, (_, i) => record(String(i), {
      contractPdfAttachment: { kind: "contractPdf", storagePath: `private/${i}.pdf`, contentType: "application/pdf" },
    }));
    records.push(record("old-without-pdf", { contractSignedDate: "2020-01-01" }));
    const { db, state } = database(records);
    const matches = await readFilteredContractPage({ db, owners: [owner], filters: filter({ withoutPdfOnly: "1" }), cursor: null, pageSize: 1 });
    expect(matches.map(item => item.doc.id)).toEqual(["old-without-pdf"]);
    expect(state.fields).toEqual([[...PDF_FIELDS]]);
    expect(PDF_FIELDS).toContain("contractPdfAttachment");
  });

  it("treats a PDF on a linked endorsement as an attachment on the displayed contract family", async () => {
    const records = [
      record("root", { contractNumber: "POLICY-1", entryType: "contract" }),
      record("endorsement", {
        contractNumber: "POLICY-1",
        entryType: "endorsement",
        rootContractEntryId: "root",
        contractPdfAttachment: { contentType: "application/pdf", storagePath: "private/endorsement.pdf" },
      }),
    ];
    const { db, state } = database(records);
    const matches = await readFilteredContractPage({
      db,
      owners: [owner],
      filters: filter({ withoutPdfOnly: "1" }),
      cursor: null,
      pageSize: 20,
    });

    expect(matches).toEqual([]);
    expect(PDF_FIELDS).toContain("entryType");
    expect(PDF_FIELDS).toContain("rootContractEntryId");
    expect(state.fields).toEqual([[...PDF_FIELDS]]);
  });

  it("applies combined PDF and name filters before limiting results, only within the selected portfolios", async () => {
    const other = "second@example.test";
    const outside = "outside@example.test";
    const rows = Array.from({ length: 60 }, (_, i) => record(String(i), { clientName: "Synthetic Other" }));
    const { db, state } = database([...rows, record("a", { clientName: "Synthetic Match" }),
      record("b", { clientName: "Synthetic Match" }, other), record("foreign", { clientName: "Synthetic Match" }, outside)]);
    const options = { db, owners: [owner, other], filters: filter({ withoutPdfOnly: "1", q: "match" }), pageSize: 1 };
    const first = await readFilteredContractPage({ ...options, cursor: null });
    expect(first.map(row => row.doc.id)).toEqual(["b", "a"]);
    const second = await readFilteredContractPage({ ...options, cursor: { ts: first[0].ts!, key: `${other}___b` } });
    expect(second.map(row => row.doc.id)).toEqual(["a"]);
    expect(state.hydrated.some(path => path.includes(outside))).toBe(false);
  });

  it("finds commission-ended contracts beyond 1,500 rows, paginates and reads only authorized owners", async () => {
    const historical = { productKey: "domex" as const, contractSignedDate: "2020-01-01", policyStartDate: "2020-02-01" };
    const records = Array.from({ length: 1500 }, (_, i) => record(String(i)));
    records.push(record("old-b", historical), record("old-a", historical),
      record("still-earning", { ...historical, contractSignedDate: "2023-06-01", policyStartDate: "2023-07-01" }),
      record("private", historical, "unselected@example.test"));
    const { db, state } = database(records);
    const filters = filter({ commissionEndedOnly: "1", q: "novak" });
    const first = await readFilteredContractPage({ db, owners: [owner], filters, cursor: null, pageSize: 1 });
    expect(first.map(item => item.doc.id)).toEqual(["old-b", "old-a"]);
    const next = await readFilteredContractPage({ db, owners: [owner], filters, cursor: { ts: Date.parse("2020-01-01"), key: `${owner}___old-b` }, pageSize: 1 });
    expect(next.map(item => item.doc.id)).toEqual(["old-a"]);
    expect(new Set(state.owners)).toEqual(new Set([owner]));
    expect(state.fields).toEqual([[...CONTRACT_FILTER_PROJECTION], [...CONTRACT_FILTER_PROJECTION]]);
  });

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
    const { db, state } = database(records);
    const filters = filter({ positions: "poradce2,manazer4" });
    const first = await readFilteredContractPage({ db, owners: [owner], filters, cursor: null, pageSize: 1 });
    expect(first.map(item => item.doc.id)).toEqual(["old-b", "old-a"]);
    const next = await readFilteredContractPage({ db, owners: [owner], filters, cursor: { ts: Date.parse("2020-01-01"), key: `${owner}___old-b` }, pageSize: 1 });
    expect(next.map(item => item.doc.id)).toEqual(["old-a"]);
    expect(state.projectedReads).toBe(4);
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
    const { db, state } = database([record("normal"), record("difference", { commissionPayouts: [{ key: "difference", code: "A101", amount: 10, expectedAmount: 100, difference: -90, status: "difference", writtenBy: owner }] })]);
    const matches = await readFilteredContractPage({ db, owners: [owner], filters: filter({ commissionAudit: "difference", commissionCode: "a101" }), cursor: null, pageSize: 1 });
    expect(matches.map(item => item.doc.id)).toEqual(["difference"]); expect(state.fields).toEqual([]); expect(state.hydrated).toEqual([]);
  });

  it("fails instead of silently returning an incomplete team result", async () => {
    const { db } = database([record("one")], "broken@example.test");
    await expect(readFilteredContractPage({ db, owners: [owner, "broken@example.test"], filters: filter({ activeOnly: "1" }), cursor: null, pageSize: 20 })).rejects.toThrow("Read failed");
  });
});

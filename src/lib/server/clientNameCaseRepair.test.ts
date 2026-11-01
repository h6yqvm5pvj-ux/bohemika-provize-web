import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { clientSlugForName } from "@/app/_klienti/clientIdentity";
import {
  applyClientNameCaseRepair, planClientNameCaseRepairs,
  type ClientNameCaseRepairPlan, type ClientNameCaseRepairSource,
} from "./clientNameCaseRepair";

const mocks = vi.hoisted(() => ({
  history: vi.fn((...args: [unknown, unknown, unknown, Record<string, unknown>, unknown]) => ({ ...args[3], contractHistoryId: "preserved-history" })),
}));
vi.mock("./contractHistory", () => ({ withContractHistory: mocks.history }));

const owner = "owner@example.test";
const source = (id: string, clientName: unknown, extra: Partial<ClientNameCaseRepairSource> = {}): ClientNameCaseRepairSource => ({
  path: `users/${owner}/entries/${id}`, clientName, ...extra,
});
const personPlan = (): ClientNameCaseRepairPlan => ({
  path: source("upper", "").path, beforeName: "MIROSLAV HRUŠKA", clientName: "Miroslav Hruška",
  clientSlug: clientSlugForName("Miroslav Hruška")!,
});
const doc = vi.fn((path: string) => ({ path }));
const get = vi.fn(), update = vi.fn();
const transaction = { get, update };
const runTransaction = vi.fn(async (work: (tx: typeof transaction) => unknown) => work(transaction));
const db = { doc, runTransaction } as unknown as Firestore;
const stored = (patch: Record<string, unknown> = {}, path = personPlan().path) => ({
  exists: true, ref: { path },
  data: () => ({ clientName: "MIROSLAV HRUŠKA", entryType: "contract", userEmail: owner,
    productKey: "neon", contractNumber: "ABC123", contractSignedDate: new Date("2026-10-01T00:00:00Z"),
    note: "Keep this private note", paid: true, ...patch }),
});

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(stored());
});

describe("client name casing repair planning", () => {
  it("plans only changed personal variants within the same owner and preserves card IDs", () => {
    expect(planClientNameCaseRepairs([
      source("upper", "MIROSLAV HRUŠKA"), source("normal", "Miroslav Hruška"),
      source("lower", "miroslav hruška"), source("alone", "JAN NOVÁK"),
    ])).toEqual([{ ...personPlan(), path: source("lower", "").path, beforeName: "miroslav hruška" }, personPlan()]);
  });

  it("does not combine owners, accents, different word orders or titles", () => {
    expect(planClientNameCaseRepairs([
      source("upper", "MIROSLAV HRUŠKA"), source("other", "Miroslav Hruška", { path: "users/other@example.test/entries/other" }),
      source("accent", "Miroslav Hruska"), source("order", "Hruška Miroslav"), source("title", "Ing. Miroslav Hruška"),
    ])).toEqual([]);
  });

  it("leaves company spelling and incomplete legal suffixes unchanged", () => {
    expect(planClientNameCaseRepairs([
      source("firm1", "PEMI Cars s.r.o."), source("firm2", "Pemi Cars s.r.o."),
      source("firm3", "PARKETT s.r Woody"), source("firm4", "Parkett s.r Woody"),
      source("firm5", "ABC SERVIS a.s."), source("firm6", "ABC Servis a.s."),
    ])).toEqual([]);
  });

  it("ignores invalid sources, endorsements and duplicate snapshots", () => {
    expect(planClientNameCaseRepairs([
      source("upper", "MIROSLAV HRUŠKA"), source("upper", "MIROSLAV HRUŠKA"),
      source("endorsement", "Miroslav Hruška", { entryType: "endorsement" }),
      source("unknown-type", "Miroslav Hruška", { entryType: "other" }),
      source("invalid-path", "Miroslav Hruška", { path: "clientContractLinks/normal" }),
      source("control", "Miroslav\nHruška"), source("empty", " "), source("object", { name: "Miroslav Hruška" }),
    ])).toEqual([]);
    expect(planClientNameCaseRepairs([
      source("same", "MIROSLAV HRUŠKA"), source("same", "Miroslav Hruška"),
    ])).toEqual([]);
  });

  it("compares NFC and spacing without scheduling whitespace-only edits", () => {
    expect(planClientNameCaseRepairs([
      source("upper", "MIROSLAV HRUS\u030cKA"), source("normal", "Miroslav  Hruška"),
    ])).toEqual([{ ...personPlan(), beforeName: "MIROSLAV HRUS\u030cKA" }]);
    expect(planClientNameCaseRepairs([source("a", "Miroslav Hruška"), source("b", " Miroslav  Hruška ")])).toEqual([]);
  });
});

describe("transactional client name casing repair", () => {
  it.each([
    { path: "users/owner@example.test/entries/../other" },
    { path: "users/owner@example.test/entries/.." },
    { path: "users/owner@example.test/entries/%2fother" },
    { path: "clientCardsPrivate/uid/cards/card" },
    { path: "users/ owner@example.test/entries/upper" },
    { path: "users/owner\u0000@example.test/entries/upper" },
    { clientName: "Miroslav Hruska" },
    { clientName: "Hruška Miroslav" },
    { clientName: "Ing. Miroslav Hruška" },
    { clientSlug: clientSlugForName("Jana Nová") },
    { beforeName: "Jana Nová" },
    { clientName: "MIROSLAV HRUŠKA" },
    { ownerEmail: "other@example.test" },
  ])("rejects a manipulated plan before any database access (%j)", async patch => {
    await expect(applyClientNameCaseRepair(db, { ...personPlan(), ...patch } as ClientNameCaseRepairPlan, null)).rejects.toThrow("Invalid client name repair plan");
    expect(doc).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a forged company rename even when its case-insensitive slug is unchanged", async () => {
    await expect(applyClientNameCaseRepair(db, {
      ...personPlan(), beforeName: "PEMI Cars s.r.o.", clientName: "Pemi Cars s.r.o.",
      clientSlug: clientSlugForName("PEMI Cars s.r.o.")!,
    }, null)).rejects.toThrow("Invalid client name repair plan");
    expect(doc).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects invalid actor metadata before database access", async () => {
    await expect(applyClientNameCaseRepair(db, personPlan(), "bad\nactor")).rejects.toThrow("Invalid client name repair plan");
    await expect(applyClientNameCaseRepair(db, personPlan(), "operator\u0000@example.test")).rejects.toThrow("Invalid client name repair plan");
    expect(doc).not.toHaveBeenCalled();
  });

  it("updates the existing contract with rebuilt indexes and history in the same transaction", async () => {
    expect(await applyClientNameCaseRepair(db, personPlan(), null)).toBe("updated");
    expect(doc).toHaveBeenCalledExactlyOnceWith(personPlan().path);
    expect(get).toHaveBeenCalledExactlyOnceWith({ path: personPlan().path });
    expect(mocks.history).toHaveBeenCalledWith(transaction, { path: personPlan().path }, expect.objectContaining({ clientName: personPlan().beforeName, note: "Keep this private note", paid: true }), expect.objectContaining({
      clientName: "Miroslav Hruška", duplicateLookupKey: "neon___miroslav hruška___2026-10-01",
      clientSearchKeys: expect.arrayContaining(["miroslav", "hruska"]), contractNumberSearchKeys: expect.arrayContaining(["abc123"]),
    }), { actorEmail: null, title: "Sjednocení zápisu jména klienta" });
    expect(update).toHaveBeenCalledExactlyOnceWith({ path: personPlan().path }, expect.objectContaining({ clientName: "Miroslav Hruška", contractHistoryId: "preserved-history" }));
    const patch = update.mock.calls[0][1];
    for (const untouched of ["userEmail", "note", "paid", "contractNumber", "productKey"]) expect(patch).not.toHaveProperty(untouched);
  });

  it("supports legacy contracts without an explicit owner field or entry type", async () => {
    get.mockResolvedValue(stored({ userEmail: undefined, entryType: undefined }));
    expect(await applyClientNameCaseRepair(db, personPlan(), "Operator@Example.Test")).toBe("updated");
    expect(mocks.history.mock.calls[0][4]).toMatchObject({ actorEmail: "operator@example.test" });
  });

  it.each([
    { clientName: "miroslav hruška" },
    { clientName: "Miroslav Hruska" },
    { clientName: "Ing. MIROSLAV HRUŠKA" },
    { clientName: "MIROSLAV HRUŠKA " },
    { entryType: "endorsement" },
    { entryType: "other" },
    { userEmail: "other@example.test" },
  ])("preserves a concurrently edited or transferred contract (%j)", async patch => {
    get.mockResolvedValue(stored(patch));
    expect(await applyClientNameCaseRepair(db, personPlan(), null)).toBe("stale");
    expect(update).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("does not recreate a deleted document or write through a mismatched reference", async () => {
    for (const snapshot of [{ ...stored(), exists: false }, stored({}, "users/other@example.test/entries/upper")]) {
      get.mockResolvedValue(snapshot);
      expect(await applyClientNameCaseRepair(db, personPlan(), null)).toBe("stale");
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("is idempotent after a successful repair", async () => {
    expect(await applyClientNameCaseRepair(db, personPlan(), null)).toBe("updated");
    get.mockResolvedValue(stored({ clientName: personPlan().clientName }));
    expect(await applyClientNameCaseRepair(db, personPlan(), null)).toBe("unchanged");
    expect(update).toHaveBeenCalledTimes(1);
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });
});

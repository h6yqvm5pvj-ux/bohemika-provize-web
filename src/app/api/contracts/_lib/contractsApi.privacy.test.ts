import "../../../../../tests/helpers/privateEncryptionTestKey";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateFirestore } from "../../../../../tests/helpers/privateFirestore";
import { sealPrivateRecord } from "@/lib/server/privateRecords";
import { domexNeuronDataFixture } from "../../../../../tests/helpers/domexNeuronFixture";

const mocks = vi.hoisted(() => ({ db: null as Firestore | null, guard: vi.fn(), find: vi.fn() }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return mocks.db; }, adminAuth: null, adminMessaging: null, adminStorage: null,
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard, withRateLimitHeaders: (response: Response) => response,
}));
vi.mock("./contractsApi.duplicates", async importOriginal => ({
  ...await importOriginal<typeof import("./contractsApi.duplicates")>(),
  resolveEntryRefsByContractNumber: mocks.find,
}));

const owner = "owner@example.test", manager = "manager@example.test";
const former = "former@example.test", tip = "tip@example.test", admin = "admin@example.test";
let store: ReturnType<typeof privateFirestore>;
const asUser = (email: string, administrator = false) => mocks.guard.mockResolvedValue({ ok: true, ctx: {
  email, uid: email, decoded: { email, ...(administrator ? { admin: true, adminRole: "admin" } : {}) },
  actorEmail: email, actorUid: email, isImpersonating: false, impersonation: null,
} });
const entry = (id: string, data: Record<string, unknown> = {}) => {
  const path = `users/${owner}/entries/${id}`;
  store.records.set(path, sealPrivateRecord(path, {
    userEmail: owner, clientName: "Test client", contractNumber: "12345", productKey: "neon",
    entryType: id === "root" ? "contract" : "endorsement", rootContractEntryId: "root",
    inputAmount: 1000, contractSignedDate: "2025-01-01", policyStartDate: "2025-02-01",
    durationYears: 20, ...data,
  }));
};
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); store = privateFirestore();
  const collection = store.db.collection.bind(store.db);
  // Match the real QuerySnapshot API used by the user hierarchy loader.
  mocks.db = Object.assign(Object.create(store.db), { collection: (name: string) => {
    const ref = collection(name);
    if (name !== "users") return ref;
    return Object.assign(Object.create(ref), { select() { return this; }, get: async () => {
      const snap = await ref.get();
      return { ...snap, forEach: (visit: (doc: typeof snap.docs[number]) => void) => snap.docs.forEach(visit) };
    } });
  } });
  for (const email of [owner, manager, former, tip, admin]) {
    store.records.set(`users/${email}`, { userId: email, accountType: "advisor", position: "manazer4",
      managerEmail: email === owner ? manager : null, fullName: email });
    store.records.set(`usersPrivate/${email}`, { subscriptionStatus: "active", subscriptionPaidUntil: "2099-01-01" });
  }
  mocks.find.mockImplementation(async () => [...store.records.keys()]
    .filter(path => path.startsWith(`users/${owner}/entries/`) && path.split("/").length === 4)
    .map(path => store.db.doc(path)));
  asUser(owner);
});

describe("contract response privacy at the API boundary", () => {
  it("requires the same record permissions for the private POST detail link", async () => {
    entry("root");
    const { POST } = await import("../detail/route");
    const read = (entryId: string) => POST(new NextRequest("https://example.test/api/contracts/detail", {
      method: "POST", body: new URLSearchParams({ ownerEmail: owner, entryId }),
    }));
    expect((await read("../root")).status).toBe(400);
    asUser(former);
    const denied = await read("root");
    expect(denied.status).toBe(403);
    expect(await denied.json()).not.toHaveProperty("contract");
    asUser(manager);
    const response = await read("root");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ contract: { id: "root" } });
  });
  it("returns the corrected legacy Refresh decrease on the authorized detail without rewriting its statement", async () => {
    const items = [{ title: "Provize A101", code: "A101", amount: 450 }, { title: "Provize B0301", code: "B0301", amount: 125 }];
    entry("root", { policyStartDate: "2022-09-01", inputAmount: 900, effectiveInputAmount: 900, isRefresh: true,
      commissionBaseSource: "commission_statement", refreshCommissionBase: { calculationAnnualPremium: 3600 }, items });
    const oldItems = [{ ...items[0], amount: -150 }, { ...items[1], amount: -41.67 }];
    const payout = { code: "A101", amount: -269.83, writtenBy: owner, status: "storno" };
    entry("decrease", { parentContractEntryId: "root", policyStartDate: "2024-09-01", previousInputAmount: 900, newInputAmount: 400,
      calculationInputAmount: 300, inputAmount: 300, items: oldItems, result: { items: oldItems, total: -191.67 }, commissionPayouts: [payout] });
    const { handleContractsGet } = await import("./contractsApi");
    const read = () => handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=decrease`), "detail");
    const response = await read();
    expect(response.status).toBe(200);
    const body = await response.json();
    const expected = { items: [{ ...items[0], amount: -270 }, { ...items[1], amount: -75 }], total: -345 };
    expect(body.contract).toMatchObject({ ...expected, result: expected, calculationInputAmount: 180, commissionPayouts: [payout] });
    expect(body.timeline.find((node: { id: string }) => node.id === "decrease")).toMatchObject(expected);
    asUser(former);
    expect((await read()).status).toBe(403);
  });
  it("repairs separate equal increase receipts from their authorized archived rows in the timeline", async () => {
    const { extractCommissionPayoutRowsFromStoredHtml, statementPayoutKey } = await import("@/app/api/commission-statements/statementPayoutRows");
    const payout = (statementId: string, day: string, payoutMonthKey: string) => {
      const cells = [1, "123456789", "01.01.2024", day, "Synthetic client", "R", "CPP_N_LIFE", "NV101", 1200, "", "", "7", 100, 0];
      const html = `<div id="provize"><table><tr>${cells.map(cell => `<td>${cell}</td>`).join("")}</tr></table></div>`;
      store.records.set(`usersPrivate/${owner}/commissionStatements/${statementId}`, { html });
      const row = extractCommissionPayoutRowsFromStoredHtml(html)[0];
      return { statementId, key: statementPayoutKey(statementId, row), writtenBy: owner, code: "NV101", amount: 100,
        status: "paid", payoutMonthKey };
    };
    const receipts = [payout("statement-september", "31.08.2025", "2025-9"), payout("statement-january", "30.11.2025", "2026-1")];
    entry("root", { contractNumber: "123456789", policyStartDate: "2024-01-01", commissionPayouts: receipts });
    entry("first", { contractNumber: "123456789", policyStartDate: "2025-08-31", premiumDelta: 100,
      parentContractEntryId: "root", commissionPayouts: receipts });
    entry("second", { contractNumber: "123456789", policyStartDate: "2025-11-30", premiumDelta: 100, parentContractEntryId: "first" });
    const { handleContractsGet } = await import("./contractsApi");
    const read = () => handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=second`), "detail");
    const doc = vi.spyOn(mocks.db!, "doc");
    const response = await read();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.timeline.map((item: { id: string; commissionPayouts: unknown[] }) => [item.id, item.commissionPayouts])).toEqual([
      ["root", []], ["first", [expect.objectContaining({ ...receipts[0], sourceValidFrom: "31.08.2025" })]],
      ["second", [expect.objectContaining({ ...receipts[1], sourceValidFrom: "30.11.2025" })]],
    ]);
    expect(payload.contract.commissionPayouts).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain("Synthetic client");

    doc.mockClear();
    asUser(former);
    expect((await read()).status).toBe(403);
    expect(doc.mock.calls.some(([path]) => path.includes("/commissionStatements/"))).toBe(false);
    doc.mockRestore();
  });

  it.each(["cppAuto", "domex"] as const)("returns automatically corrected %s codes with original provenance only to an authorized viewer", async productKey => {
    entry("root", { productKey, frequencyRaw: "annual", policyStartDate: "2020-06-08",
      premiumStatementHistory: [
        { commissionCode: "A101", premiumKind: "auto_initial", anniversaryDate: "2020-06-08", newAnnualPremium: 3000, writtenBy: owner, payoutMonthKey: "2020-7" },
        { commissionCode: "A102", premiumKind: "auto_initial", anniversaryDate: "2020-06-08", newAnnualPremium: 3200, writtenBy: owner, payoutMonthKey: "2021-6" },
      ],
      commissionPayouts: [{ key: "source", code: "A102", amount: 100, payoutMonthKey: "2021-6", writtenBy: owner }],
    });
    const { handleContractsGet, handleContractsList } = await import("./contractsApi");
    asUser(owner);
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const detail = await response.json();
    expect(detail.contract.commissionPayouts[0]).toMatchObject({ code: "B101", statementCode: "A102", amount: 100 });
    expect(detail.contract).not.toHaveProperty("commissionPayoutCodeAdjustment");
    expect(detail.contract.premiumStatementHistory[1]).toMatchObject({ commissionCode: "A102", resolvedCommissionCode: "B101", premiumKind: "auto_change", anniversaryDate: "2021-06-08", previousAnnualPremium: 3000, differenceAnnual: 200 });
    const list = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=cashflow&limit=5"));
    expect(list.status).toBe(200);
    expect((await list.json()).contracts[0].commissionPayouts[0]).toMatchObject({ code: "B101", statementCode: "A102" });
    asUser(former);
    expect((await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail")).status).toBe(403);
  });

  it.each([
    ["jindrich.hajek@bohemika.eu", "poradce10"],
    ["jindra.hajek@bohemika.eu", undefined],
  ] as const)("projects the payout exception for the verified detail viewer %s", async (account, expected) => {
    const path = `users/${account}/entries/flexi`;
    store.records.set(`users/${account}`, { userId: account, accountType: "advisor", position: "poradce10", managerEmail: manager });
    store.records.set(path, sealPrivateRecord(path, {
      contractNumber: "12345", productKey: "flexi", userEmail: account, position: "poradce8",
      inputAmount: 786, contractSignedDate: "2025-08-01", policyStartDate: "2025-08-01",
    }));
    const { handleContractsGet } = await import("./contractsApi");
    const read = () => handleContractsGet(new NextRequest(
      `https://example.test/api/contracts/detail?ownerEmail=${account}&entryId=flexi`
    ), "detail");
    asUser(account);
    const own = await read();
    expect(own.status).toBe(200);
    const payload = await own.json();
    expect(payload.contract.position).toBe("poradce8");
    expect(payload.contract.payoutPositionOverride).toBe(expected);
    expect(payload.timeline[0].payoutPositionOverride).toBe(expected);

    asUser(former);
    const foreign = await read();
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).not.toHaveProperty("contract");
  });

  it.each(["owner", "manager"])("returns only validated cashflow portal links to an authorized %s", async actor => {
    entry("root", { maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456",
      cppExtranetEntityTypeId: "43", cppExtranetEntityId: "123456" });
    asUser(actor === "owner" ? owner : manager);
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${actor === "owner" ? "my" : "team"}&shape=cashflow&limit=5`));
    expect(response.status).toBe(200);
    const contract = (await response.json()).contracts[0];
    expect(contract).toMatchObject({
      maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456",
      extranetContractDetailUrl: "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx?type=detail&p_EntityTypeID=43&p_EntityID=123456",
    });
    expect(contract).not.toHaveProperty("cppExtranetEntityId");
    expect(contract).not.toHaveProperty("cppExtranetEntityTypeId");
  });

  it.each(["cashflow", "contractList"])("includes the stored auto commission table in the %s projection for the owner", async shape => {
    entry("root", { productKey: "kooperativaAuto", frequencyRaw: "semiannual", position: "poradce8",
      originalPosition: "poradce7", commissionCoefficientSetOverride: "historical",
      paymentFrequencyChanges: [{ effectiveDate: "2026-02-01", frequency: "annual", annualPremium: 22000, baseAnnualPremium: 24000 }],
    });
    const { handleContractsList } = await import("./contractsApi");
    const list = (scope: "my" | "team") => handleContractsList(new NextRequest(
      `https://example.test/api/contracts/list?scope=${scope}&shape=${shape}&limit=5`
    ));
    const response = await list("my");
    expect(response.status).toBe(200);
    expect((await response.json()).contracts[0]).toMatchObject({
      originalPosition: "poradce7", commissionCoefficientSetOverride: "historical",
    });
    asUser(former);
    expect(JSON.stringify(await (await list("team")).json())).not.toContain("commissionCoefficientSetOverride");
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("does not expose another owner's portal links to %s or trust a client admin flag", async actor => {
    entry("root", { maxxContractDetailUrl: "https://sjednatel.bohemiaservis.cz/detail.aspx?sml=123456",
      cppExtranetEntityTypeId: "43", cppExtranetEntityId: "123456" });
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.get(`users/${tip}`)!.accountType = "tipster";
    }
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=team&shape=cashflow&limit=5&ownerEmail=${owner}&role=admin`));
    expect([200, 401, 403]).toContain(response.status);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain("detail.aspx?sml=123456");
    expect(body).not.toContain("p_EntityID=123456");
  });

  it("omits unsafe external destinations from the cashflow projection", async () => {
    entry("root", { maxxContractDetailUrl: "javascript:alert(1)", cppExtranetEntityTypeId: "43", cppExtranetEntityId: "1&next=evil" });
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=cashflow&limit=5"));
    expect(response.status).toBe(200);
    const contract = (await response.json()).contracts[0];
    expect(contract).not.toHaveProperty("maxxContractDetailUrl");
    expect(contract).not.toHaveProperty("extranetContractDetailUrl");
  });

  it("preserves DIP in list and detail responses for an authorized investment contract", async () => {
    entry("root", { productKey: "investikaEfektika", isDip: true, rootContractEntryId: null, inputAmount: 0, items: [], total: 0 });
    const { handleContractsGet, handleContractsList } = await import("./contractsApi");
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(detail.status).toBe(200);
    expect((await detail.json()).contract).toMatchObject({ productKey: "investikaEfektika", isDip: true });
    const list = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=contractList&limit=5"));
    expect(list.status).toBe(200);
    expect((await list.json()).contracts[0]).toMatchObject({ productKey: "investikaEfektika", isDip: true, productCategory: "investments" });
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies access to an investment contract for %s", async actor => {
    entry("root", { productKey: "investikaEfektika", isDip: true, rootContractEntryId: null });
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else if (actor === "unrelated") asUser(former);
    else { asUser(tip); store.records.get(`users/${tip}`)!.accountType = "tipster"; }
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(actor === "unauthenticated" ? 401 : 403);
    expect(JSON.stringify(await response.json())).not.toContain("investikaEfektika");
  });
  const renewalRequest = (updates: Record<string, unknown>) => new NextRequest("https://example.test/api/contracts", {
    method: "PATCH", body: JSON.stringify({ action: "updateFields", ownerEmail: owner, entryId: "root", updates }),
  });
  const neuron = () => entry("root", { productKey: "domexneuron", contractSignedDate: "2026-11-04", policyStartDate: "2026-11-05",
    automaticRenewal: true, policyEndDate: null, policyTermEndDate: new Date("2027-11-04") });

  it("returns only PDF-presence status on contract list responses", async () => {
    entry("root", { contractPdfAttachment: {
      kind: "contractPdf", bucketName: "private-bucket", storagePath: "private/path.pdf",
      originalName: "contract.pdf", contentType: "application/pdf", sizeBytes: 10,
      sha256: "a".repeat(64), uploadedAtMs: 1, uploadedBy: owner,
    } });
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=contractList&limit=5"));
    const body = await response.json();
    expect(body.contracts[0]).toMatchObject({ hasContractPdfAttachment: true });
    expect(body.contracts[0]).not.toHaveProperty("contractPdfAttachment");
    expect(JSON.stringify(body)).not.toContain("private/path.pdf");
    expect(JSON.stringify(body)).not.toContain("private-bucket");
  });

  it("checks replacement originals across owners but returns only an existence boolean", async () => {
    const foreignOwner = "other-adviser@example.test";
    const foreignPath = `users/${foreignOwner}/entries/foreign-original`;
    store.records.set(foreignPath, sealPrivateRecord(foreignPath, {
      userEmail: foreignOwner,
      clientName: "Private synthetic client",
      contractNumber: "0034516611",
      productKey: "domexneuron",
      entryType: "contract",
    }));
    mocks.find.mockResolvedValue([store.db.doc(foreignPath)]);

    const { handleOriginalContractExists } = await import("./contractsApi");
    const response = await handleOriginalContractExists(new NextRequest("https://example.test/api/contracts/original-exists", {
      method: "POST",
      body: JSON.stringify({ contractNumber: "0034516611" }),
      headers: { "Content-Type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, exists: true });
  });

  it("rejects malformed replacement-original lookup input", async () => {
    const { handleOriginalContractExists } = await import("./contractsApi");
    const response = await handleOriginalContractExists(new NextRequest("https://example.test/api/contracts/original-exists", {
      method: "POST",
      body: JSON.stringify({ contractNumber: "   " }),
      headers: { "Content-Type": "application/json" },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  const originalLookup = async (body: unknown) => {
    const { handleOriginalContractExists } = await import("./contractsApi");
    return handleOriginalContractExists(new NextRequest("https://example.test/api/contracts/original-exists", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
  };

  it.each([
    ["domex", "domexneuron", true], ["kooperativaAuto", "kooperativaAuto", true],
    ["allianzAuto", "kooperativaAuto", false],
  ])("checks foreign product compatibility without disclosing contract data: %s to %s", async (originalProduct, productKey, matchesProduct) => {
    const path = "users/foreign@example.test/entries/private-original";
    store.records.set(path, sealPrivateRecord(path, {
      productKey: originalProduct, contractNumber: "OLD123", entryType: "contract",
      clientName: "Private synthetic client", inputAmount: 1000, userEmail: "foreign@example.test",
    }));
    mocks.find.mockResolvedValue([store.db.doc(path)]);
    const response = await originalLookup({ contractNumber: "OLD123", productKey });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, exists: true, matchesProduct });
    expect(mocks.guard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      namespace: "api:contracts:original-exists", limit: 30,
    }));
  });

  it.each(["123", "123456", "0012345"])("requires an exact original number rather than a partial or loose match: %s", async contractNumber => {
    entry("root", { contractNumber: "12345", productKey: "kooperativaAuto" });
    const response = await originalLookup({ contractNumber, productKey: "kooperativaAuto" });
    expect(await response.json()).toEqual({ ok: true, exists: false, matchesProduct: false });
  });

  it.each([401, 403, 429])("keeps guard denial %s ahead of global lookup", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    expect((await originalLookup({ contractNumber: "OLD123", productKey: "kooperativaAuto" })).status).toBe(status);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("denies a tipster account access to replacement lookup", async () => {
    store.records.get(`users/${owner}`)!.accountType = "tipster";
    expect((await originalLookup({ contractNumber: "OLD123", productKey: "kooperativaAuto" })).status).toBe(403);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it.each([
    { contractNumber: {} }, { contractNumber: "OLD<script>" }, { contractNumber: "x".repeat(101) },
    { contractNumber: "OLD123", productKey: "unsupported" }, { contractNumber: "OLD123", productKey: {} },
  ])("rejects manipulated replacement lookup input before reading contracts: %j", async body => {
    expect((await originalLookup(body)).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("keeps lookup failures generic", async () => {
    mocks.find.mockRejectedValue(new Error("private/internal/path and synthetic-secret"));
    const response = await originalLookup({ contractNumber: "OLD123", productKey: "kooperativaAuto" });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Nepodařilo se ověřit původní smlouvu." });
  });

  it("exposes only the new policy's calculated base when NEON used a foreign original", async () => {
    const ownBase = {
      newMonthlyPremium: 1_500, newAnnualPremium: 18_000,
      calculationMonthlyPremium: 750, calculationAnnualPremium: 9_000, refreshPolicyStartDateIso: "2026-02-01",
    };
    entry("root", { isRefresh: true, refreshCommissionBase: {
      ...ownBase, originalOutsideOwner: true, productKey: "neon", method: "cpp_neon_5y_storno",
      originalMonthlyPremium: 1234.56, originalAnnualPremium: 14814.72,
      originalStornoStartDateIso: "2023-01-01", stornoBaseMonthlyPremium: 1200,
    } });
    const { handleContractsGet, handleContractsList } = await import("./contractsApi");
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await detail.json()).contract.refreshCommissionBase).toEqual(ownBase);
    const cashflow = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=cashflow&limit=5"));
    expect((await cashflow.json()).contracts[0].refreshCommissionBase).toEqual(ownBase);
  });

  it("roundtrips all Neuron objects and states, keeps addresses out of slim responses and encrypts audit changes", async () => {
    neuron();
    const model = domexNeuronDataFixture();
    const { handleContractsPatch, handleContractsGet, handleContractsList } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ domexDetail: { neuron: model } }));
    expect(response.status).toBe(200);
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await detail.json()).contract.domexDetail.neuron).toEqual(model);
    for (const shape of ["clientNames", "clientDirectory", "home", "contractList", "cashflow"]) {
      const list = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=my&shape=${shape}&limit=5`));
      const body = await list.json();
      expect(body.contracts[0]).not.toHaveProperty("domexDetail");
      for (const object of model.objects) expect(JSON.stringify(body)).not.toContain(object.address);
    }
    const events = [...store.records].filter(([path]) => /^contractHistories\/[^/]+\/events\//.test(path)).map(([, data]) => data);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.changes).toMatchObject({ privateEncryption: 1 });
      for (const object of model.objects) expect(JSON.stringify(event)).not.toContain(object.address);
    }
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies Neuron object changes by %s", async actor => {
    neuron();
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.set(`users/${tip}`, { userId: tip, accountType: "tipster" });
    }
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ domexDetail: { neuron: domexNeuronDataFixture() } }))).status)
      .toBe(actor === "unauthenticated" ? 401 : 403);
    expect([...store.records]).toEqual(before);
  });

  it.each(["domex", "maxdomov", "neon"])("rejects Neuron object updates on %s without changing data", async productKey => {
    entry("root", { productKey });
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ domexDetail: { neuron: domexNeuronDataFixture() } }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each([
    {}, { ...domexNeuronDataFixture(), parserVersion: 999 },
    { ...domexNeuronDataFixture(), sections: { ...domexNeuronDataFixture().sections, household: "missing" } },
    { ...domexNeuronDataFixture(), objects: [domexNeuronDataFixture().objects[0], domexNeuronDataFixture().objects[0]] },
    { ...domexNeuronDataFixture(), objects: [{ ...domexNeuronDataFixture().objects[0], address: { nested: true } }] },
  ])("rejects hostile nested Neuron data without writing", async model => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ domexDetail: { neuron: model } }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it("rejects the whole multi-edit when one target is an incompatible product", async () => {
    neuron();
    entry("legacy", { productKey: "domex", entryType: "contract" });
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    const request = new NextRequest("https://example.test/api/contracts", { method: "PATCH", body: JSON.stringify({
      action: "updateFields", ownerEmail: owner, entryIds: ["root", "legacy"], updates: { domexDetail: { neuron: domexNeuronDataFixture() } },
    }) });
    expect((await handleContractsPatch(request)).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it("roundtrips separate DOMEX addresses and assistance levels without adding them to slim lists", async () => {
    neuron();
    const { handleContractsPatch, handleContractsGet, handleContractsList } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ domexDetail: {
      address: "Původní místo 1, Testov", propertyAddress: "  Testovací 11, Testov ", householdAddress: " Testovací 22, Testov  ",
      propertyAssistance: "basic", householdAssistance: "plus", assistancePlus: true,
    } }));
    expect(response.status).toBe(200);
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await detail.json()).contract.domexDetail).toEqual({
      address: "Původní místo 1, Testov", propertyAddress: "Testovací 11, Testov", householdAddress: "Testovací 22, Testov",
      propertyAssistance: "basic", householdAssistance: "plus", assistancePlus: true,
    });
    for (const shape of ["contractList", "cashflow"]) {
      const list = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=my&shape=${shape}&limit=5`));
      const body = await list.json();
      expect(body.contracts[0]).not.toHaveProperty("domexDetail");
      expect(JSON.stringify(body)).not.toContain("Testovací 11");
      expect(JSON.stringify(body)).not.toContain("Testovací 22");
    }
    expect((await handleContractsPatch(renewalRequest({ domexDetail: {
      propertyAddress: " ", householdAddress: null, propertyAssistance: null, householdAssistance: null,
    } }))).status).toBe(200);
    const cleared = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await cleared.json()).contract.domexDetail).toEqual({
      propertyAddress: null, householdAddress: null, propertyAssistance: null, householdAssistance: null,
    });
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies DOMEX address/assistance updates by %s", async actor => {
    neuron();
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.set(`users/${tip}`, { userId: tip, accountType: "tipster" });
    }
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ domexDetail: {
      propertyAddress: "Testovací 11, Testov", householdAddress: "Testovací 22, Testov", propertyAssistance: "plus", householdAssistance: "basic",
    } }));
    expect(response.status).toBe(actor === "unauthenticated" ? 401 : 403);
    expect([...store.records]).toEqual(before);
  });

  it.each([
    { propertyAssistance: true }, { propertyAssistance: "PLUS" }, { householdAssistance: " " }, { householdAssistance: {} },
    { propertyAddress: true }, { householdAddress: 123 }, { propertyAddress: "x".repeat(201) }, { householdAddress: "Test\u0000ov" },
  ])("rejects manipulated DOMEX property details without writing: %j", async domexDetail => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ domexDetail }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each(["propertyAddress", "householdAddress", "propertyAssistance", "householdAssistance"])("rejects the DOMEX field %s in a MAXDOMOV update", async field => {
    entry("root", { productKey: "maxdomov" });
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    const value = field.endsWith("Assistance") ? "plus" : "Testovací 11, Testov";
    expect((await handleContractsPatch(renewalRequest({ maxdomovDetail: { [field]: value } }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it("roundtrips the owner's Neuron premium indexation without changing premium or prolongation", async () => {
    neuron();
    const { handleContractsPatch, handleContractsGet } = await import("./contractsApi");
    for (const premiumIndexationEnabled of [true, false, null]) {
      expect((await handleContractsPatch(renewalRequest({ premiumIndexationEnabled }))).status).toBe(200);
      const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
      expect((await detail.json()).contract).toMatchObject({
        premiumIndexationEnabled, inputAmount: 1000, automaticRenewal: true, policyEndDate: null,
      });
    }
  });

  it.each([true, false])("includes Neuron premium indexation in authorized statement matching: %j", async premiumIndexationEnabled => {
    neuron();
    const { handleContractsPatch, handleContractsFind, handleContractsFindBulk } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ premiumIndexationEnabled }))).status).toBe(200);
    const find = await handleContractsFind(new NextRequest("https://example.test/api/contracts/find?scope=my&q=12345"));
    expect(find.status).toBe(200);
    expect((await find.json()).contracts).toEqual([expect.objectContaining({ premiumIndexationEnabled })]);
    const bulk = await handleContractsFindBulk(new NextRequest("https://example.test/api/contracts/find", {
      method: "POST", body: JSON.stringify({ requests: [{ key: "my:12345", scope: "my", q: "12345" }] }),
    }));
    expect(bulk.status).toBe(200);
    expect((await bulk.json()).results[0].contracts).toEqual([expect.objectContaining({ premiumIndexationEnabled })]);
  });

  it("shares only effective policy premium facts in cashflow without another recipient's statement metadata", async () => {
    entry("root", { productKey: "domexneuron", contractSignedDate: "2026-11-04", policyStartDate: "2026-11-05", frequencyRaw: "annual",
      premiumStatementHistory: [
        { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2027-11-05", newPremium: 1100,
          writtenBy: owner, rowId: "private-indexation-row", statementNumber: "private-indexation-statement" },
        { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2028-11-05", newPremium: 1200,
          writtenBy: former, statementNumber: "foreign-indexation-statement" },
        { premiumKind: "life_increase", newPremium: 9000, writtenBy: owner },
      ] });
    const { handleContractsList } = await import("./contractsApi");
    const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=cashflow&limit=5"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contracts[0].premiumIndexationHistory).toEqual([
      { effectiveDate: "2027-11-05", paymentPremium: 1100 },
      { effectiveDate: "2028-11-05", paymentPremium: 1200 },
    ]);
    expect(body.contracts[0].premiumStatementHistory).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("private-indexation");
    expect(JSON.stringify(body)).not.toContain("foreign-indexation");
  });

  it("keeps derived premium facts behind the contract's read authorization", async () => {
    entry("root", { productKey: "domexneuron", frequencyRaw: "annual", premiumStatementHistory: [
      { premiumKind: "auto_change", changeReason: "indexation", anniversaryDate: "2027-11-05", newPremium: 1100, writtenBy: owner },
    ] });
    asUser(former);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("contract");
  });

  it("does not let a client write the derived premium history", async () => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ premiumIndexationHistory: [{ effectiveDate: "2027-11-05", paymentPremium: 90000 }] }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies a premium-indexation change by %s", async actor => {
    neuron();
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.set(`users/${tip}`, { userId: tip, accountType: "tipster" });
    }
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ premiumIndexationEnabled: true }))).status)
      .toBe(actor === "unauthenticated" ? 401 : 403);
    expect([...store.records]).toEqual(before);
  });

  it.each(["ANO", "false", "", 1, 0, [], {}])("rejects manipulated premium-indexation input without writing: %j", async premiumIndexationEnabled => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ premiumIndexationEnabled }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each([true, false])("rejects premium-indexation updates on a different product: %j", async premiumIndexationEnabled => {
    entry("root");
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest({ premiumIndexationEnabled }))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it("returns the Neuron term boundary as a date while leaving actual maturity empty", async () => {
    neuron();
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).contract).toMatchObject({ automaticRenewal: true, policyEndDate: null, policyTermEndDate: Date.parse("2027-11-04") });
  });

  it("lets the owner disable prolongation with a matching actual maturity", async () => {
    neuron();
    const { handleContractsPatch, handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ automaticRenewal: false,
      policyTermEndDate: "2027-11-04T00:00:00.000Z", policyEndDate: "2027-11-04" }));
    expect(response.status).toBe(200);
    const detail = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await detail.json()).contract).toMatchObject({ automaticRenewal: false, policyEndDate: Date.parse("2027-11-04"), policyTermEndDate: Date.parse("2027-11-04") });
    expect((await handleContractsPatch(renewalRequest({ automaticRenewal: true, policyEndDate: null }))).status).toBe(200);
    const renewed = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect((await renewed.json()).contract).toMatchObject({ automaticRenewal: true, policyEndDate: null, policyTermEndDate: Date.parse("2027-11-04") });
  });

  it.each(["unauthenticated", "unrelated", "tipster"])("denies a Neuron prolongation change by %s", async actor => {
    neuron();
    if (actor === "unauthenticated") mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    else {
      asUser(actor === "tipster" ? tip : former);
      if (actor === "tipster") store.records.set(`users/${tip}`, { userId: tip, accountType: "tipster" });
    }
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    const response = await handleContractsPatch(renewalRequest({ automaticRenewal: false, policyEndDate: "2027-11-04" }));
    expect(response.status).toBe(actor === "unauthenticated" ? 401 : 403);
    expect([...store.records]).toEqual(before);
  });

  it.each([
    { automaticRenewal: "false" }, { automaticRenewal: false },
    { policyTermEndDate: "2027-02-30" },
    { automaticRenewal: false, policyEndDate: "2028-11-04" },
    { automaticRenewal: false, policyEndDate: "2027-11-04", productKey: "domex" },
  ])("rejects manipulated Neuron renewal updates without writing: %j", async updates => {
    neuron();
    const before = structuredClone([...store.records]);
    const { handleContractsPatch } = await import("./contractsApi");
    expect((await handleContractsPatch(renewalRequest(updates))).status).toBe(400);
    expect([...store.records]).toEqual(before);
  });

  it.each(["cppPPRbez", "cppAuto", "maxdomov", "cppcestovko"])("loads the explicitly linked %s amendment family from an original without chain metadata", async productKey => {
    entry("root", { productKey, rootContractEntryId: null });
    entry("decrease", { productKey, parentContractEntryId: "root", policyStartDate: "2026-02-01",
      previousInputAmount: 1000, newInputAmount: 800, premiumDelta: -200 });
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
  });

  it.each([owner, manager, admin])("loads non-life linked ancestors and descendants for an authorized %s", async viewer => {
    entry("root", { productKey: "cppPPRbez", rootContractEntryId: null });
    entry("decrease", { productKey: "cppPPRbez", parentContractEntryId: "root", policyStartDate: "2026-02-01" });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=decrease`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
  });

  it("keeps an inaccessible non-life amendment out of a former manager's timeline", async () => {
    entry("root", { productKey: "cppAuto", rootContractEntryId: null, managerEmailSnapshot: former });
    entry("decrease", { productKey: "cppAuto", parentContractEntryId: "root", note: "private non-life sibling sentinel" });
    asUser(former);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(["root"]);
    expect(JSON.stringify(body)).not.toContain("private non-life sibling sentinel");
  });

  it("rejects an unrelated viewer before exposing a non-life family", async () => {
    entry("root", { productKey: "cppAuto" });
    entry("decrease", { productKey: "cppAuto", parentContractEntryId: "root", note: "private family sentinel" });
    asUser(former);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain("private family sentinel");
  });

  it("requires authentication before reading a non-life family", async () => {
    entry("root", { productKey: "cppAuto" });
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsGet } = await import("./contractsApi");
    const reads = vi.spyOn(mocks.db!, "collection");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(401);
    expect(reads).not.toHaveBeenCalled();
  });

  it("does not merge unrelated same-number records, foreign owners, different products or disconnected parents", async () => {
    entry("root", { productKey: "cppPPRbez", rootContractEntryId: null });
    entry("decrease", { productKey: "cppPPRbez", parentContractEntryId: "root", policyStartDate: "2026-02-01" });
    entry("legacy-same-number", { productKey: "cppPPRbez", rootContractEntryId: null, note: "unrelated legacy sentinel" });
    entry("wrong-product", { productKey: "cppAuto", parentContractEntryId: "root", note: "wrong product sentinel" });
    entry("wrong-number", { productKey: "cppPPRbez", contractNumber: "54321", parentContractEntryId: "root", note: "wrong number sentinel" });
    entry("disconnected", { productKey: "cppPPRbez", parentContractEntryId: "missing", note: "disconnected sentinel" });
    entry("self-parent", { productKey: "cppPPRbez", parentContractEntryId: "self-parent", note: "self-parent sentinel" });
    entry("cycle-a", { productKey: "cppPPRbez", parentContractEntryId: "cycle-b", note: "cycle sentinel" });
    entry("cycle-b", { productKey: "cppPPRbez", parentContractEntryId: "cycle-a", note: "cycle sentinel" });
    const foreignPath = `users/${former}/entries/foreign`;
    store.records.set(foreignPath, sealPrivateRecord(foreignPath, { userEmail: former, contractNumber: "12345",
      productKey: "cppPPRbez", entryType: "endorsement", rootContractEntryId: "root", parentContractEntryId: "root", note: "foreign owner sentinel" }));
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(["root", "decrease"]);
    expect(JSON.stringify(body)).not.toContain("sentinel");
  });

  it.each(["conseqzenit"])("keeps %s outside proportional insurance timelines", async productKey => {
    entry("root", { productKey });
    entry("decrease", { productKey, parentContractEntryId: "root", note: "unsupported product sentinel" });
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    expect((await response.json()).timeline.map((item: { id: string }) => item.id)).toEqual(["root"]);
  });

  it.each([owner, manager, admin])("returns 404 for a retired contract to %s while supported contracts remain accessible", async viewer => {
    entry("retired", { productKey: "comfortcc", note: "retired private sentinel", rootContractEntryId: null });
    entry("root", { rootContractEntryId: null });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const retired = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=retired`), "detail");
    expect(retired.status).toBe(404);
    expect(await retired.json()).toEqual({ ok: false, error: "Smlouva nebyla nalezena." });
    const valid = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(valid.status).toBe(200);
    expect((await valid.json()).contract.id).toBe("root");
    expect(store.records.has(`users/${owner}/entries/retired`)).toBe(true);
  });

  it.each([owner, manager, admin])("omits retired contracts from lists and single/bulk matching for %s", async viewer => {
    if (viewer === admin) store.records.set(`users/${owner}`, { ...store.records.get(`users/${owner}`), managerEmail: admin });
    entry("retired", { productKey: "comfortcc", rootContractEntryId: null, note: "retired private sentinel", contractSignedDate: "2026-01-01" });
    entry("root", { rootContractEntryId: null });
    asUser(viewer, viewer === admin);
    const { handleContractsList, handleContractsFind, handleContractsFindBulk } = await import("./contractsApi");
    const scope = viewer === owner ? "my" : "team";
    const list = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${scope}&limit=5`));
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
    expect(listed.hasMore).toBe(false);
    expect(listed.nextCursor).toBe(new Date("2025-01-01").getTime());
    const find = await handleContractsFind(new NextRequest(`https://example.test/api/contracts/find?scope=${scope}&q=12345`));
    expect(find.status).toBe(200);
    expect((await find.json()).contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
    const bulk = await handleContractsFindBulk(new NextRequest("https://example.test/api/contracts/find", { method: "POST",
      body: JSON.stringify({ requests: [{ key: "match", q: "12345", scope }] }) }));
    expect(bulk.status).toBe(200);
    expect((await bulk.json()).results[0].contracts.map((item: { id: string }) => item.id)).toEqual(["root"]);
  });

  it.each([false, true])("rejects retired contract creation without changing stored records (wrapped=%s)", async wrapped => {
    const raw = { productKey: "comfortcc", entryType: "contract", frequencyRaw: "annual", clientName: "Test Client",
      contractNumber: "987654", contractSignedDate: "2026-01-01", policyStartDate: "2026-02-01", inputAmount: 1000 };
    const before = structuredClone([...store.records]);
    const { handleContractsCreate } = await import("./contractsApi");
    const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST",
      body: JSON.stringify(wrapped ? { entry: raw } : raw) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("productKey") });
    expect([...store.records]).toEqual(before);
  });

  it("does not let a retired product payload bypass cross-owner creation authorization", async () => {
    const { handleContractsCreate } = await import("./contractsApi");
    const before = structuredClone([...store.records]);
    const response = await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST",
      body: JSON.stringify({ ownerEmail: former, entry: { productKey: "comfortcc" } }) }));
    expect(response.status).toBe(403);
    expect([...store.records]).toEqual(before);
  });

  it("requires authentication before retired contract reads, matching or creation", async () => {
    entry("retired", { productKey: "comfortcc" });
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    const { handleContractsGet, handleContractsList, handleContractsFind, handleContractsCreate } = await import("./contractsApi");
    const reads = vi.spyOn(mocks.db!, "collection");
    for (const response of [
      await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=retired`), "detail"),
      await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my")),
      await handleContractsFind(new NextRequest("https://example.test/api/contracts/find?scope=my&q=12345")),
      await handleContractsCreate(new NextRequest("https://example.test/api/contracts", { method: "POST", body: JSON.stringify({ productKey: "comfortcc" }) })),
    ]) expect(response.status).toBe(401);
    expect(reads).not.toHaveBeenCalled();
  });

  it.each([owner, manager, admin])("filters confirmed premium changes by their author for %s", async viewer => {
    const makeChange = (writtenBy: string, key: string) => ({ key, statementId: key, statementNumber: "10", statementPeriod: null,
      statementDate: null, productCode: "CPP_NEON", annualIncrease: 1548, previousMonthlyPremium: 2350,
      newMonthlyPremium: 2479, effectiveDate: "2026-01-01", writtenBy, confirmedAtMs: 1 });
    entry("root", { confirmedLifePremiumChanges: [makeChange(owner, "own-source"), makeChange(manager, "manager-private-source")] });
    asUser(viewer, viewer === admin);
    const { handleContractsGet, handleContractsFind } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contract.confirmedLifePremiumChanges.map((item: { key: string }) => item.key))
      .toEqual(viewer === owner ? ["own-source"] : ["own-source", "manager-private-source"]);
    if (viewer === owner) expect(JSON.stringify(body)).not.toContain("manager-private-source");
    const find = await handleContractsFind(new NextRequest(`https://example.test/api/contracts/find?scope=${viewer === owner ? "my" : "team"}&q=12345`));
    if (viewer === admin) { expect(find.status).toBe(403); return; }
    expect(find.status).toBe(200);
    const matched = await find.json();
    expect(matched.contracts[0].confirmedLifePremiumChanges).toEqual(body.contract.confirmedLifePremiumChanges);
    if (viewer === owner) expect(JSON.stringify(matched)).not.toContain("manager-private-source");
  });
  it.each(["root/contractNotes/secret", "root%2FcontractNotes%2Fsecret"])("rejects nested entry paths: %s", async suppliedId => {
    entry("root");
    const notePath = `users/${owner}/entries/root/contractNotes/secret`;
    store.records.set(notePath, sealPrivateRecord(notePath, { text: "Private nested note" }));
    const { handleContractsGet, handleContractsPatch, handleContractsDelete } = await import("./contractsApi");
    // URL decoding happens once before validation. A literal percent-encoded
    // ID in JSON is just a different document ID and cannot traverse a path.
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=${suppliedId}`), "detail");
    expect(response.status).toBe(400);
    if (suppliedId.includes("/")) {
      const request = (method: string, body: unknown) => new NextRequest("https://example.test/api/contracts", { method, body: JSON.stringify(body) });
      expect((await handleContractsPatch(request("PATCH", { action: "syncEntryIndex", ownerEmail: owner, entryId: suppliedId }))).status).toBe(400);
      expect((await handleContractsDelete(request("DELETE", { entries: [{ ownerEmail: owner, entryId: "root" }, { ownerEmail: owner, entryId: suppliedId }] }))).status).toBe(400);
    }
    expect(store.records.has(notePath)).toBe(true);
    expect(store.records.has(`users/${owner}/entries/root`)).toBe(true);
  });
  it.each([former, owner, manager, admin])("authorizes each detail sibling for %s", async viewer => {
    entry("root", { managerEmailSnapshot: former, note: "allowed root note" });
    entry("new", { inputAmount: 9876, note: "private sibling sentinel" });
    asUser(viewer, viewer === admin);
    const { handleContractsGet } = await import("./contractsApi");
    const response = await handleContractsGet(new NextRequest(`https://example.test/api/contracts/detail?ownerEmail=${owner}&entryId=root`), "detail");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contract.note).toBe("allowed root note");
    expect(body.timeline.map((item: { id: string }) => item.id)).toEqual(viewer === former ? ["root"] : ["new", "root"]);
    if (viewer === former) expect(JSON.stringify(body)).not.toContain("private sibling sentinel");
  });

  it.each(["GET", "POST"])("limits %s TIP matching to permitted data and siblings", async method => {
    entry("root", { tipContractTipsterEmail: tip, tipContractTipsterPercent: 15,
      tipContractTipsterAmountFirstYear: 123, note: "private inline sentinel", privateFutureField: "future secret",
      contractNotesPath: `users/${owner}/entries/root`, contractHistoryId: "private-history",
      clientEmail: "private-contact@example.test", managerOverrides: [{ email: manager, total: 99999 }],
    });
    entry("allowed", { tipContractTipsterEmail: tip, inputAmount: 2000, note: "allowed sibling private note" });
    entry("forbidden", { inputAmount: 9876, note: "forbidden sibling private note" });
    entry("retired", { productKey: "comfortcc", tipContractTipsterEmail: tip, inputAmount: 9999 });
    asUser(tip);
    const { handleContractsFind, handleContractsFindBulk } = await import("./contractsApi");
    const response = method === "GET"
      ? await handleContractsFind(new NextRequest("https://example.test/api/contracts/find?scope=tip&q=12345"))
      : await handleContractsFindBulk(new NextRequest("https://example.test/api/contracts/find", { method: "POST",
        body: JSON.stringify({ requests: [{ key: "tip", q: "12345", scope: "tip" }] }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const contracts = method === "GET" ? body.contracts : body.results[0].contracts;
    expect(contracts).toHaveLength(2);
    const root = contracts.find((item: { id: string }) => item.id === "root");
    expect(root).toMatchObject({ contractNumber: "12345", inputAmount: 1000,
      tipContractTipsterPercent: 15, tipContractTipsterAmountFirstYear: 123 });
    expect(root.lifePremiumChanges.map((item: { id: string }) => item.id).sort()).toEqual(["allowed", "root"]);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("comfortcc");
    for (const secret of ["sentinel", "future secret", "private-history", "private-contact", "private note", "9876", "99999"])
      expect(serialized).not.toContain(secret);
    expect(root).not.toHaveProperty("note");
    expect(root).not.toHaveProperty("contractNotesPath");
    expect(root).not.toHaveProperty("contractPdfAttachment");
  });

  it.each([owner, manager, admin])("filters commission data before pagination for %s", async viewer => {
    // The team list is selected by actual hierarchy; the separate detail test
    // above exercises an administrator without a team reading this contract.
    if (viewer === admin) store.records.set(`users/${owner}`, { ...store.records.get(`users/${owner}`), managerEmail: admin });
    entry("root", { productKey: "cppAuto", commissionPayouts: [{ key: "difference", code: "A101",
      amount: 10, expectedAmount: 100, difference: -90, status: "difference", writtenBy: manager }] });
    asUser(viewer, viewer === admin);
    const { handleContractsList } = await import("./contractsApi");
    const scope = viewer === owner ? "my" : "team";
    const response = await handleContractsList(new NextRequest(`https://example.test/api/contracts/list?scope=${scope}&commissionAudit=difference&commissionCode=a101&limit=1`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contracts).toHaveLength(viewer === owner ? 0 : 1);
    expect(body.hasMore).toBe(false);
    if (viewer === owner) expect(body.nextCursor).toBeNull();
  });
});


it("carries original and dated auto frequencies through the authorized cashflow projection", async () => {
  entry("root", { productKey: "kooperativaAuto", frequencyRaw: "quarterly", policyStartDate: "2023-09-01",
    paymentFrequencyChanges: [{ effectiveDate: "2024-09-01", frequency: "annual", internalAudit: "do-not-expose" }] });
  const { handleContractsList } = await import("./contractsApi");
  const response = await handleContractsList(new NextRequest("https://example.test/api/contracts/list?scope=my&shape=cashflow&limit=5"));
  expect(response.status).toBe(200);
  const contract = (await response.json()).contracts[0];
  expect(contract.frequencyRaw).toBe("quarterly");
  expect(contract.paymentFrequencyChanges).toEqual([{ effectiveDate: "2024-09-01", frequency: "annual" }]);
  expect(JSON.stringify(contract)).not.toContain("do-not-expose");
});

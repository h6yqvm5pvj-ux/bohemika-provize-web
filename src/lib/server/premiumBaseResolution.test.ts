import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { savePremiumBaseResolution } from "./premiumBaseResolution";
import { premiumBaseSourceKey } from "@/app/lib/autoPremiumBasis";

vi.mock("./contractHistory", () => ({ withContractHistory: (_tx: unknown, _ref: unknown, _old: unknown, patch: unknown) => patch }));
vi.mock("./cashflowMutationTracking", () => ({ trackCashflowWrite: (work: () => Promise<unknown>) => work() }));
const owner = "owner@example.test";
const row = { premiumKind: "auto_change" as const, contractNumber: "999000111", rowId: "row", productCode: "CPP_ACPIII", productKey: "cppAuto" as const,
  commissionCode: "B121", source: "own" as const, basePremium: 2536, commission: 268.82, client: null, detailUrl: null, signedAt: "02.04.2015", validFrom: "01.06.2015" };
const body = { ownerEmail: owner, entryId: "entry", statementId: "june", contractNumber: row.contractNumber, rowId: row.rowId, commissionCode: row.commissionCode,
  source: "own", basePremium: 2536, period: "payment", frequencyRaw: "semiannual" };
const getAll = vi.fn(), update = vi.fn(), parseRows = vi.fn();
const paths: string[] = [];
const ref = (path: string): unknown => ({ path, collection: (name: string) => ref(`${path}/${name}`), doc: (id: string) => ref(`${path}/${id}`) });
const db = { collection: (name: string) => ref(name), runTransaction: (work: (tx: unknown) => Promise<unknown>) => work({ getAll: (...refs: { path: string }[]) => {
  paths.push(...refs.map(ref => ref.path)); return getAll();
}, update }) } as unknown as Firestore;
const contract = { productKey: "cppAuto", frequencyRaw: "semiannual", contractNumber: row.contractNumber, inputAmount: 1145, policyStartDate: "2015-06-01", commissionPayouts: [{ amount: 268.82 }], items: [{ amount: 121.37 }] };
const statement = { html: "saved HTML", statementNumber: "75", period: "01.06.2026 - 30.06.2026", statementDate: "23.07.2026", statementChronologyMs: Date.UTC(2026, 6, 23) };
const snapshots = (data = contract) => [{ exists: true, id: "entry", data: () => data }, { exists: true, id: "june", data: () => statement }];
const options = () => ({ body, viewerEmail: owner, actorEmail: owner, teamEmails: [], canManageContractsAsAdmin: false, parseRows });
beforeEach(() => { vi.resetAllMocks(); paths.length = 0; getAll.mockResolvedValue(snapshots()); parseRows.mockReturnValue([row]); });

describe("saving statement base confirmation", () => {
  it("reads the viewer's source HTML, saves confirmation and leaves payouts and original premium untouched", async () => {
    expect(await savePremiumBaseResolution(db, options())).toEqual({ ok: true, period: "payment" });
    expect(paths).toEqual([`users/${owner}/entries/entry`, `usersPrivate/${owner}/commissionStatements/june`]);
    expect(parseRows).toHaveBeenCalledWith("saved HTML");
    const patch = update.mock.calls[0][1];
    expect(patch.premiumStatementBaseResolutions[0]).toMatchObject({ period: "payment", basePremium: 2536, frequencyRaw: "semiannual", confirmedBy: owner });
    expect(patch.premiumStatementHistory[0]).toMatchObject({ newPremium: 2536, newAnnualPremium: 5072, sourceBasePremium: 2536 });
    for (const key of ["inputAmount", "calculationInputAmount", "commissionPayouts", "items", "initialCommissionBase"]) expect(patch).not.toHaveProperty(key);
  });
  it("does not trust a caller-supplied author or source owner", async () => {
    await savePremiumBaseResolution(db, { ...options(), actorEmail: "admin@example.test", body: { ...body, confirmedBy: "forged", statementOwnerEmail: "forged" } });
    expect(update.mock.calls[0][1].premiumStatementBaseResolutions[0]).toMatchObject({ statementOwnerEmail: owner, writtenBy: owner, confirmedBy: "admin@example.test" });
  });
  it("rejects another adviser's contract before reading or writing", async () => {
    await expect(savePremiumBaseResolution(db, { ...options(), body: { ...body, ownerEmail: "other@example.test" } })).rejects.toMatchObject({ status: 403 });
    expect(getAll).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it("allows a manager to confirm their own statement against a subordinate contract", async () => {
    await savePremiumBaseResolution(db, { ...options(), teamEmails: ["child@example.test"], body: { ...body, ownerEmail: "child@example.test" } });
    expect(paths[1]).toBe(`usersPrivate/${owner}/commissionStatements/june`);
  });
  it.each([{ frequencyRaw: "annual" }, { contractNumber: "999999999" }])("rejects a changed contract %j", changes => {
    getAll.mockResolvedValue(snapshots({ ...contract, ...changes }));
    return expect(savePremiumBaseResolution(db, options())).rejects.toMatchObject({ status: 409 });
  });
  it.each([{ rows: [{ ...row, basePremium: 9999 }] }, { rows: [] }, { rows: [row, row] }])("rejects changed, missing or ambiguous source rows", async ({ rows }) => {
    parseRows.mockReturnValue(rows);
    await expect(savePremiumBaseResolution(db, options())).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled();
  });
  it.each([{ period: "guess" }, { statementId: "../another" }, { basePremium: -1 }])("rejects invalid request data %j", async change => {
    await expect(savePremiumBaseResolution(db, { ...options(), body: { ...body, ...change } })).rejects.toMatchObject({ status: 400 });
    expect(getAll).not.toHaveBeenCalled();
  });
  it("does not reuse confirmation when the same statement row changed its base", async () => {
    const oldSource = { ...row, basePremium: 9999, statementId: "june", statementNumber: "75", statementPeriod: statement.period,
      statementDate: statement.statementDate, statementOwnerEmail: owner };
    const old = { ...oldSource, key: premiumBaseSourceKey(oldSource, { productKey: "cppAuto", frequencyRaw: "semiannual" }),
      period: "annual", productKey: "cppAuto", frequencyRaw: "semiannual", writtenBy: owner, confirmedBy: owner, confirmedAtMs: 1 };
    getAll.mockResolvedValue(snapshots({ ...contract, premiumStatementBaseResolutions: [old] } as typeof contract));
    await savePremiumBaseResolution(db, options());
    const resolutions = update.mock.calls[0][1].premiumStatementBaseResolutions;
    expect(resolutions).toHaveLength(1); expect(resolutions[0]).toMatchObject({ basePremium: 2536, period: "payment" });
  });
});

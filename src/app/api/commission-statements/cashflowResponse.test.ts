import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  reads: vi.fn(),
  records: new Map<string, Record<string, unknown>>(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (email: string) => ({
        collection: (child: string) => {
          const path = `${name}/${email}/${child}`;
          const snapshot = (id: string, fields?: string[]) => ({
            id,
            exists: mocks.records.has(id),
            data: () => {
              const data = mocks.records.get(id);
              return data && fields
                ? Object.fromEntries(Object.entries(data).filter(([key]) => fields.includes(key)))
                : data;
            },
          });
          const query = (fields?: string[], limit?: number) => ({
            orderBy: () => query(fields, limit),
            limit: (nextLimit: number) => query(fields, nextLimit),
            select: (...selected: string[]) => query(selected, limit),
            get: async () => {
              mocks.reads(path, fields);
              return { docs: [...mocks.records.keys()].slice(0, limit).map(id => snapshot(id, fields)) };
            },
            doc: (id: string) => ({ get: async () => snapshot(id) }),
          });
          return query();
        },
      }),
    }),
  },
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({
  requireContractsEntryGuard: vi.fn(),
  hasContractAccess: vi.fn(),
}));

import { GET } from "./route";
import { statementMonthKey, dedupeCashflowCommissionStatements } from "@/app/cashflow/helpers";

const summaryFields = [
  "id", "fileName", "statementNumber", "statementDate", "period", "advisorNumber",
  "periodStartMs", "periodEndMs", "statementDateMs", "payoutMonthKey",
  "paidContractNumbers", "paidCommissionKeys", "commissionTotal", "payoutTotal",
  "otherPaymentsTotal", "managerCommissionTotal", "createdAtMs", "updatedAtMs",
];
const request = (query = "") => new NextRequest(`https://example.test/api/commission-statements?${query}`);
const read = async (query = "") => {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return response.json();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.records.clear();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: "advisor@example.test" } });
  mocks.records.set("statement_000001", {
    fileName: "Vypis.html", statementNumber: "123", statementDate: "10.09.2026",
    period: "01.08.2026 - 31.08.2026", advisorNumber: "42",
    periodStartMs: Date.UTC(2026, 7, 1), periodEndMs: Date.UTC(2026, 7, 31),
    statementDateMs: Date.UTC(2026, 8, 10), createdAtMs: 1000, updatedAtMs: 2000,
    commissionTotal: 1500, otherPaymentsTotal: 250, managerCommissionTotal: 300,
    payoutTotal: 2050,
    html: '<div id="ostatni_platby"><table><tr><td>Doplatek smlouvy 123456789 A101</td><td>250</td></tr></table></div>',
    autoPremiumRows: [{ rowId: "1", contractNumber: "123456789", productCode: "CPP_ACPIV", commissionCode: "B101", basePremium: 12000 }],
    processingResult: { details: "expensive unused processing details".repeat(4000) },
  });
});

describe("cashflow statement response", () => {
  it("marks bounded raw queries conservatively even when deduplication returns fewer rows", async () => {
    mocks.records.set("statement_000002", { ...mocks.records.get("statement_000001")! });
    const result = await read("shape=cashflow&limit=2");
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect((await read("shape=cashflow&limit=3")).hasMore).toBe(false);
    expect((await read("limit=2")).hasMore).toBeUndefined();
  });

  it("excludes unfinished and unknown import metadata from shadow verification", async () => {
    expect((await read("shape=cashflow")).processingComplete).toBe(false);
    const record = mocks.records.get("statement_000001")!;
    record.processedAtMs = record.updatedAtMs;
    expect((await read("shape=cashflow")).processingComplete).toBe(true);
    record.updatedAtMs = 3000;
    expect((await read("shape=cashflow")).processingComplete).toBe(false);
    mocks.records.clear();
    expect((await read("shape=cashflow")).processingComplete).toBe(true);
  });

  it("preserves every cashflow field and paid-contract matching while omitting unused details", async () => {
    const full = (await read("limit=240")).items[0];
    const compact = (await read("shape=cashflow&limit=240")).items[0];
    expect(compact).toEqual(Object.fromEntries(summaryFields.map(key => [key, full[key]])));
    expect(compact.paidContractNumbers).toEqual(["123456789"]);
    expect(compact.paidCommissionKeys).not.toHaveLength(0);
    expect(statementMonthKey(compact)).toBe(statementMonthKey(full));
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length / 10);
    expect(mocks.reads).toHaveBeenLastCalledWith(
      "usersPrivate/advisor@example.test/commissionStatements",
      expect.arrayContaining(["html", "advisorNumber", "updatedAtMs", "processedAtMs"]),
    );
    const selected = mocks.reads.mock.lastCall?.[1] as string[];
    expect(selected).not.toContain("processingResult");
    expect(selected).not.toContain("autoPremiumRows");
  });

  it("retains the same defaults and date fallback for legacy statements", async () => {
    mocks.records.set("statement_000001", { periodEndMs: Date.UTC(2026, 7, 31) });
    const full = (await read()).items[0];
    const compact = (await read("shape=cashflow")).items[0];
    expect(compact).toEqual(Object.fromEntries(summaryFields.map(key => [key, full[key]])));
    expect(compact.paidContractNumbers).toEqual([]);
    expect(compact.paidCommissionKeys).toEqual([]);
    expect(statementMonthKey(compact)).toBe(statementMonthKey(full));
  });

  it("preserves duplicate selection including the processed timestamp fallback", async () => {
    const first = mocks.records.get("statement_000001")!;
    delete first.updatedAtMs;
    first.processedAtMs = 3000;
    mocks.records.set("statement_000002", { ...first, processedAtMs: 4000, payoutTotal: 999 });
    const full = (await read("limit=240")).items;
    const compact = (await read("shape=cashflow&limit=240")).items;
    expect(compact).toHaveLength(1);
    expect(compact[0].id).toBe(full[0].id);
    expect(compact[0].payoutTotal).toBe(999);
    expect(dedupeCashflowCommissionStatements(compact)).toEqual(compact);
  });

  it("keeps month filtering and the full statement preview available", async () => {
    expect((await read("shape=cashflow&year=2025&month=1")).items).toEqual([]);
    const detail = (await read("id=statement_000001&includeHtml=1")).item;
    expect(detail.html).toBe(mocks.records.get("statement_000001")!.html);
    expect(detail.processingResult).toBeTruthy();
    expect(detail.autoPremiumRows).toHaveLength(1);
  });

  it("rejects unauthenticated requests before reading any statements", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await GET(request("shape=cashflow"))).status).toBe(401);
    expect(mocks.reads).not.toHaveBeenCalled();
  });
});

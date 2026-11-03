import "../../../tests/helpers/privateEncryptionTestKey";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealPrivateValue } from "./privateEncryption";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(), doc: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({
  adminDb: { getAll: mocks.getAll, collection: (name: string) => ({ doc: (id: string) => mocks.doc(name, id) }) },
}));

import { loadPrivateCashflowExtraPayouts, readCashflowExtraPayouts } from "./cashflowExtraPayouts";

const email = "advisor@example.test";
const payout = { id: "receipt-1", title: "Mimořádná odměna", amountCzk: 1200, payoutMonthKey: "2026-02", status: "paid" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doc.mockImplementation((name, id) => ({ path: `${name}/${id}` }));
  mocks.getAll.mockResolvedValue([{ data: () => undefined }]);
});

describe("private paid cashflow rewards", () => {
  it("opens owner-bound ciphertext and releases only the normalized financial DTO", () => {
    const sealed = sealPrivateValue([{ ...payout, source: "private-audit", recordedAtMs: 123 }], `usersPrivate/${email}:cashflowExtraPayouts`);
    vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "true");
    expect(readCashflowExtraPayouts(sealed, email)).toEqual([payout]);
    expect(() => readCashflowExtraPayouts(sealed, "other@example.test")).toThrow();
    expect(() => readCashflowExtraPayouts([payout], email)).toThrow();
    expect(readCashflowExtraPayouts(undefined, email)).toEqual([]);
  });

  it("projects only the ledger field for the verified private document", async () => {
    const sealed = sealPrivateValue([payout], `usersPrivate/${email}:cashflowExtraPayouts`);
    mocks.getAll.mockResolvedValue([{ data: () => ({ cashflowExtraPayouts: sealed }) }]);
    expect(await loadPrivateCashflowExtraPayouts(email)).toEqual([payout]);
    expect(mocks.doc).toHaveBeenCalledExactlyOnceWith("usersPrivate", email);
    expect(mocks.getAll).toHaveBeenCalledExactlyOnceWith({ path: `usersPrivate/${email}` }, { fieldMask: ["cashflowExtraPayouts"] });
  });

  it.each(["", "ADVISOR@example.test", " advisor@example.test ", "other/entries/private"])("rejects invalid verified document identity %j before reading", async invalid => {
    await expect(loadPrivateCashflowExtraPayouts(invalid)).rejects.toThrow();
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("does not turn storage failures or malformed ciphertext into an empty financial source", async () => {
    mocks.getAll.mockRejectedValue(new Error("synthetic storage failure"));
    await expect(loadPrivateCashflowExtraPayouts(email)).rejects.toThrow();
    expect(() => readCashflowExtraPayouts({ privateEncryption: 2 }, email)).toThrow();
  });
});

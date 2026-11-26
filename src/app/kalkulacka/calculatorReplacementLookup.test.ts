import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { lookupReplacementOriginal } from "./calculatorApi";

vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn() }));

const input = {
  user: {} as User, product: "kooperativaAuto" as const, contractNumber: " OLD123 ",
  ownerEmail: "advisor@example.test", scope: "my" as const,
};

beforeEach(() => vi.resetAllMocks());

describe("replacement original lookup", () => {
  it.each([
    { contracts: [] },
    { contracts: [{ contractNumber: "OLD123", productKey: "kooperativaAuto", userEmail: "manager@example.test", clientName: "Private client" }] },
  ])(
    "keeps a global match even when it is outside the selected owner's contracts", async ({ contracts }) => {
      vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
        .mockResolvedValueOnce({ ok: true, contracts });
      expect(await lookupReplacementOriginal(input)).toEqual({
        status: "foundOutsideSelectedOwner", progress: 100, adviserName: null, original: null,
      });
      expect(fetchAuthedJsonOrThrow).toHaveBeenNthCalledWith(1, input.user, "/api/contracts/original-exists", expect.objectContaining({
        method: "POST", body: JSON.stringify({ contractNumber: "OLD123", productKey: "kooperativaAuto" }),
      }));
    },
  );

  it("keeps the global match if the ordinary scoped lookup fails", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
      .mockRejectedValueOnce(new Error("Scoped lookup unavailable"));
    expect(await lookupReplacementOriginal(input)).toMatchObject({ status: "foundOutsideSelectedOwner" });
  });

  it.each([
    [{ ok: true, exists: false, matchesProduct: false }, "notFound"],
    [{ ok: true, exists: true, matchesProduct: false }, "wrongProduct"],
  ])("uses the global existence and product result without a scoped lookup: %j", async (response, status) => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce(response);
    expect(await lookupReplacementOriginal(input)).toMatchObject({ status, adviserName: null, original: null });
    expect(fetchAuthedJsonOrThrow).toHaveBeenCalledOnce();
  });

  it("keeps permitted NEON preview data for an exact owned original", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
      .mockResolvedValueOnce({ ok: true, contracts: [{
        contractNumber: "OLD123", productKey: "neon", userEmail: input.ownerEmail,
        adviserName: "Test Adviser", inputAmount: 1_000, policyStartDate: "2024-01-01",
      }] });
    expect(await lookupReplacementOriginal({ ...input, product: "neon" })).toMatchObject({
      status: "found", adviserName: "Test Adviser", original: { premiumAmount: 1_000 },
    });
  });

  it("reads the authorized FLEXI original and its effective premium using a POST", async () => {
    const original = { contractNumber: "OLD123", productKey: "flexi", userEmail: input.ownerEmail,
      inputAmount: 1000, policyStartDate: "2024-01-01",
      lifePremiumChanges: [
        { policyStartDate: "2025-01-01", premiumAmount: 1100 },
        { policyStartDate: "2027-01-01", premiumAmount: 1300 },
      ],
    };
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
      .mockResolvedValueOnce({ results: [{ ok: true, contracts: [{ ...original, entryType: "endorsement" }, original] }] });
    expect(await lookupReplacementOriginal({ ...input, product: "flexi", flexiRenovationStartDate: "2026-12-01" }))
      .toMatchObject({ status: "found", original: { premiumAmount: 1100 } });
    expect(fetchAuthedJsonOrThrow).toHaveBeenNthCalledWith(2, input.user, "/api/contracts/find", expect.objectContaining({
      method: "POST", body: JSON.stringify({ requests: [{ key: "original", scope: "my", q: "OLD123" }] }),
    }));
  });

  it.each(["foreign", "ambiguous"])("withholds FLEXI premium for an %s match", async (kind) => {
    const original = { contractNumber: "OLD123", productKey: "flexi", userEmail: input.ownerEmail, inputAmount: 1000 };
    const contracts = kind === "foreign" ? [{ ...original, userEmail: "other@example.test" }] : [original, { ...original, inputAmount: 1200 }];
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
      .mockResolvedValueOnce({ results: [{ ok: true, contracts }] });
    expect(await lookupReplacementOriginal({ ...input, product: "flexi" })).toMatchObject({ original: null, adviserName: null });
  });

  it("does not mistake a partial ordinary search result for the original", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValueOnce({ ok: true, exists: true, matchesProduct: true })
      .mockResolvedValueOnce({ ok: true, contracts: [{
        contractNumber: "OLD1234", productKey: input.product, userEmail: input.ownerEmail,
      }] });
    expect(await lookupReplacementOriginal(input)).toMatchObject({ status: "foundOutsideSelectedOwner", original: null });
  });

  it("propagates a denied global lookup", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(lookupReplacementOriginal(input)).rejects.toThrow("Unauthorized");
    expect(fetchAuthedJsonOrThrow).toHaveBeenCalledOnce();
  });
});

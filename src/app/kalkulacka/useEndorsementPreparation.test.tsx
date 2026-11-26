// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { useEndorsementPreparation, type PrepareEndorsementOptions } from "./useEndorsementPreparation";

vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn() }));
const owner = "adviser@example.test";
const original = (overrides: Record<string, unknown> = {}) => ({
  id: "original", userEmail: owner, contractNumber: "1400000088", clientName: "Jana Původní",
  productKey: "flexi", position: "poradce3", commissionMode: "standard", frequencyRaw: "monthly",
  contractSignedDate: "2020-01-01", policyStartDate: "2020-01-01", durationYears: 30, inputAmount: 1000,
  ...overrides,
});
const pdfOptions: PrepareEndorsementOptions = { source: "pdf", productOverride: "flexi", contractNumberOverride: "1400000088",
  contractSignedDateOverride: "2026-11-12", policyStartDateOverride: "2026-12-01", frequencyOverride: "monthly", newPremiumAmountOverride: 1400 };

describe("FLEXI PDF endorsement preparation", () => {
  let root: Root;
  let prepare: ReturnType<typeof useEndorsementPreparation>;
  let settings: Parameters<typeof useEndorsementPreparation>[0];

  function Harness() {
    const handler = useEndorsementPreparation(settings);
    useEffect(() => { prepare = handler; }, [handler]);
    return null;
  }
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(document.createElement("div"));
    vi.mocked(fetchAuthedJsonOrThrow).mockReset().mockResolvedValue({ ok: true, contracts: [original()] });
    settings = {
      user: { email: owner } as User, hasSelectedProduct: true, product: "cppAuto", effectiveSaveOwnerEmail: owner,
      tipsterModeEnabled: false, contractNumber: "OLD123", contractSignedDate: "2026-01-01", policyStartDate: "",
      amountText: "999", durationYears: null, durationMonths: null, endorsementDurationManualOverride: false,
      mode: "standard", frequency: "quarterly", maxCizinKomplexVariant: null, isSavingForSubordinate: false,
      resolveEndorsementPositionForSignedDate: vi.fn(() => "poradce3" as const),
      setEndorsementWorkflowActive: vi.fn(), setEndorsementPreviewSource: vi.fn(), setEndorsementDraft: vi.fn(),
      setEndorsementDraftModalOpen: vi.fn(), setDurationYears: vi.fn(), setDurationMonths: vi.fn(), setClientName: vi.fn(),
      setValidationError: vi.fn(), setSaveMessage: vi.fn(), setMissingFields: vi.fn(),
    };
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
  const run = async (options = pdfOptions) => {
    await act(async () => root.render(<Harness />));
    let result = false;
    await act(async () => { result = await prepare(options); });
    return result;
  };

  it("uses the PDF overrides while form state still belongs to a previous product", async () => {
    expect(await run()).toBe(true);
    expect(settings.setEndorsementDraft).toHaveBeenCalledWith(expect.objectContaining({ productKey: "flexi",
      contractNumber: "1400000088", contractSignedDate: "2026-11-12", durationYears: 24,
      previousPremiumAmount: 1000, newPremiumAmount: 1400, calculationAmount: 400,
      sourceEntryId: "original",
    }));
    expect(settings.setClientName).toHaveBeenCalledWith("Jana Původní");
    expect(settings.setEndorsementDraftModalOpen).toHaveBeenCalledWith(false);
  });

  it("uses the live or manually edited name when preparing a manual Neon change", async () => {
    settings = { ...settings, product: "neon", contractNumber: "1400000088", policyStartDate: "2026-02-01",
      amountText: "1400", frequency: "monthly", useLiveNeonClientName: true };
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ results: [{ ok: true, contracts: [original({ productKey: "neon" })] }] });
    expect(await run({ source: "manual" })).toBe(true);
    expect(settings.setEndorsementDraft).toHaveBeenCalledWith(expect.objectContaining({ productKey: "neon", sourceEntryId: "original" }));
    expect(settings.setClientName).not.toHaveBeenCalled();
    expect(fetchAuthedJsonOrThrow).toHaveBeenCalledWith(settings.user, "/api/contracts/find", expect.objectContaining({ method: "POST" }));
  });

  it.each([
    { userEmail: "other@example.test" }, { contractNumber: "14000000881" }, { productKey: "neon" },
  ])("does not prepare a change from an unrelated source (%j)", async overrides => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, contracts: [original(overrides)] });
    expect(await run()).toBe(false);
    expect(settings.setEndorsementDraft).not.toHaveBeenCalled();
    expect(settings.setClientName).not.toHaveBeenCalled();
  });

  it("keeps the PDF policyholder available when the original is absent", async () => {
    vi.mocked(fetchAuthedJsonOrThrow).mockResolvedValue({ ok: true, contracts: [] });
    expect(await run()).toBe(false);
    expect(settings.setClientName).not.toHaveBeenCalled();
    expect(settings.setValidationError).toHaveBeenCalledWith(expect.stringContaining("původní smlouva"));
  });

  it("requires authentication before looking up an original", async () => {
    settings.user = null;
    expect(await run()).toBe(false);
    expect(fetchAuthedJsonOrThrow).not.toHaveBeenCalled();
  });

  it.each([401, 403])("does not prepare a change when the backend denies access (%s)", async status => {
    vi.mocked(fetchAuthedJsonOrThrow).mockRejectedValue({ status });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await run()).toBe(false);
      expect(settings.setEndorsementDraft).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith("Chyba při přípravě dodatku.");
    } finally { log.mockRestore(); }
  });

  it("does not apply a lookup result after its PDF import has been cancelled", async () => {
    const controller = new AbortController();
    vi.mocked(fetchAuthedJsonOrThrow).mockImplementation(async () => {
      controller.abort(); return { ok: true, contracts: [original()] };
    });
    expect(await run({ ...pdfOptions, signal: controller.signal })).toBe(false);
    expect(settings.setEndorsementDraft).not.toHaveBeenCalled();
  });
});

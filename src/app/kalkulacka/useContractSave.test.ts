import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  getContractsMutationError: vi.fn(),
  requestContractsMutationWithAuth: vi.fn(),
  uploadContractPdfAttachmentWithAuth: vi.fn(),
}));

vi.mock("./calculatorApi", () => mocks);

import { saveContractEntry } from "./useContractSave";

const input = () => ({
  user: {} as User,
  ownerEmail: "adviser@example.com",
  entry: { productKey: "flexi", contractNumber: "123456" },
  fallbackError: "Uložení smlouvy selhalo.",
  pdfFile: null,
});

describe("saveContractEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContractsMutationError.mockReturnValue(null);
    mocks.requestContractsMutationWithAuth.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: { entryId: " saved-entry ", refreshOriginalEntryId: " original-entry " },
    });
  });

  it("sends one idempotent create request and returns the saved identifiers", async () => {
    const result = await saveContractEntry(input());

    expect(mocks.requestContractsMutationWithAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/contracts",
        method: "POST",
        payload: {
          ownerEmail: "adviser@example.com",
          entry: { productKey: "flexi", contractNumber: "123456" },
        },
        idempotencyKey: expect.any(String),
      })
    );
    expect(result).toEqual({
      ok: true,
      entryId: "saved-entry",
      linkedRefreshOriginalEntryId: "original-entry",
      pdfAttachment: { status: "not-requested" },
    });
  });

  it("keeps a saved contract when its PDF attachment fails", async () => {
    mocks.uploadContractPdfAttachmentWithAuth.mockRejectedValue(new Error("Storage nedostupné"));

    const result = await saveContractEntry({
      ...input(),
      pdfFile: {} as File,
    });

    expect(mocks.uploadContractPdfAttachmentWithAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerEmail: "adviser@example.com",
        entryId: "saved-entry",
      })
    );
    expect(result).toEqual({
      ok: true,
      entryId: "saved-entry",
      linkedRefreshOriginalEntryId: "original-entry",
      pdfAttachment: { status: "failed", message: "Storage nedostupné" },
    });
  });

  it("returns the API error without trying to attach a PDF", async () => {
    mocks.getContractsMutationError.mockReturnValue("Smlouva už existuje.");

    const result = await saveContractEntry({
      ...input(),
      pdfFile: {} as File,
    });

    expect(result).toEqual({ ok: false, error: "Smlouva už existuje." });
    expect(mocks.uploadContractPdfAttachmentWithAuth).not.toHaveBeenCalled();
  });
});

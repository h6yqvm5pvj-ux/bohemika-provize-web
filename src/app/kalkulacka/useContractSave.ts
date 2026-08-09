"use client";

import { useCallback } from "react";
import type { User } from "firebase/auth";

import {
  getContractsMutationError,
  requestContractsMutationWithAuth,
  uploadContractPdfAttachmentWithAuth,
} from "./calculatorApi";
import { buildContractsCreateIdempotencyKey } from "./calculatorHelpers";

type PdfAttachmentState =
  | { status: "not-requested" }
  | { status: "uploaded" }
  | { status: "failed"; message: string };

export type ContractEntrySaveResult =
  | { ok: false; error: string }
  | {
      ok: true;
      entryId: string;
      linkedRefreshOriginalEntryId: string | null;
      pdfAttachment: PdfAttachmentState;
    };

const invalidateContractsCache = () => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("contracts_cache_v2");
    sessionStorage.removeItem("contracts_cache_v3");
    localStorage.setItem("contracts_last_updated", String(Date.now()));
    window.dispatchEvent(new Event("contracts:updated"));
  } catch {
    // The save is already durable; cache invalidation is best effort only.
  }
};

export type SaveContractEntryInput = {
  user: User;
  ownerEmail: string;
  entry: Record<string, unknown>;
  fallbackError: string;
  pdfFile: File | null;
};

/** Shared persistence boundary for both a new contract and its endorsement. */
export const saveContractEntry = async ({
  user,
  ownerEmail,
  entry,
  fallbackError,
  pdfFile,
}: SaveContractEntryInput): Promise<ContractEntrySaveResult> => {
  const { response, data } = await requestContractsMutationWithAuth({
    user,
    path: "/api/contracts",
    method: "POST",
    payload: {
      ownerEmail,
      entry,
    },
    idempotencyKey: buildContractsCreateIdempotencyKey({ ownerEmail, entry }),
  });
  const apiError = getContractsMutationError({
    response,
    data,
    fallback: fallbackError,
  });
  if (apiError) return { ok: false, error: apiError };

  const entryId = typeof data?.entryId === "string" ? data.entryId.trim() : "";
  if (!entryId) {
    return {
      ok: false,
      error: "Server potvrdil uložení bez ID smlouvy. Zkus to prosím znovu.",
    };
  }

  const linkedRefreshOriginalEntryId =
    typeof data?.refreshOriginalEntryId === "string" &&
    data.refreshOriginalEntryId.trim().length > 0
      ? data.refreshOriginalEntryId.trim()
      : null;
  let pdfAttachment: PdfAttachmentState;
  if (!pdfFile) {
    pdfAttachment = { status: "not-requested" };
  } else {
    try {
      await uploadContractPdfAttachmentWithAuth({
        user,
        ownerEmail,
        entryId,
        file: pdfFile,
      });
      pdfAttachment = { status: "uploaded" };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "PDF se nepodařilo přiložit.";
      pdfAttachment = { status: "failed", message };
    }
  }

  invalidateContractsCache();
  return {
    ok: true,
    entryId,
    linkedRefreshOriginalEntryId,
    pdfAttachment,
  };
};

/**
 * Gives the page a stable save function. The function owns the API mutation,
 * idempotency key, optional PDF attachment and cache invalidation; the page
 * stays responsible only for form-specific validation and UI.
 */
export const useContractSave = () =>
  useCallback((input: SaveContractEntryInput) => saveContractEntry(input), []);

import type { User as FirebaseUser } from "firebase/auth";
import type { Position, Product } from "@/app/types/domain";
import { fetchAuthedJsonOrThrow } from "./authenticatedApi";

export type AnniversaryContract = {
  id: string;
  entryType?: string | null;
  status?: string | null;
  productKey?: Product | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  contractNumber?: string | null;
  policyStartDate?: unknown;
  policyEndDate?: unknown;
  contractSignedDate?: unknown;
  createdAt?: unknown;
  durationYears?: number | null;
  durationMonths?: number | null;
  userEmail?: string | null;
  adviserEmail?: string | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
};

export type AnniversaryPortfolioResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  contracts: AnniversaryContract[];
  hasMore: boolean;
  nextCursor: string | null;
};

/** Publish a portfolio only after every page has loaded successfully. */
export async function loadAnniversaryPortfolio(user: FirebaseUser, signal: AbortSignal) {
  const contracts = new Map<string, AnniversaryContract>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let position: Position | null = null;

  do {
    signal.throwIfAborted();
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    const data: AnniversaryPortfolioResponse = await fetchAuthedJsonOrThrow<AnniversaryPortfolioResponse>(
      user,
      `/api/contracts/anniversary-portfolio${cursor ? `?${params}` : ""}`,
      { signal }
    );
    signal.throwIfAborted();
    if (!data?.ok || !Array.isArray(data.contracts) || typeof data.hasMore !== "boolean") {
      throw new Error(data?.error || "Nepodařilo se načíst celé portfolio smluv.");
    }
    position = data.position ?? null;
    for (const contract of data.contracts) {
      const owner = (contract.adviserEmail ?? contract.userEmail ?? "").trim().toLowerCase();
      contracts.set(`${owner}__${contract.id}`, contract);
    }
    if (!data.hasMore) break;
    if (!data.nextCursor || seenCursors.has(data.nextCursor)) {
      throw new Error("Načítání portfolia se přerušilo. Zkus to prosím znovu.");
    }
    cursor = data.nextCursor;
    seenCursors.add(cursor);
  } while (true);

  return { contracts: Array.from(contracts.values()), position };
}

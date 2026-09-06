import { FieldPath, type Firestore } from "firebase-admin/firestore";
import type { AnniversaryContract } from "@/app/lib/anniversaryPortfolio";
import { toDate } from "@/app/lib/formatters";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { getAnniversaryStartDate, isAnniversarySoon, shouldTrackAnniversary } from "@/app/lib/contractAnniversary";
import type { ContractDoc } from "./contractsApi.types";

const SCAN_PAGE_SIZE = 250;
const fields = [
  "entryType", "status", "productKey", "clientName", "clientPhone", "clientEmail",
  "contractNumber", "durationYears", "durationMonths", "carHullSumInsured",
  "carHullSumInsuredText", "carHullDeductible", "carHullDeductibleText",
  "carHullRiskAccident", "carHullRiskTheft", "carHullRiskNatural",
  "carHullRiskVandalism", "carHullRiskAnimalCollision",
] as const satisfies ReadonlyArray<keyof AnniversaryContract>;
const dateFields = ["policyStartDate", "policyEndDate", "contractSignedDate", "createdAt"] as const;

type PortfolioCursor = { owner: string; entry: string | null };
export class InvalidPortfolioCursorError extends Error {}

function decodeCursor(value: string | null, owners: string[]): PortfolioCursor | null {
  if (!value) return null;
  try {
    if (value.length > 4096) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as PortfolioCursor;
    if (
      !parsed || !owners.includes(parsed.owner) ||
      !(parsed.entry === null || (typeof parsed.entry === "string" && parsed.entry.length > 0 &&
        parsed.entry.length <= 1500 && !parsed.entry.includes("/")))
    ) throw new Error();
    return parsed;
  } catch {
    throw new InvalidPortfolioCursorError("Výběr portfolia se změnil. Načti Radar znovu.");
  }
}

const encodeCursor = (cursor: PortfolioCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

function toAnniversaryContract(id: string, owner: string, data: ContractDoc): AnniversaryContract {
  // The Radar needs contact and anniversary data, not the full contract payload.
  const result: Record<string, unknown> = { id, adviserEmail: owner, userEmail: owner };
  for (const field of fields) if (data[field] !== undefined) result[field] = data[field];
  for (const field of dateFields) result[field] = toDate(data[field])?.getTime() ?? null;
  return result as AnniversaryContract;
}

/**
 * Page through raw documents before filtering anniversaries. A page with no
 * anniversaries can still have a cursor: older contracts must also be checked.
 * Document IDs cover legacy contracts with missing or identical signing dates.
 */
export async function readAnniversaryPortfolioPage({
  db, owners: authorizedOwners, cursor: encodedCursor,
}: { db: Firestore; owners: string[]; cursor: string | null }) {
  const owners = [...new Set(authorizedOwners.map(owner => owner.trim().toLowerCase()).filter(Boolean))].sort();
  const cursor = decodeCursor(encodedCursor, owners);
  const contracts: AnniversaryContract[] = [];
  let remaining = SCAN_PAGE_SIZE;

  for (let i = cursor ? owners.indexOf(cursor.owner) : 0; i < owners.length; i++) {
    const owner = owners[i]!;
    let query = db.collection("users").doc(owner).collection("entries")
      .select(...fields, ...dateFields).orderBy(FieldPath.documentId());
    if (cursor?.owner === owner && cursor.entry) query = query.startAfter(cursor.entry);
    const snapshot = await query.limit(remaining + 1).get();
    const scanned = snapshot.docs.slice(0, remaining);
    for (const doc of scanned) {
      const data = doc.data() as ContractDoc;
      if (
        (!data.entryType || data.entryType === "contract") &&
        shouldTrackAnniversary(data.productKey) &&
        contractLifecycleStatus(data) === "active" &&
        isAnniversarySoon(getAnniversaryStartDate(data)).soon
      ) {
        contracts.push(toAnniversaryContract(doc.id, owner, data));
      }
    }
    remaining -= scanned.length;
    if (snapshot.docs.length > scanned.length) {
      return { contracts, hasMore: true, nextCursor: encodeCursor({ owner, entry: scanned.at(-1)!.id }) };
    }
    if (remaining === 0 && i + 1 < owners.length) {
      return { contracts, hasMore: true, nextCursor: encodeCursor({ owner: owners[i + 1]!, entry: null }) };
    }
  }

  return { contracts, hasMore: false, nextCursor: null };
}

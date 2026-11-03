import {
  normalizeCashflowExtraPayouts,
  type CashflowExtraPayout,
} from "@/app/cashflow/extraPayouts";
import { openPrivateValue } from "./privateEncryption";

function privatePayoutContext(email: string): string {
  if (!email || email !== email.trim().toLowerCase() || email.includes("/") || email.length > 254) {
    throw new Error("Invalid verified cashflow owner.");
  }
  return `usersPrivate/${email}:cashflowExtraPayouts`;
}

/** Call only after authorizing the effective account. Never read this field from a public profile. */
export function readCashflowExtraPayouts(value: unknown, email: string): CashflowExtraPayout[] {
  return normalizeCashflowExtraPayouts(openPrivateValue(value, privatePayoutContext(email)));
}

/** The caller supplies a server-verified account, not an email from request input. */
export async function loadPrivateCashflowExtraPayouts(email: string): Promise<CashflowExtraPayout[]> {
  privatePayoutContext(email);
  const { adminDb } = await import("./firebaseAdmin");
  if (!adminDb) throw new Error("Cashflow payouts are unavailable.");
  const [snapshot] = await adminDb.getAll(adminDb.collection("usersPrivate").doc(email), {
    fieldMask: ["cashflowExtraPayouts"],
  });
  return readCashflowExtraPayouts(snapshot.data()?.cashflowExtraPayouts, email);
}

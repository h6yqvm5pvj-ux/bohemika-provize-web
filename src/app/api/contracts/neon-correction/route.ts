import { NextResponse, type NextRequest } from "next/server";
import { historyValue } from "@/app/lib/contractHistory";
import { canSetNeonCorrection, neonCorrectedAnnualBase } from "@/app/lib/neonCorrection";
import { withCashflowMutation, trackCashflowWrite } from "@/lib/server/cashflowMutationTracking";
import { withContractHistory } from "@/lib/server/contractHistory";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { openPrivateRecord } from "@/lib/server/privateRecords";
import { buildNeonCorrectionPatch, requireContractsEntryGuard } from "../_lib/contractsApi";
import type { ContractDoc } from "../_lib/contractsApi.types";
import { isSafeContractNoteId } from "../notes/contractNotes";

class NeonCorrectionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function POST(request: NextRequest) {
  return withCashflowMutation("contracts:neon-correction", async () => {
    const guard = await requireContractsEntryGuard(request, {
      namespace: "api:contracts:neon-correction", limit: 30, windowMs: 60_000,
    });
    if (!guard.ok) return guard.response;
    const respond = (status: number, error: string) => guard.withRateLimit(NextResponse.json({ ok: false, error }, { status }));
    if (guard.ctx.accountType === "tipster") return respond(403, "Nemáš oprávnění upravit tuto smlouvu.");

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond(400, "Neplatný požadavek.");
    const data = body as Record<string, unknown>;
    if (Object.keys(data).some(key => !["ownerEmail", "entryId", "monthlyPremium", "annualCorrection",
      "previousMonthlyPremium", "previousAnnualCorrection"].includes(key))) {
      return respond(400, "Požadavek obsahuje nepovolené pole.");
    }
    const owner = typeof data.ownerEmail === "string" ? data.ownerEmail.trim().toLowerCase() : "";
    const { entryId, monthlyPremium, annualCorrection, previousMonthlyPremium, previousAnnualCorrection } = data;
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(owner) || owner.length > 254 || !isSafeContractNoteId(entryId)) {
      return respond(400, "Chybí platná identifikace smlouvy.");
    }
    const annualBase = neonCorrectedAnnualBase(monthlyPremium, annualCorrection);
    if (annualBase === null || typeof monthlyPremium !== "number" || typeof annualCorrection !== "number" ||
        (previousMonthlyPremium !== null && (typeof previousMonthlyPremium !== "number" || !Number.isFinite(previousMonthlyPremium))) ||
        (previousAnnualCorrection !== null && (typeof previousAnnualCorrection !== "number" || !Number.isFinite(previousAnnualCorrection)))) {
      return respond(400, "Zadej kladné pojistné a korekci nižší než roční pojistné, nejvýše na dvě desetinná místa.");
    }
    if (owner !== guard.ctx.email && !guard.ctx.contractAccessEmails.includes(owner)) {
      return respond(403, "Nemáš oprávnění upravit tuto smlouvu.");
    }
    const db = adminDb;
    if (!db) return respond(503, "Služba je dočasně nedostupná.");

    const ref = db.collection("users").doc(owner).collection("entries").doc(entryId);
    try {
      await trackCashflowWrite(() => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new NeonCorrectionError(404, "Smlouva nebyla nalezena.");
        const contract = openPrivateRecord(ref.path, snapshot.data()!) as ContractDoc;
        if (contract.userEmail && contract.userEmail.trim().toLowerCase() !== owner) {
          throw new NeonCorrectionError(409, "Správce smlouvy se změnil. Obnov detail.");
        }
        if (!canSetNeonCorrection(contract)) {
          throw new NeonCorrectionError(400, "Korekci lze zadat u původní smlouvy ČPP NEON sjednané do konce roku 2021.");
        }
        const oldCorrection = contract.neonCorrection?.annualAmount ?? null;
        const oldMonthlyPremium = contract.inputAmount ?? null;
        if (oldCorrection === annualCorrection && oldMonthlyPremium === monthlyPremium) return;
        if (oldCorrection !== previousAnnualCorrection || oldMonthlyPremium !== previousMonthlyPremium) {
          throw new NeonCorrectionError(409, "Pojistné nebo korekce se mezitím změnily. Obnov detail a zkus to znovu.");
        }
        const patch = buildNeonCorrectionPatch(contract, monthlyPremium, annualBase, {
          annualAmount: annualCorrection,
        });
        if (!patch) throw new NeonCorrectionError(409, "Chybí údaje potřebné k přepočtu provize.");
        transaction.update(ref, withContractHistory(transaction, ref, contract, patch, {
          actorEmail: guard.ctx.actorEmail, kind: "updated", title: "ČPP korekce",
          changes: [
            { label: "Měsíční pojistné (Kč)", before: historyValue(oldMonthlyPremium), after: historyValue(monthlyPremium) },
            { label: "ČPP korekce (Kč ročně)", before: historyValue(oldCorrection), after: historyValue(annualCorrection) },
          ],
        }));
      }), db);
      return guard.withRateLimit(NextResponse.json({ ok: true }));
    } catch (error) {
      if (error instanceof NeonCorrectionError) return respond(error.status, error.message);
      return respond(503, "ČPP korekci se nepodařilo uložit. Zkus to znovu.");
    }
  });
}

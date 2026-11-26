import { randomUUID } from "node:crypto";
import { openPrivateRecord } from "@/lib/server/privateRecords";
import { NextResponse, type NextRequest } from "next/server";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { withCashflowMutation, trackCashflowWrite } from "@/lib/server/cashflowMutationTracking";
import { withContractHistory } from "@/lib/server/contractHistory";
import { isSafeContractNoteId } from "../notes/contractNotes";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { autoAnnualPremiumAtDate, contractPaymentFrequencies, MAX_PAYMENT_FREQUENCY_CHANGES, normalizePaymentFrequencyChanges, paymentFrequencyAtDate } from "@/app/lib/autoPaymentFrequency";
import { isFrequencyAutoPayoutProduct } from "@/app/lib/productCatalog";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { historyValue } from "@/app/lib/contractHistory";
import type { PaymentFrequency } from "@/app/types/domain";
import type { ContractDoc } from "../_lib/contractsApi.types";

class FrequencyChangeError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const failure = (status: number, message: string) => new FrequencyChangeError(status, message);

export async function POST(request: NextRequest) {
  return withCashflowMutation("contracts:payment-frequency", async () => {
    const guard = await requireContractsEntryGuard(request, { namespace: "api:contracts:payment-frequency", limit: 60, windowMs: 60_000 });
    if (!guard.ok) return guard.response;
    const respond = (status: number, error: string) => guard.withRateLimit(NextResponse.json({ ok: false, error }, { status }));
    if (guard.ctx.accountType === "tipster") return respond(403, "Nemáš oprávnění upravit tuto smlouvu.");
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return respond(400, "Neplatný požadavek.");
    const data = body as Record<string, unknown>;
    if (Object.keys(data).some(key => !["ownerEmail", "entryId", "effectiveDate", "frequency", "revision", "annualPremium"].includes(key))) return respond(400, "Požadavek obsahuje nepovolené pole.");
    const owner = typeof data.ownerEmail === "string" ? data.ownerEmail.trim().toLowerCase() : "";
    const day = typeof data.effectiveDate === "string" ? data.effectiveDate : "";
    if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(owner) || owner.length > 254 || !isSafeContractNoteId(data.entryId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) || endorsementCommissionDay(day) !== day || day < "1900-01-01" || day > "2199-12-31" ||
      typeof data.frequency !== "string" || !["monthly", "quarterly", "semiannual", "annual"].includes(data.frequency) ||
      !Number.isSafeInteger(data.revision) || Number(data.revision) < 0) return respond(400, "Vyber platnou frekvenci a datum účinnosti.");
    const frequency = data.frequency as PaymentFrequency;
    const premiumChange = data.annualPremium !== undefined;
    if (premiumChange && (typeof data.annualPremium !== "number" || !Number.isFinite(data.annualPremium) || data.annualPremium <= 0 || data.annualPremium > 1e9 || Math.abs(data.annualPremium * 100 - Math.round(data.annualPremium * 100)) > 0.00001)) return respond(400, "Zadej platné roční pojistné v Kč, nejvýše na dvě desetinná místa.");
    const allowedOwners = new Set([guard.ctx.email, ...guard.ctx.contractAccessEmails]);
    if (!allowedOwners.has(owner)) return respond(403, "Nemáš oprávnění upravit tuto smlouvu.");
    if (!adminDb) return respond(503, "Služba je dočasně nedostupná.");
    const db = adminDb;
    const ref = db.collection("users").doc(owner).collection("entries").doc(data.entryId);
    const endorsementId = premiumChange ? randomUUID() : null;
    try {
      await trackCashflowWrite(() => db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw failure(404, "Smlouva nebyla nalezena.");
        const contract = openPrivateRecord(ref.path, snapshot.data()!) as ContractDoc;
        if (contract.userEmail && contract.userEmail.trim().toLowerCase() !== owner) throw failure(409, "Správce smlouvy se změnil. Obnov detail.");
        if ((contract.entryType != null && contract.entryType !== "contract") || !contractPaymentFrequencies(contract.productKey).includes(frequency)) throw failure(400, "Pro tento produkt nelze vybranou frekvenci nastavit.");
        const isKomplex = contract.productKey === "cppPPRs";
        if (isKomplex && (!premiumChange || Math.round(Number(data.annualPremium) * 100) % periodsPerYear(frequency) !== 0)) {
          throw failure(400, "Zadej pojistné za jednu platbu v Kč, nejvýše na dvě desetinná místa.");
        }
        const start = endorsementCommissionDay(contract.policyStartDate);
        if (!start || day <= start) throw failure(400, "Změna musí být účinná po počátku smlouvy.");
        let changes;
        try { changes = normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges); }
        catch { throw failure(409, "Historii frekvencí nelze bezpečně změnit."); }
        if (changes.length !== data.revision) throw failure(409, "Historie se mezitím změnila. Obnov detail a zkus to znovu.");
        if (changes.length >= MAX_PAYMENT_FREQUENCY_CHANGES) throw failure(400, "Byl dosažen limit změn frekvence.");
        if (changes.length && day <= changes[changes.length - 1].effectiveDate) throw failure(400, "Nová změna musí následovat po poslední uložené změně.");
        const previous = paymentFrequencyAtDate(contract, day);
        if (!previous || (!premiumChange && previous === frequency)) throw failure(400, "Vyber jinou frekvenci než dosud platnou.");
        const oldAnnual = autoAnnualPremiumAtDate(contract, day);
        const baseAnnual = autoAnnualPremiumAtDate(contract, start);
        if (premiumChange && (!oldAnnual || !baseAnnual)) throw failure(409, "Chybí ověřitelné původní pojistné. Nejprve doplň původní smlouvu.");
        if (premiumChange && oldAnnual === data.annualPremium && previous === frequency) throw failure(400, "Pojistné ani frekvence se nemění.");
        const patch = { paymentFrequencyChanges: [...changes, { effectiveDate: day, frequency,
          ...(premiumChange ? { annualPremium: data.annualPremium, baseAnnualPremium: baseAnnual, endorsementId } : {}) }] };
        if (endorsementId) {
          const amendmentRef = ref.parent.doc(endorsementId);
          // The amendment changes the original contract's schedule and has no commission of its own.
          const perPayment = isKomplex || isFrequencyAutoPayoutProduct(contract.productKey);
          const count = perPayment ? periodsPerYear(frequency) : 1;
          const oldCount = perPayment ? periodsPerYear(previous) : 1;
          const newInput = Math.round(Number(data.annualPremium) / count * 100) / 100;
          const amendment = {
            userEmail: owner, adviserEmail: owner, clientName: contract.clientName ?? null, contractNumber: contract.contractNumber ?? null,
            productKey: contract.productKey, entryType: "endorsement", rootContractEntryId: ref.id, parentContractEntryId: ref.id,
            parentContractEntryPath: ref.path, policyStartDate: day, contractSignedDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }),
            createdAt: new Date(), frequencyRaw: frequency, previousInputAmount: Math.round(oldAnnual! / oldCount * 100) / 100,
            inputAmount: newInput, newInputAmount: newInput, effectiveInputAmount: newInput,
            autoPremiumAnnual: data.annualPremium, autoPremiumPreviousAnnual: oldAnnual,
            premiumDelta: Number(data.annualPremium) - oldAnnual!, changeType: Number(data.annualPremium) > oldAnnual! ? "increase" : Number(data.annualPremium) < oldAnnual! ? "decrease" : "same",
            autoPremiumAmendment: true, previousFrequency: previous, items: [], total: 0,
            position: contract.position ?? null, commissionMode: contract.commissionMode ?? null,
          };
          transaction.create(amendmentRef, withContractHistory(transaction, amendmentRef, {}, amendment, {
            actorEmail: guard.ctx.actorEmail, kind: "created", title: isKomplex ? "Změna pojistného nebo frekvence na smlouvě" : "Změna pojistného / frekvence na smlouvě auta",
            changes: [{ label: "Roční pojistné", before: historyValue(oldAnnual), after: historyValue(data.annualPremium) },
              { label: "Frekvence placení", before: historyValue(previous), after: historyValue(data.frequency) }],
          }));
        }
        transaction.update(ref, withContractHistory(transaction, ref, contract as Record<string, unknown>, patch, {
          actorEmail: guard.ctx.actorEmail, kind: "updated", title: premiumChange ? (isKomplex ? "Změna na smlouvě" : "Změna na smlouvě auta") : "Změna frekvence placení",
          changes: [{ label: "Frekvence placení", before: historyValue(previous), after: historyValue(data.frequency) }, { label: "Účinnost změny", before: null, after: historyValue(day) }, ...(premiumChange ? [{ label: "Roční pojistné", before: historyValue(oldAnnual), after: historyValue(data.annualPremium) }] : [])],
        }));
      }));
      return guard.withRateLimit(NextResponse.json({ ok: true, ...(endorsementId ? { endorsementId } : {}) }));
    } catch (error) {
      if (error instanceof FrequencyChangeError) return respond(error.status, error.message);
      return respond(503, "Změnu frekvence se nepodařilo uložit. Zkus to znovu.");
    }
  });
}

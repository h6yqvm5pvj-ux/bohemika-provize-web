import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { toDate } from "@/app/lib/formatters";
import { calculateNeonDecreaseStornoBase, confirmedNeonRefreshAnnualBase } from "@/app/lib/productFormulas/neon";
import { resolveRemainingEndorsementDurationYears } from "@/app/kalkulacka/endorsementCalculation";
import { isSafeContractNoteId } from "../notes/contractNotes";
import { normalizeContractNumber, normalizeContractEntryType } from "./contractsApi.identity";
import type { ContractDoc } from "./contractsApi.types";

export class NeonEndorsementError extends Error {
  constructor(readonly statusCode: 400 | 403 | 404 | 409, message: string) { super(message); }
}

export function parseNeonEndorsementRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).some(key => !["ownerEmail", "entryId", "effectiveDate", "signedDate", "monthlyPremium"].includes(key))) {
    throw new NeonEndorsementError(400, "Neplatný požadavek na dodatek Neon.");
  }
  const { ownerEmail, entryId, effectiveDate, signedDate, monthlyPremium } = body as Record<string, unknown>;
  if (typeof ownerEmail !== "string" || !ownerEmail.trim() || ownerEmail.length > 254 || ownerEmail.includes("/") ||
    !isSafeContractNoteId(entryId)) {
    throw new NeonEndorsementError(400, "Chybí platná identifikace smlouvy.");
  }
  const validDate = (day: unknown): day is string => typeof day === "string" && day >= "1900-01-01" &&
    day <= "2199-12-31" && endorsementCommissionDay(day) === day;
  if (!validDate(effectiveDate) || !validDate(signedDate) || signedDate > effectiveDate) {
    throw new NeonEndorsementError(400, "Zadej platné datum sjednání a počátku změny. Počátek nesmí předcházet sjednání.");
  }
  if (typeof monthlyPremium !== "number" || !Number.isFinite(monthlyPremium) || monthlyPremium <= 0 ||
    monthlyPremium > 1e9 || Math.round(monthlyPremium * 100) / 100 !== monthlyPremium) {
    throw new NeonEndorsementError(400, "Zadej platné měsíční pojistné v Kč, nejvýše na dvě desetinná místa.");
  }
  return { entryId, effectiveDate, signedDate, monthlyPremium };
}

type NeonEndorsementRequest = ReturnType<typeof parseNeonEndorsementRequest>;
type Entry = { id: string; data: ContractDoc };
const premium = ({ data }: Entry): number | null => {
  const amount = data.entryType === "endorsement"
    ? data.newInputAmount ?? data.effectiveInputAmount ?? data.inputAmount
    : data.effectiveInputAmount ?? data.inputAmount;
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
};

export function resolveNeonEndorsementSource(root: Entry, family: Entry[], ownerEmail: string): Entry {
  const children = new Map<string, Entry>();
  for (const entry of family) {
    const data = entry.data;
    if (entry.id === root.id || normalizeContractEntryType(data.entryType) !== "endorsement") continue;
    const parent = data.parentContractEntryId;
    if (!parent || children.has(parent) || data.productKey !== "neon" ||
      (data.userEmail && data.userEmail.trim().toLowerCase() !== ownerEmail) ||
      normalizeContractNumber(data.contractNumber) !== normalizeContractNumber(root.data.contractNumber)) {
      throw new NeonEndorsementError(409, "Historii dodatků Neon nelze bezpečně navázat.");
    }
    children.set(parent, entry);
  }

  let latest = root;
  for (let index = 0; index < children.size; index++) {
    const next = children.get(latest.id);
    const nextDay = endorsementCommissionDay(next?.data.policyStartDate);
    const latestDay = endorsementCommissionDay(latest.data.policyStartDate);
    if (!next || !nextDay || !latestDay || nextDay < latestDay) {
      throw new NeonEndorsementError(409, "Historii dodatků Neon nelze bezpečně navázat.");
    }
    latest = next;
  }
  return latest;
}

export function buildNeonEndorsementPayload(input: NeonEndorsementRequest, root: Entry, parent: Entry, parentPath: string) {
  const previous = premium(parent);
  const parentDay = endorsementCommissionDay(parent.data.policyStartDate);
  const rootSignedDay = endorsementCommissionDay(root.data.contractSignedDate);
  const policyEndDate = endorsementCommissionDay(root.data.policyEndDate);
  const stornoDay = endorsementCommissionDay(root.data.stornoDate);
  if (previous == null || !parentDay) throw new NeonEndorsementError(409, "Na smlouvě chybí ověřitelné pojistné nebo datum počátku.");
  if (input.effectiveDate < parentDay || (parent.id !== root.id && input.effectiveDate === parentDay) ||
    (rootSignedDay && input.signedDate < rootSignedDay)) {
    throw new NeonEndorsementError(400, "Změna musí navazovat na počátek smlouvy a poslední uložený dodatek.");
  }
  if ((policyEndDate && input.effectiveDate >= policyEndDate) || (stornoDay && input.effectiveDate >= stornoDay)) {
    throw new NeonEndorsementError(400, "Počátek změny musí být před koncem nebo stornem smlouvy.");
  }

  const delta = Math.round((input.monthlyPremium - previous) * 100) / 100;
  if (!delta) throw new NeonEndorsementError(400, "Zadej jiné pojistné než poslední uložené.");
  const calculationAmount = delta > 0 ? delta : calculateNeonDecreaseStornoBase({
    previousMonthlyPremium: previous, newMonthlyPremium: input.monthlyPremium,
    originalStornoStartDateIso: parentDay, endorsementPolicyStartDateIso: input.effectiveDate,
    confirmedRefreshAnnualBase: confirmedNeonRefreshAnnualBase(parent.data),
  })?.calculationMonthlyPremium;
  if (calculationAmount == null) throw new NeonEndorsementError(400, "Nepodařilo se spočítat storno základnu dodatku Neon.");

  return {
    entryType: "endorsement",
    productKey: "neon",
    clientName: root.data.clientName,
    contractNumber: root.data.contractNumber,
    rootContractEntryId: root.id,
    parentContractEntryId: parent.id,
    parentContractEntryPath: parentPath,
    policyStartDate: input.effectiveDate,
    contractSignedDate: input.signedDate,
    policyEndDate,
    durationYears: resolveRemainingEndorsementDurationYears({
      policyStartDate: toDate(root.data.policyStartDate), policyEndDate: toDate(root.data.policyEndDate),
      contractSignedDate: toDate(root.data.contractSignedDate), durationYears: root.data.durationYears ?? null,
    }, "neon", input.effectiveDate),
    frequencyRaw: "monthly",
    inputAmount: calculationAmount,
    calculationInputAmount: calculationAmount,
    previousInputAmount: previous,
    newInputAmount: input.monthlyPremium,
    effectiveInputAmount: input.monthlyPremium,
    premiumDelta: delta,
    premiumIncreaseAmount: Math.max(0, delta),
    premiumDecreaseAmount: Math.max(0, -delta),
    changeType: delta > 0 ? "increase" : "decrease",
  };
}

export function neonEndorsementReplayMatches(saved: ContractDoc, owner: string, input: NeonEndorsementRequest): boolean {
  return saved.productKey === "neon" && saved.entryType === "endorsement" && saved.userEmail === owner &&
    saved.rootContractEntryId === input.entryId && saved.newInputAmount === input.monthlyPremium &&
    endorsementCommissionDay(saved.policyStartDate) === input.effectiveDate &&
    endorsementCommissionDay(saved.contractSignedDate) === input.signedDate;
}

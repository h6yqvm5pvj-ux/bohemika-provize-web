import { productLabel } from "./productCatalog";
import type { Product } from "../types/domain";

export type ContractHistoryChange = { label: string; before: string | null; after: string | null };
export type ContractHistoryEvent = {
  id: string;
  kind: "created" | "updated" | "transfer" | "note" | "attachment" | "review" | "legacy";
  title: string;
  actorEmail: string | null;
  atMs: number | null;
  changes: ContractHistoryChange[];
};
export type ContractHistoryPage = {
  ok: true;
  events: ContractHistoryEvent[];
  nextCursor: string | null;
};

// Only contract data belongs here. Commission payouts and internal storage/auth
// metadata have different permissions and must never enter a shared audit trail.
const LABELS: Record<string, string> = {
  acquisitionType: "Způsob získání smlouvy", originalAdviserName: "Původní sjednatel", originalAdviserEmail: "E-mail původního sjednatele",
  servicingOwnerName: "Správce", transferEffectiveDate: "Správa od",
  clientName: "Klient", clientEmail: "E-mail klienta", clientPhone: "Telefon klienta",
  clientAddress: "Adresa klienta", contractNumber: "Číslo smlouvy", productKey: "Produkt",
  contractSignedDate: "Datum sjednání", policyStartDate: "Počátek smlouvy",
  policyEndDate: "Konec smlouvy", stornoDate: "Datum storna", status: "Stav smlouvy",
  paid: "Zaplaceno", inputAmount: "Částka / pojistné", effectiveInputAmount: "Aktuální částka / pojistné",
  frequencyRaw: "Frekvence platby", durationYears: "Doba trvání (roky)", durationMonths: "Doba trvání (měsíce)",
  pensionTargetAge: "Cílový věk spoření", note: "Poznámka", isRefresh: "Refresh",
  maxCizinKomplexVariant: "Varianta pojištění", maxxContractDetailUrl: "Odkaz na smlouvu",
  cppExtranetEntityTypeId: "Typ záznamu v extranetu", cppExtranetEntityId: "Záznam v extranetu",
  carMake: "Značka vozidla", carPlate: "SPZ", carVin: "VIN", carTp: "Technický průkaz", carOrv: "Osvědčení o registraci",
  carAnnualMileage: "Roční nájezd", carAllianzScope: "Rozsah pojištění vozidla", carLiabilityLimit: "Limit odpovědnosti",
  carSlaviaDetail: "Parametry Slavia", carHullSumInsured: "Pojistná částka vozidla", carHullSumInsuredText: "Pojistná částka vozidla",
  carHullDeductible: "Spoluúčast", carHullDeductibleText: "Spoluúčast",
  carHullRiskAccident: "Havárie", carHullRiskTheft: "Odcizení", carHullRiskNatural: "Živelní rizika",
  carHullRiskVandalism: "Vandalismus", carHullRiskAnimalCollision: "Střet se zvířetem", carAssistancePlan: "Asistence",
  carAddonEso: "ESO", carAddonNaturalRisks: "Živelní připojištění", carAddonKlika: "Klika",
  carAddonGlass: "Pojištění skel", carAddonGlassLimit: "Limit skel", carAddonAnimalCollision: "Střet se zvířetem",
  carAddonAnimalCollisionLimit: "Limit střetu se zvířetem", carAddonAnimalDamage: "Poškození zvířetem",
  carAddonAnimalDamageLimit: "Limit poškození zvířetem", carAddonVandalism: "Připojištění vandalismu",
  carAddonTheft: "Připojištění odcizení", carAddonTheftLimit: "Limit odcizení", carAddonNatural: "Živel",
  carAddonNaturalLimit: "Limit živlu", carAddonOwnDamage: "Vlastní škoda", carAddonOwnDamageLimit: "Limit vlastní škody",
  carAddonPothole: "Výmol", carAddonNonFaultAccident: "Nezaviněná nehoda", carAddonGap: "GAP", carAddonGapLimit: "Limit GAP",
  carAddonSmartGap: "Smart GAP", carAddonServisPro: "Servis Pro", carAddonReplacementCar: "Náhradní vozidlo",
  carAddonLuggage: "Zavazadla", carAddonTransportedGoods: "Přepravované věci", carAddonFireExplosion: "Požár a výbuch",
  carAddonLegalAdvice: "Právní poradenství", carAddonPassengerInjury: "Úraz posádky", carAddonKeyLossTheft: "Ztráta nebo odcizení klíčů",
  neonDetail: "Parametry NEON", flexiDetail: "Parametry FLEXI", domexDetail: "Parametry DOMEX", maxdomovDetail: "Parametry MAXDOMOV",
};

export function historyTime(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function normalized(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (value instanceof Date || (typeof value === "object" && "seconds" in value)) {
    const ms = historyTime(value);
    return ms === null ? null : new Date(ms).toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalized(item)]));
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return value;
}

export function historyValue(value: unknown): string | null {
  const v = normalized(value);
  if (v === null) return null;
  if (typeof v === "boolean") return v ? "Ano" : "Ne";
  if (typeof v === "number") return v.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  const translations: Record<string, string> = { inherited: "Převzatá", own: "Vlastní", active: "Aktivní", storno: "Stornovaná", dozita: "Dožitá", monthly: "Měsíčně", quarterly: "Čtvrtletně", semiannual: "Pololetně", annual: "Ročně" };
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str).toLocaleDateString("cs-CZ", { timeZone: "UTC" });
  return translations[str] ?? str;
}

export function contractHistoryChanges(before: Record<string, unknown>, patch: Record<string, unknown>): ContractHistoryChange[] {
  return Object.entries(LABELS).flatMap(([key, label]) => {
    if (!Object.hasOwn(patch, key) || JSON.stringify(normalized(before[key])) === JSON.stringify(normalized(patch[key]))) return [];
    const value = (v: unknown) => key === "productKey" && typeof v === "string" ? productLabel(v as Product, v) : historyValue(v);
    return [{ label, before: value(before[key]), after: value(patch[key]) }];
  });
}

// This is explicitly a snapshot of older records, not a reconstruction of edits
// that the application never recorded.
export function legacyContractHistory(contract: Record<string, unknown>): ContractHistoryEvent[] {
  const events: ContractHistoryEvent[] = [];
  const createdAt = historyTime(contract.createdAt);
  if (createdAt !== null) events.push({ id: "legacy-created", kind: "legacy", title: "Smlouva vložena do aplikace", actorEmail: typeof contract.createdByEmail === "string" ? contract.createdByEmail : null, atMs: createdAt, changes: [] });
  const transfers = Array.isArray(contract.ownershipTransferHistory) ? contract.ownershipTransferHistory : [];
  const changes: ContractHistoryChange[] = transfers.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const t = value as Record<string, unknown>;
    const at = historyTime(t.transferredAt);
    return [{ label: `Převod${at !== null ? ` · ${new Date(at).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}` : ""}${t.transferredByEmail ? ` · ${t.transferredByEmail}` : ""}`, before: historyValue(t.fromEmail), after: historyValue(t.toEmail) }];
  });
  if (contract.acquisitionType === "inherited" && !transfers.length) {
    changes.push({ label: "Převzatá smlouva · sjednatel → správce", before: historyValue(contract.originalAdviserName ?? contract.originalAdviserEmail), after: historyValue(contract.servicingOwnerName ?? contract.servicingOwnerEmail ?? contract.userEmail) });
    if (contract.transferEffectiveDate) changes.push({ label: "Správa od", before: null, after: historyValue(contract.transferEffectiveDate) });
  }
  if (typeof contract.note === "string" && contract.note.trim()) changes.push({ label: "Dříve uložená poznámka", before: null, after: contract.note });
  if (changes.length) events.push({ id: "legacy-records", kind: "legacy", title: "Dříve uložené záznamy", actorEmail: null, atMs: null, changes });
  return events;
}

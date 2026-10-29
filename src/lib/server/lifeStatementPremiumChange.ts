import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { canManageContractOwner } from "@/app/api/contracts/_lib/contractsApi.access";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import type { StoredAutoPremiumStatementRow } from "@/app/api/commission-statements/premiumHistoryStatements";
import { isLifeIncreaseCode, type LifeStatementPremiumChange } from "@/app/lib/lifePremiumIncrease";
import { commissionStatementIdentityKey } from "@/app/api/commission-statements/statementIdentity";
import { toDate } from "@/app/lib/formatters";
import { withContractHistory } from "./contractHistory";
import { trackCashflowWrite } from "./cashflowMutationTracking";
import { PremiumBaseResolutionError } from "./premiumBaseResolution";

const validDate = (value: unknown): value is string => typeof value === "string" && value >= "1900-01-01" && value <= "2200-12-31" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validMoney = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10_000_000 &&
  Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;

/** Stores only a user-confirmed premium history entry. Never creates an endorsement or changes the commission calculation. */
export async function saveLifeStatementPremiumChange(db: Firestore, options: {
  body: Record<string, unknown>; viewerEmail: string; actorEmail: string; teamEmails: string[];
  canManageContractsAsAdmin: boolean; parseRows: (html: string) => StoredAutoPremiumStatementRow[];
}) {
  const { body, viewerEmail, actorEmail } = options;
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const safeId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,180}$/.test(value);
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail) || !safeId(body.entryId) || !safeId(body.statementId) ||
    typeof body.contractNumber !== "string" || body.contractNumber.length > 80 || body.confirmed !== true ||
    !validDate(body.effectiveDate) || !validMoney(body.previousMonthlyPremium) || !validMoney(body.newMonthlyPremium) ||
    body.newMonthlyPremium <= body.previousMonthlyPremium) {
    throw new PremiumBaseResolutionError("Potvrď platné měsíční pojistné a datum účinnosti změny.");
  }
  if (!canManageContractOwner({ viewerEmail, ownerEmail, teamEmails: options.teamEmails,
    canManageContractsAsAdmin: options.canManageContractsAsAdmin })) {
    throw new PremiumBaseResolutionError("Nemáš oprávnění upravovat tuto smlouvu.", 403);
  }
  const entryRef = db.collection("users").doc(ownerEmail).collection("entries").doc(body.entryId);
  const statementRef = db.collection("usersPrivate").doc(viewerEmail).collection("commissionStatements").doc(body.statementId);
  const previousMonthlyPremium = body.previousMonthlyPremium;
  const newMonthlyPremium = body.newMonthlyPremium;
  const effectiveDate = body.effectiveDate;
  return trackCashflowWrite(() => db.runTransaction(async tx => {
    const [entry, statement] = await tx.getAll(entryRef, statementRef);
    if (!entry.exists || !statement.exists) throw new PremiumBaseResolutionError("Smlouva nebo uložený výpis nebyl nalezen.", 404);
    const contract = entry.data() as ContractDoc;
    if (contract.contractNumber !== body.contractNumber) throw new PremiumBaseResolutionError("Smlouva neodpovídá výpisu.", 409);
    const contractStart = toDate(contract.policyStartDate)?.toISOString().slice(0, 10);
    if (contractStart && effectiveDate < contractStart) throw new PremiumBaseResolutionError("Účinnost změny nemůže předcházet počátku smlouvy.", 409);
    const data = statement.data()!;
    const rows = options.parseRows(typeof data.html === "string" ? data.html : "").filter(row =>
      row.premiumKind === "life_increase" && row.source === "own" && row.contractNumber === body.contractNumber &&
      row.productKey === contract.productKey && isLifeIncreaseCode(row.commissionCode));
    const bases = new Set(rows.map(row => row.basePremium));
    const products = new Set(rows.map(row => row.productCode));
    const annualIncrease = Math.round((newMonthlyPremium - previousMonthlyPremium) * 1200) / 100;
    if (!rows.length || bases.size !== 1 || products.size !== 1 || Math.abs(rows[0].basePremium - annualIncrease) > 0.01) {
      throw new PremiumBaseResolutionError("Rozdíl pojistného neodpovídá jednoznačné základně navýšení v uloženém výpisu.", 409);
    }
    const changes = contract.confirmedLifePremiumChanges ?? [];
    const identity = commissionStatementIdentityKey({ statementId: statement.id, statementNumber: data.statementNumber,
      statementPeriod: data.period, statementDate: data.statementDate });
    const key = createHash("sha256").update(JSON.stringify([viewerEmail, identity, rows[0].productCode, annualIncrease])).digest("hex").slice(0, 32);
    const change: LifeStatementPremiumChange = { key, statementId: statement.id,
      statementNumber: typeof data.statementNumber === "string" ? data.statementNumber : null,
      statementPeriod: typeof data.period === "string" ? data.period : null,
      statementDate: typeof data.statementDate === "string" ? data.statementDate : null,
      productCode: rows[0].productCode, annualIncrease, previousMonthlyPremium, newMonthlyPremium, effectiveDate,
      writtenBy: viewerEmail, confirmedAtMs: Date.now() };
    const existing = changes.find(item => item.key === key);
    if (existing) {
      if (existing.previousMonthlyPremium !== previousMonthlyPremium || existing.newMonthlyPremium !== newMonthlyPremium || existing.effectiveDate !== effectiveDate) {
        throw new PremiumBaseResolutionError("Tato změna už je potvrzená s jinými údaji. Obnov detail smlouvy.", 409);
      }
      return { ok: true, change: existing };
    }
    if (changes.some(item => item.effectiveDate === effectiveDate &&
      (item.previousMonthlyPremium !== previousMonthlyPremium || item.newMonthlyPremium !== newMonthlyPremium))) {
      throw new PremiumBaseResolutionError("Ke stejnému datu už je potvrzená jiná změna pojistného.", 409);
    }
    if (changes.length >= 120) throw new PremiumBaseResolutionError("Smlouva dosáhla limitu potvrzených změn.", 409);
    tx.update(entryRef, withContractHistory(tx, entryRef, contract, { confirmedLifePremiumChanges: [...changes, change], updatedAt: new Date(change.confirmedAtMs) }, {
      actorEmail, kind: "updated", title: "Potvrzena změna pojistného podle provizního výpisu",
      changes: [],
    }));
    return { ok: true, change };
  }), db);
}

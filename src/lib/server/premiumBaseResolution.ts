import type { Firestore } from "firebase-admin/firestore";
import { canManageContractOwner } from "@/app/api/contracts/_lib/contractsApi.access";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { confirmedPremiumHistoryPatch } from "@/app/api/commission-statements/premiumHistory";
import type { StoredAutoPremiumStatementRow } from "@/app/api/commission-statements/premiumHistoryStatements";
import { premiumBaseSourceKey, resolveAutoPremiumBasis, type PremiumBaseResolution } from "@/app/lib/autoPremiumBasis";
import { withContractHistory } from "./contractHistory";
import { trackCashflowWrite } from "./cashflowMutationTracking";

export class PremiumBaseResolutionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function savePremiumBaseResolution(db: Firestore, options: {
  body: Record<string, unknown>;
  viewerEmail: string;
  actorEmail: string;
  teamEmails: string[];
  canManageContractsAsAdmin: boolean;
  parseRows: (html: string) => StoredAutoPremiumStatementRow[];
}) {
  const { body, viewerEmail, actorEmail } = options;
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const safeId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,180}$/.test(value);
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail) || !safeId(body.entryId) || !safeId(body.statementId) ||
    typeof body.rowId !== "string" || typeof body.contractNumber !== "string" ||
    (body.period !== "annual" && body.period !== "payment") ||
    (body.source !== "own" && body.source !== "manager") ||
    typeof body.basePremium !== "number" || !Number.isFinite(body.basePremium) || body.basePremium <= 0) {
    throw new PremiumBaseResolutionError("Chybí platný řádek výpisu nebo období základny.");
  }
  if (!canManageContractOwner({ viewerEmail, ownerEmail, teamEmails: options.teamEmails,
    canManageContractsAsAdmin: options.canManageContractsAsAdmin })) {
    throw new PremiumBaseResolutionError("Nemáš oprávnění upravovat tuto smlouvu.", 403);
  }
  const entryRef = db.collection("users").doc(ownerEmail).collection("entries").doc(body.entryId);
  // The statement always belongs to the authenticated viewer, never an email supplied in the request.
  const statementRef = db.collection("usersPrivate").doc(viewerEmail).collection("commissionStatements").doc(body.statementId);
  return trackCashflowWrite(() => db.runTransaction(async transaction => {
    const [entry, statement] = await transaction.getAll(entryRef, statementRef);
    if (!entry.exists || !statement.exists) throw new PremiumBaseResolutionError("Smlouva nebo výpis nebyl nalezen.", 404);
    const contract = entry.data() as ContractDoc;
    const data = statement.data()!;
    if (contract.contractNumber !== body.contractNumber || contract.frequencyRaw !== body.frequencyRaw) {
      throw new PremiumBaseResolutionError("Smlouva se mezitím změnila. Obnov detail a potvrď základnu znovu.", 409);
    }
    const rows = options.parseRows(typeof data.html === "string" ? data.html : "").filter(row =>
      row.contractNumber === body.contractNumber && row.rowId === body.rowId &&
      row.commissionCode === body.commissionCode && row.source === body.source && row.productKey === contract.productKey);
    if (rows.length !== 1 || rows[0].basePremium !== body.basePremium) {
      throw new PremiumBaseResolutionError("Řádek výpisu se změnil nebo jej nelze jednoznačně určit.", 409);
    }
    const row = rows[0];
    const source = { contractNumber: row.contractNumber, rowId: row.rowId, productCode: row.productCode,
      commissionCode: row.commissionCode, source: row.source, basePremium: row.basePremium, validFrom: row.validFrom, signedAt: row.signedAt,
      statementId: statement.id, statementNumber: data.statementNumber ?? null,
      statementPeriod: data.period ?? null, statementDate: data.statementDate ?? null, statementOwnerEmail: viewerEmail };
    if (resolveAutoPremiumBasis(source, contract).status === "invalid") {
      throw new PremiumBaseResolutionError("Nejdřív vyplň platnou frekvenci placení smlouvy.");
    }
    const nowMs = Date.now();
    const confirmation: PremiumBaseResolution = {
      ...source, key: premiumBaseSourceKey(source, contract), productKey: contract.productKey!,
      frequencyRaw: contract.frequencyRaw!, period: body.period as "annual" | "payment",
      statementChronologyMs: typeof data.statementChronologyMs === "number" ? data.statementChronologyMs : data.statementDateMs ?? data.periodEndMs ?? null,
      payoutMonthKey: data.payoutMonthKey ?? null, confirmedAtMs: nowMs, confirmedBy: actorEmail, writtenBy: viewerEmail,
    };
    // Revalidate the previous confirmed bases against their source documents
    // before using them as the baseline for this change.
    const prior = contract.premiumStatementBaseResolutions ?? [];
    const ids = [...new Set(prior.filter(item => item.writtenBy === viewerEmail && safeId(item.statementId) && item.statementId !== statement.id).map(item => item.statementId!))];
    const priorDocs = ids.length ? await transaction.getAll(...ids.map(id => statementRef.parent.doc(id))) : [];
    const currentSources = new Map([statement, ...priorDocs].filter(doc => doc.exists).map(doc => {
      const value = doc.data()!;
      return [doc.id, options.parseRows(typeof value.html === "string" ? value.html : "").map(sourceRow => ({ ...sourceRow,
        statementId: doc.id, statementNumber: value.statementNumber ?? null, statementPeriod: value.period ?? null,
        statementDate: value.statementDate ?? null, statementOwnerEmail: viewerEmail }))];
    }));
    const validPrior = prior.filter(item => item.writtenBy !== viewerEmail ||
      (currentSources.get(item.statementId ?? "") ?? []).filter(current => premiumBaseSourceKey(current, contract) === item.key).length === 1);
    const patch = confirmedPremiumHistoryPatch({ ...contract, premiumStatementBaseResolutions: validPrior }, confirmation, nowMs);
    if (patch.premiumStatementBaseResolutions.length > 400) throw new PremiumBaseResolutionError("Tato smlouva dosáhla limitu potvrzených základen.");
    transaction.update(entryRef, withContractHistory(transaction, entryRef, contract, { ...patch, updatedAt: new Date(nowMs) }, {
      actorEmail, kind: "updated", title: "Potvrzení období základny z provizního výpisu",
    }));
    return { ok: true, period: confirmation.period };
  }), db);
}

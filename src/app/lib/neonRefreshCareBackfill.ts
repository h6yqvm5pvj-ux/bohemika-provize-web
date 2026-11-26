import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { isNeonStatementProductCode } from "./commissionPayoutRules";
import type { CommissionResultItemDTO } from "@/app/types/domain";

const money = (value: number) => Math.round(value * 100) / 100;
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const annualFromMonthly = (amount: unknown) => positive(amount) ? money(amount * 12) : null;
const closeAnnual = (left: number, right: number) => Math.abs(left - right) <= 12;

type CareEvidence = { code?: unknown; productCode?: unknown; annual?: unknown; amount?: unknown };
type StoredPayout = NonNullable<ContractDoc["commissionPayouts"]>[number];

function savedCareEvidence(payout: StoredPayout): CareEvidence {
  return {
    code: payout.code,
    productCode: payout.title?.split(" · ")[0],
    annual: payout.sourceBaseAmount ?? payout.statementBaseAmount,
    amount: payout.status === "storno" ? null : payout.amount,
  };
}

const isCareCode = (code: unknown) => /^B20[1-6]$/.test(String(code ?? "").trim().toUpperCase());

export function neonRefreshCareBackfillBase(
  contract: ContractDoc,
  verifiedMonthlyPremium?: number | null,
  incoming: CareEvidence[] = []
) {
  const riskAnnual = annualFromMonthly(contract.calculationInputAmount) ??
    annualFromMonthly(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
    contract.refreshCommissionBase?.calculationAnnualPremium;
  const statementBases = [...(contract.commissionPayouts ?? []).map(savedCareEvidence), ...incoming].flatMap(row =>
    isCareCode(row.code) &&
    isNeonStatementProductCode(row.productCode) && positive(row.amount) && positive(row.annual) ? [row.annual] : []);
  const verified = annualFromMonthly(verifiedMonthlyPremium);
  if (verified != null && (statementBases.length === 0 || statementBases.some(base => closeAnnual(base, verified)))) {
    return verified;
  }

  const refresh = contract.refreshCommissionBase;
  const recordedAnnual = positive(refresh?.newAnnualPremium) ? money(refresh.newAnnualPremium) : null;
  const recordedMonthly = annualFromMonthly(refresh?.newMonthlyPremium);
  if (recordedAnnual != null && recordedMonthly != null && !closeAnnual(recordedAnnual, recordedMonthly)) return null;

  const annual = recordedAnnual ?? recordedMonthly ?? annualFromMonthly(contract.inputAmount);
  if (annual == null || statementBases.some(base => !closeAnnual(base, annual))) return null;
  if (statementBases.length > 0 ||
      (recordedAnnual != null || recordedMonthly != null) && refresh?.method === "cpp_neon_5y_storno" ||
      positive(riskAnnual) && !closeAnnual(annual, riskAnnual)) return annual;
  return null;
}

const isCareItem = (item: CommissionResultItemDTO) =>
  item.code === "B201-B206" || (!item.code && /pečovatelská.*5.*10/i.test(item.title));

function updateCareItems(items: CommissionResultItemDTO[], ratio: number, round: boolean) {
  const care = items.filter(isCareItem);
  if (care.length !== 1 || !positive(care[0].amount)) return null;
  const previous = care[0].amount;
  const scaled = previous * ratio;
  const amount = round ? money(scaled) : scaled;
  const delta = care[0].excludeFromTotal ? 0 : (amount - previous) * 6;
  return {
    delta,
    items: items.map(item => item === care[0] ? { ...item, amount } :
      item.code === "TOTAL" || (!item.code && item.title.includes("Celkem"))
        ? { ...item, amount: item.amount + delta } : item),
  };
}

function updateMatchingCarePayout(
  payout: StoredPayout, annual: number, items: CommissionResultItemDTO[],
  owner: string | null | undefined, overrides: NonNullable<ContractDoc["managerOverrides"]>
): StoredPayout {
  const evidence = savedCareEvidence(payout);
  if (payout.status !== "paid" || payout.differenceReason || !payout.statementId ||
      !isCareCode(evidence.code) || !isNeonStatementProductCode(evidence.productCode) ||
      !positive(evidence.annual) || !closeAnnual(annual, evidence.annual) ||
      !positive(payout.amount) || payout.detail?.includes("Součást opravného výpisu")) return payout;
  const writer = payout.writtenBy?.trim().toLowerCase();
  if (!writer || !owner) return payout;
  const manager = overrides.filter(override => override.email?.trim().toLowerCase() === writer);
  const plan = writer === owner.trim().toLowerCase() ? items : manager.length === 1 ? manager[0].items : null;
  const amount = plan?.find(isCareItem)?.amount;
  if (!positive(amount) || money(amount) !== money(payout.amount)) return payout;
  if (payout.systemBaseAmount === annual && payout.expectedAmount === money(amount) && payout.difference === 0) return payout;

  const restOfDetail = payout.detail
    ?.replace(/^B20[1-6]: vyplaceno [^.]*\.\s*/, "")
    .replace("Vyšší vyplacená provize; kladný rozdíl není nesrovnalost vyplacené částky.", "")
    .trim();
  return {
    ...payout,
    systemBaseAmount: annual,
    expectedAmount: money(amount),
    difference: 0,
    detail: ["Vyplacená pečovatelská provize a základna odpovídají přepočtu z plného pojistného.", restOfDetail]
      .filter(Boolean).join(" "),
  };
}

export function planNeonRefreshCareBackfill(contract: ContractDoc, verifiedMonthlyPremium?: number | null) {
  if (contract.productKey !== "neon" || contract.isRefresh !== true ||
      (contract.entryType != null && contract.entryType !== "contract")) return { status: "out_of_scope" } as const;
  if (positive(contract.neonRefreshCareAnnualPremium)) return { status: "current" } as const;
  const annual = neonRefreshCareBackfillBase(contract, verifiedMonthlyPremium);
  if (annual == null) return { status: "review_full_premium" } as const;
  // These older plans computed care with the same monthly input as risk.
  const previousAnnual = annualFromMonthly(contract.calculationInputAmount) ??
    annualFromMonthly(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
    contract.refreshCommissionBase?.calculationAnnualPremium;
  if (!positive(previousAnnual)) return { status: "review_calculation" } as const;
  const ratio = annual / previousAnnual;
  const items = contract.items ?? contract.result?.items;
  const total = contract.total ?? contract.result?.total;
  const updated = Array.isArray(items) ? updateCareItems(items, ratio, false) : null;
  if (!updated || typeof total !== "number" || !Number.isFinite(total)) return { status: "review_calculation" } as const;
  const existingResultItems = contract.result?.items ?? items!;
  const updatedResult = updateCareItems(existingResultItems, ratio, false);
  if (!updatedResult) return { status: "review_calculation" } as const;
  const managerOverrides = (contract.managerOverrides ?? []).map(override => {
    const updatedOverride = override.items && updateCareItems(override.items, ratio, true);
    return updatedOverride && typeof override.total === "number" ?
      { ...override, items: updatedOverride.items, total: money(override.total + updatedOverride.delta) } : override;
  });
  if ((contract.managerOverrides ?? []).some((override, index) =>
    override.items?.some(isCareItem) && managerOverrides[index] === override)) return { status: "review_calculation" } as const;

  let payoutCount = 0;
  const statementsForReplay = new Set<string>();
  const commissionPayouts = (contract.commissionPayouts ?? []).map(payout => {
    const next = updateMatchingCarePayout(payout, annual, updated.items, contract.userEmail, managerOverrides);
    if (next !== payout) payoutCount += 1;
    if (isCareCode(next.code) && next.status !== "storno" && next.statementId &&
        (next.systemBaseAmount !== annual || next.differenceReason)) statementsForReplay.add(next.statementId);
    return next;
  });
  return {
    status: "ready",
    statementCount: statementsForReplay.size,
    payoutCount,
    patch: {
      neonRefreshCareAnnualPremium: annual,
      items: updated.items,
      total: total + updated.delta,
      result: {
        ...contract.result,
        items: updatedResult.items,
        total: (contract.result?.total ?? total) + updatedResult.delta,
      },
      ...(contract.managerOverrides ? { managerOverrides } : {}),
      ...(payoutCount > 0 ? { commissionPayouts } : {}),
    },
  } as const;
}

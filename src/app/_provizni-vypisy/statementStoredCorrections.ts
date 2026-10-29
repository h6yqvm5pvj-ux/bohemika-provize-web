import { commissionStatementIdentityKey } from "@/app/api/commission-statements/statementIdentity";
import { partitionSettledCommissionPayouts } from "@/app/smlouvy/[id]/contractCommissionHistoryRules";
import { statementDiscrepancyKey } from "./statementDiscrepancies";
import {
  baseCommissionCodeForStatementComparison, commissionRowCorrectionKey, formatMoney,
  normalizeProductCode, normalizedRowText, parseLocalDate, parsePeriodEndDate, resolveStatementProduct,
} from "./statementParsing";
import { contractMatchForNumber, matchedSystemContract, statementProductMatchesSystemProduct } from "./statementSystemContracts";
import type { ContractCommissionPayoutRecord, ContractMatchesByNumber, ParsedStatement, StatementCorrectionContext } from "./statementTypes";

const normalizeWriter = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const sameMoney = (left: number | null | undefined, right: number) =>
  typeof left === "number" && Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.01;
const canonicalCode = (value: string | null | undefined) => {
  const code = baseCommissionCodeForStatementComparison(value);
  if (code === "B301") return "B0301";
  if (["B36", "B036", "B3601"].includes(code)) return "B3601";
  if (["B48", "B048", "B4801"].includes(code)) return "B4801";
  return code;
};
const productCode = (payout: ContractCommissionPayoutRecord) => normalizeProductCode(payout.title?.split("·")[0]);
const sourceIdentity = (payout: ContractCommissionPayoutRecord) => commissionStatementIdentityKey(payout);
const chronology = (payout: ContractCommissionPayoutRecord): number | null =>
  parsePeriodEndDate(payout.statementPeriod)?.getTime() ?? parseLocalDate(payout.statementDate)?.getTime() ??
  (typeof payout.statementChronologyMs === "number" && Number.isFinite(payout.statementChronologyMs) ? payout.statementChronologyMs : null);
const sameSource = (left: ContractCommissionPayoutRecord, right: ContractCommissionPayoutRecord) =>
  left.statementId && right.statementId ? left.statementId === right.statementId :
    Boolean(sourceIdentity(left) && sourceIdentity(left) === sourceIdentity(right));

/** Extends the preview only with evidence already returned by authorized contract matching.
 * A missing reversal, replacement, source identity or an ambiguous match never clears a row.
 */
export function extendStatementCorrectionsWithStoredHistory({
  context, statements, matchesByContractNumber, writerEmail, statementIdsByKey = {},
}: {
  context: StatementCorrectionContext;
  statements: ParsedStatement[];
  matchesByContractNumber: ContractMatchesByNumber;
  writerEmail: string | null | undefined;
  statementIdsByKey?: Readonly<Record<string, string>>;
}): StatementCorrectionContext {
  const result: StatementCorrectionContext = {
    correctedRowKeys: new Set(context.correctedRowKeys),
    correctedRowLabels: new Map(context.correctedRowLabels),
    correctedRowDetails: new Map(context.correctedRowDetails),
  };
  const writer = normalizeWriter(writerEmail);
  if (!writer) return result;

  for (const statement of statements) {
    const statementKey = statementDiscrepancyKey(statement);
    const statementId = statementIdsByKey[statementKey];
    const identity = commissionStatementIdentityKey({ statementNumber: statement.header.statementNumber,
      statementPeriod: statement.header.period, statementDate: statement.header.statementDate });
    if (!statementId && !identity) continue;
    const usedOriginalKeys = new Set<string>();

    for (const row of statement.commissionRows) {
      const rowKey = commissionRowCorrectionKey(statementKey, row);
      if (result.correctedRowKeys.has(rowKey) || !Number.isFinite(row.commission) || row.commission <= 0) continue;
      const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber,
        normalizedRowText(row.type) === "ATP101" ? "tip" : "my");
      const anchor = matchedSystemContract(match);
      const rowProduct = resolveStatementProduct(row.product).productKey;
      if (!anchor || match?.status !== "matched" || !rowProduct ||
        !statementProductMatchesSystemProduct(rowProduct, anchor.productKey)) continue;

      // Shared family snapshots can repeat a payout. Conflicting copies of one key
      // are excluded rather than selecting evidence from an arbitrary snapshot.
      const byKey = new Map<string, ContractCommissionPayoutRecord>();
      const conflictingKeys = new Set<string>();
      for (const contract of match.contracts) {
        if (normalizeWriter(contract.adviserEmail) !== normalizeWriter(anchor.adviserEmail) ||
          !statementProductMatchesSystemProduct(rowProduct, contract.productKey)) continue;
        for (const payout of contract.commissionPayouts ?? []) {
          if (!payout.key || normalizeWriter(payout.writtenBy) !== writer || productCode(payout) !== normalizeProductCode(row.product)) continue;
          const previous = byKey.get(payout.key);
          if (previous && JSON.stringify(previous) !== JSON.stringify(payout)) conflictingKeys.add(payout.key);
          else byKey.set(payout.key, payout);
        }
      }
      const payouts = [...byKey.values()].filter(payout => !conflictingKeys.has(payout.key!));
      const originals = payouts.filter(payout =>
        (statementId ? payout.statementId === statementId : sourceIdentity(payout) === identity) &&
        (!identity || sourceIdentity(payout) === identity) &&
        canonicalCode(payout.code) === canonicalCode(row.type) && sameMoney(payout.amount, row.commission) &&
        normalizedRowText(payout.career) === normalizedRowText(row.career) &&
        (payout.statementBaseAmount == null || sameMoney(payout.statementBaseAmount, row.base)) &&
        payout.status !== "storno"
      );
      if (originals.length !== 1 || usedOriginalKeys.has(originals[0].key!)) continue;

      // Identical rows in the opened statement cannot safely share one stored payment.
      const equivalentRows = statement.commissionRows.filter(candidate =>
        normalizedRowText(candidate.contractNumber) === normalizedRowText(row.contractNumber) &&
        normalizeProductCode(candidate.product) === normalizeProductCode(row.product) &&
        canonicalCode(candidate.type) === canonicalCode(row.type) && sameMoney(candidate.commission, row.commission) &&
        normalizedRowText(candidate.career) === normalizedRowText(row.career) && sameMoney(candidate.base, row.base)
      );
      if (equivalentRows.length !== 1) continue;

      const { activePayouts, settledCorrections } = partitionSettledCommissionPayouts(payouts);
      let payment = originals[0];
      let replacement: ContractCommissionPayoutRecord | undefined;
      const visited = new Set<string>();
      while (payment.key && !visited.has(payment.key)) {
        visited.add(payment.key);
        const pair = settledCorrections.find(item => item.payment.key === payment.key);
        if (!pair || normalizedRowText(pair.reversal.career) !== normalizedRowText(payment.career)) break;
        if (payment.statementBaseAmount != null && pair.reversal.statementBaseAmount != null &&
          !sameMoney(pair.reversal.statementBaseAmount, payment.statementBaseAmount)) break;
        const before = chronology(payment), after = chronology(pair.reversal);
        if (before == null || after == null || after <= before) break;
        const possiblePayments = payouts.filter(candidate => {
          const date = chronology(candidate);
          return candidate.status !== "storno" && !candidate.differenceReason?.includes("storno") &&
            typeof candidate.amount === "number" && candidate.amount > 0 &&
            sameMoney(candidate.amount, payment.amount!) && canonicalCode(candidate.code) === canonicalCode(payment.code) &&
            normalizedRowText(candidate.career) === normalizedRowText(payment.career) &&
            (candidate.statementBaseAmount == null || pair.reversal.statementBaseAmount == null ||
              sameMoney(candidate.statementBaseAmount, pair.reversal.statementBaseAmount)) &&
            date != null && date < after && !settledCorrections.some(settled =>
              settled.payment.key === candidate.key && (chronology(settled.reversal) ?? Infinity) < after);
        });
        if (possiblePayments.length !== 1 || possiblePayments[0].key !== payment.key ||
          !sameMoney(pair.reversal.amount, -payment.amount!)) break;
        const candidates = payouts.filter(candidate => candidate.key !== payment.key &&
          sameSource(candidate, pair.reversal) && canonicalCode(candidate.code) === canonicalCode(payment.code) &&
          typeof candidate.amount === "number" && Number.isFinite(candidate.amount) && candidate.amount > 0 &&
          candidate.status !== "storno" &&
          (!sameMoney(candidate.amount, payment.amount!) || normalizedRowText(candidate.career) !== normalizedRowText(payment.career))
        );
        if (candidates.length !== 1) break;
        const next = candidates[0];
        if (activePayouts.some(item => item.key === next.key) && next.status === "paid" && !next.differenceReason) {
          replacement = next;
          break;
        }
        payment = next;
      }
      if (!replacement) continue;
      usedOriginalKeys.add(originals[0].key!);
      result.correctedRowKeys.add(rowKey);
      result.correctedRowLabels.set(rowKey, "Opraveno navazujícím výpisem");
      const target = replacement.statementNumber ? `č. ${replacement.statementNumber}` : replacement.statementPeriod || replacement.statementDate || "z uložené historie";
      const career = normalizedRowText(row.career) !== normalizedRowText(replacement.career)
        ? ` Původní Kar. ${row.career || "—"}, nová Kar. ${replacement.career || "—"}.` : "";
      result.correctedRowDetails.set(rowKey,
        `Historie smlouvy dokládá odúčtování původní provize ${formatMoney(row.commission)} Kč a opravnou výplatu ${formatMoney(replacement.amount!)} Kč ve výpisu ${target}.${career}`);
    }
  }
  return result;
}

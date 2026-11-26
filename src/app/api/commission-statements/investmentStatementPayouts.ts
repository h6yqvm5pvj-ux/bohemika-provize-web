import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { compactHash, type CommissionStatementPayoutRow } from "./statementPayoutRows";
import type { SavedStatementReprocessItem } from "./savedStatementArchive";
import { commissionStatementIdentityKey } from "./statementIdentity";
import { ownsStatementRecord, statementRecordArray } from "./statementRebuildScope";

type ContractCommissionPayoutRecord = NonNullable<ContractDoc["commissionPayouts"]>[number];

export type InvestmentStatementPayouts = Pick<SavedStatementReprocessItem,
  "id" | "advisorNumber" | "statementNumber" | "statementPeriod" | "statementDate" | "statementChronologyMs" | "payoutMonthKey"> & {
  rows: CommissionStatementPayoutRow[];
};

const investmentPayoutStatementPrefix = (statement: InvestmentStatementPayouts): string =>
  `investment:${compactHash(commissionStatementIdentityKey({
    statementId: statement.id,
    statementNumber: statement.statementNumber,
    statementPeriod: statement.statementPeriod,
    statementDate: statement.statementDate,
    advisorNumber: statement.advisorNumber,
  }), 32)}:`;

export function mergeInvestmentStatementPayouts({ existing, statements, viewer, nowMs }: {
  existing: unknown;
  statements: InvestmentStatementPayouts[];
  viewer: string;
  nowMs: number;
}) {
  const sources = new Map(statements.map(statement => [investmentPayoutStatementPrefix(statement), statement]));
  const previousByKey = new Map<string, ContractCommissionPayoutRecord>();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const preserved = statementRecordArray(existing).filter(record => {
    if (!ownsStatementRecord(record, viewer)) return true;
    const payout = record as ContractCommissionPayoutRecord;
    if (typeof payout.key !== "string" || !payout.key.startsWith("investment:")) return true;
    const sourcePrefix = payout.key.slice(0, payout.key.lastIndexOf(":") + 1);
    if (!sources.has(sourcePrefix)) return true;
    previousByKey.set(payout.key, payout);
    return false;
  });

  const incoming = [...sources].flatMap(([prefix, statement]) => statement.rows.map(row => {
    const key = prefix + row.rowKey;
    const previous = previousByKey.get(key);
    previousByKey.delete(key);
    const payout: ContractCommissionPayoutRecord = {
      key,
      code: row.commissionCode || null,
      title: [row.productCode, row.commissionCode].filter(Boolean).join(" · "),
      amount: row.status === "storno" ? -Math.abs(row.commission) : row.commission,
      status: row.status,
      expectedAmount: null,
      difference: null,
      statementBaseAmount: null,
      systemBaseAmount: null,
      differenceReason: null,
      career: row.career,
      detail: null,
      statementId: statement.id,
      statementNumber: statement.statementNumber,
      statementPeriod: statement.statementPeriod,
      statementDate: statement.statementDate,
      statementChronologyMs: statement.statementChronologyMs,
      payoutMonthKey: statement.payoutMonthKey,
      writtenAtMs: previous?.writtenAtMs ?? nowMs,
      writtenBy: viewer,
    };
    if (!previous) added += 1;
    else if (previous.statementId !== payout.statementId || previous.career !== payout.career ||
      previous.statementChronologyMs !== payout.statementChronologyMs || previous.payoutMonthKey !== payout.payoutMonthKey) {
      updated += 1;
    } else {
      unchanged += 1;
    }
    return payout;
  }));

  return { incoming, merged: [...preserved, ...incoming], added, unchanged, updated: updated + previousByKey.size };
}

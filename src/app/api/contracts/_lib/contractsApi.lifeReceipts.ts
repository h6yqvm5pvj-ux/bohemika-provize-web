import { extractCommissionPayoutRowsFromStoredHtml, lifeIncreaseReceiptEvidence } from "@/app/api/commission-statements/statementPayoutRows";
import { indexLifeIncreaseReceiptEvidence, needsLifeIncreaseReceiptEvidence, uniqueFamilyCommissionReceipts, type LifeIncreaseStatementEvidence } from "@/app/lib/commissionReceipts";
import { isLifeProduct } from "@/app/lib/productCatalog";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { canViewStatementDerivedRecord, normalizeAccessEmail } from "./contractsApi.access";
import type { StatementDataViewer } from "./contractsApi.statementVisibility";
import type { ContractResponseItem } from "./contractsApi.types";

/** The caller has already authorized the timeline and filtered its statements by author. */
export async function projectContractLifeReceipts(timeline: ContractResponseItem[], viewer: StatementDataViewer): Promise<ContractResponseItem[]> {
  if (!adminDb || timeline.length < 2 || !isLifeProduct(timeline[0].productKey) ||
      !timeline.some(entry => entry.entryType === "endorsement")) return uniqueFamilyCommissionReceipts(timeline);

  const db = adminDb;
  const references = new Map<string, { id: string; writer: string }>();
  for (const entry of timeline) {
    for (const payout of entry.commissionPayouts ?? []) {
      if (!needsLifeIncreaseReceiptEvidence(payout)) continue;
      const id = payout.statementId ?? "";
      const writer = normalizeAccessEmail(payout.writtenBy);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || writer.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(writer) ||
          !canViewStatementDerivedRecord({ ...viewer, writtenBy: writer })) continue;
      references.set(`usersPrivate/${writer}/commissionStatements/${id}`, { id, writer });
    }
  }

  const sources: LifeIncreaseStatementEvidence[] = [];
  const reads = [...references];
  for (let offset = 0; offset < reads.length; offset += 10) {
    const results = await Promise.allSettled(reads.slice(offset, offset + 10).map(async ([path, reference]) => {
      const html = (await db.doc(path).get()).data()?.html;
      return { ...reference, rows: typeof html === "string"
        ? lifeIncreaseReceiptEvidence(reference.id, extractCommissionPayoutRowsFromStoredHtml(html)) : [] };
    }));
    for (const result of results) if (result.status === "fulfilled") sources.push(result.value);
  }
  return uniqueFamilyCommissionReceipts(timeline, indexLifeIncreaseReceiptEvidence(sources));
}

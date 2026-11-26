import { statementClientNameForCalculator } from "@/app/_provizni-vypisy/statementClientName";
import { DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX } from "@/app/_provizni-vypisy/statementProductMap";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { investmentInstitutionId, type ProductInstitutionId } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import { dedupeStatementSnapshots, parseCzechDate, savedStatementMetadataFromDoc } from "./savedStatementArchive";
import type { InvestmentStatementPayouts } from "./investmentStatementPayouts";
import { readStatementHtml } from "./statementHtml";
import { extractCommissionPayoutRowsFromStoredHtml, normalizeContractNumber } from "./statementPayoutRows";

type Snapshot = FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;
type InvestmentArchiveNumber = {
  institution: ProductInstitutionId;
  statements: Map<string, InvestmentStatementPayouts>;
  products: Set<Product>;
  names: Map<string, string>;
  dates: Set<string>;
  source: InvestmentStatementPayouts | null;
  conflictingInstitution: boolean;
};

const isoDay = (value: string | null): string | null => {
  const czech = value?.trim().match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  const canonical = czech
    ? `${czech[3]}-${czech[2].padStart(2, "0")}-${czech[1].padStart(2, "0")}`
    : value?.trim();
  if (!canonical || !/^\d{4}-\d{2}-\d{2}$/.test(canonical)) return null;
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === canonical ? canonical : null;
};

export function planInvestmentArchiveImport(
  archiveDocuments: Snapshot[],
  ownerEntries: Snapshot[],
  canCreateOnDate: (date: string) => boolean
) {
  const archive = dedupeStatementSnapshots(archiveDocuments).map(document => {
    const metadata = savedStatementMetadataFromDoc(document);
    const date = metadata.periodEndMs ?? metadata.statementChronologyMs ?? parseCzechDate(metadata.statementDate) ?? 0;
    const rows = extractCommissionPayoutRowsFromStoredHtml(readStatementHtml(document.data().html), {
      includeZeroOwnCommissions: true,
    });
    return { metadata, date, rows };
  }).sort((a, b) => a.date - b.date || a.metadata.id.localeCompare(b.metadata.id));
  const byNumber = new Map<string, InvestmentArchiveNumber>();
  const unsupportedInLatest = new Set<string>();
  const unsupportedProducts = new Set<string>();
  const numbersInLatest = new Set<string>();
  const latest = archive.findLast(statement => statement.rows.some(row => row.source === "own" &&
    DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX.products[row.productCode]?.category === "investment"))?.date;

  for (const { metadata, date, rows } of archive) {
    for (const row of rows) {
      if (row.source !== "own") continue;
      const product = DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX.products[row.productCode];
      if (product?.category !== "investment") continue;
      const institution = investmentInstitutionId(product.productKey);
      if (!institution || !product.productKey) {
        if (date === latest) {
          unsupportedInLatest.add(row.contractNumber);
          unsupportedProducts.add(row.productCode);
        }
        continue;
      }
      if (date === latest) numbersInLatest.add(row.contractNumber);
      const record = byNumber.get(row.contractNumber) ?? {
        institution, statements: new Map(), products: new Set(), names: new Map(), dates: new Set(),
        source: null, conflictingInstitution: false,
      };
      byNumber.set(row.contractNumber, record);
      if (institution !== record.institution) {
        record.conflictingInstitution = true;
        continue;
      }

      const statement = record.statements.get(metadata.id) ?? { ...metadata, rows: [] };
      if (row.commission !== 0) {
        statement.rows.push(row);
        record.statements.set(metadata.id, statement);
      }
      record.products.add(product.productKey);
      if (row.status !== "paid") continue;
      const name = statementClientNameForCalculator(row.client);
      if (name) record.names.set(name.normalize("NFC").toLocaleLowerCase("cs-CZ"), name);
      const signed = isoDay(row.signedAt);
      if (signed) record.dates.add(signed);
      if (name && signed) record.source = statement;
    }
  }

  const entriesByNumber = new Map<string, Snapshot[]>();
  for (const snapshot of ownerEntries) {
    const entry = snapshot.data() as ContractDoc;
    const number = normalizeContractNumber(entry.contractNumber);
    if (!number) continue;
    const entries = entriesByNumber.get(number) ?? [];
    entries.push(snapshot);
    entriesByNumber.set(number, entries);
  }

  const additions: Array<{
    contractNumber: string;
    productKey: Product;
    clientName: string;
    contractSignedDate: string;
    source: InvestmentStatementPayouts;
    statements: InvestmentStatementPayouts[];
  }> = [];
  const existing: Array<{ entry: Snapshot; statements: InvestmentStatementPayouts[] }> = [];
  const review = { unsupportedProduct: unsupportedInLatest.size, incomplete: 0, conflicting: 0, missingCareerPosition: 0 };
  for (const [contractNumber, record] of byNumber) {
    const local = entriesByNumber.get(contractNumber) ?? [];
    const candidate = numbersInLatest.has(contractNumber);
    const statements = [...record.statements.values()];
    if (record.conflictingInstitution || (candidate && unsupportedInLatest.has(contractNumber))) {
      if (candidate || local.length) review.conflicting += 1;
      continue;
    }
    if (local.length) {
      const entry = local[0];
      if (local.length === 1 && investmentInstitutionId((entry.data() as ContractDoc).productKey) === record.institution) {
        existing.push({ entry, statements });
      } else if (candidate) {
        review.conflicting += 1;
      }
      continue;
    }
    if (!candidate) continue;
    if (record.names.size > 1 || record.dates.size > 1) {
      review.conflicting += 1;
      continue;
    }
    const productKey = (["investikaRealitniFond", "investikaEfektika", "investikaMonetika", "conseqInvest"] as const)
      .find(product => record.products.has(product));
    const clientName = [...record.names.values()][0];
    const contractSignedDate = [...record.dates][0];
    if (!productKey || !clientName || !contractSignedDate || !record.source) {
      review.incomplete += 1;
    } else if (!canCreateOnDate(contractSignedDate)) {
      review.missingCareerPosition += 1;
    } else {
      additions.push({ contractNumber, productKey, clientName, contractSignedDate, source: record.source, statements });
    }
  }

  return {
    additions, existing, review, archiveCount: archive.length,
    unsupportedProducts: [...unsupportedProducts].sort(),
    latestDate: latest ? new Date(latest).toISOString().slice(0, 10) : null,
    latestSupportedContractCount: numbersInLatest.size,
  };
}

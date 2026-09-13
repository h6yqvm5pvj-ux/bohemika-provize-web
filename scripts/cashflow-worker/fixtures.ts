import type { CashflowSnapshot } from "../../src/app/cashflow/computeCashflow";
import type { CashflowViewOptions } from "../../src/app/cashflow/buildCashflowView";
import type {
  CashflowCommissionStatementSummary,
  EntryDoc,
} from "../../src/app/cashflow/types";
import type { PaymentFrequency, Product } from "../../src/app/types/domain";

export type WorkerFixture = {
  snapshot: CashflowSnapshot;
  statements: CashflowCommissionStatementSummary[];
};

export type WorkerFilterCase = {
  id: string;
  label: string;
  options: CashflowViewOptions;
};

const defaultOptions: CashflowViewOptions = {
  scopeFilter: "combined",
  productFilter: "all",
  tipsterMode: false,
  showPastYears: false,
  intelligentPredictionEnabled: false,
  contractNumberQuery: "",
};

export const WORKER_FILTER_CASES: readonly WorkerFilterCase[] = [
  { id: "combined", label: "Vlastní a týmové smlouvy", options: { ...defaultOptions } },
  { id: "own", label: "Pouze vlastní smlouvy", options: { ...defaultOptions, scopeFilter: "own" } },
  { id: "team", label: "Pouze týmové smlouvy", options: { ...defaultOptions, scopeFilter: "team" } },
  { id: "auto", label: "Pojištění vozidel", options: { ...defaultOptions, productFilter: "auto" } },
  { id: "life", label: "Životní pojištění", options: { ...defaultOptions, productFilter: "life" } },
  { id: "tip", label: "Pouze TIP provize", options: { ...defaultOptions, productFilter: "tip" } },
  { id: "history", label: "Včetně minulých let", options: { ...defaultOptions, showPastYears: true } },
  { id: "prediction", label: "Inteligentní predikce", options: { ...defaultOptions, intelligentPredictionEnabled: true } },
  { id: "search", label: "Vyhledání smlouvy 100000", options: { ...defaultOptions, contractNumberQuery: "100000" } },
];

const products: readonly Product[] = ["cppAuto", "kooperativaAuto", "pillowAuto", "neon", "flexi"];
const frequencies: readonly PaymentFrequency[] = ["monthly", "quarterly", "semiannual", "annual"];
const ownerEmail = "advisor@example.test";

const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Synthetic browser-only inputs. Same count/asOf/local time zone produces the
 * same portfolio without clock reads, randomness, network access or credentials.
 * contractCount counts contracts; TIP payouts and statements are additional.
 */
export function makeWorkerFixture(contractCount: number, asOf: Date): WorkerFixture {
  if (!Number.isInteger(contractCount) || contractCount < 1 || contractCount > 1000 ||
    !(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new Error("Synthetic fixtures require 1–1000 contracts and a valid asOf date.");
  }

  const snapshot: CashflowSnapshot = {
    email: ownerEmail,
    myPosition: "manazer8",
    myCommissionMode: "standard",
    hasAnyTeam: contractCount >= 4,
    ownEntries: [],
    teamEntriesRaw: [],
    tipPayouts: [],
    // Subscriptions require a production owner identity in the shared calculator.
    // This fixture keeps every identity synthetic and does not bypass that rule.
    subscriptionPayments: [],
  };
  const contracts: EntryDoc[] = [];

  for (let index = 0; index < contractCount; index++) {
    const team = index % 4 === 3;
    const productKey = products[index % products.length];
    const life = productKey === "neon" || productKey === "flexi";
    const startDate = new Date(asOf.getFullYear(), asOf.getMonth() - 1 - index % 36, 1 + index % 27);
    const immediateAmount = life ? 1200 + index % 80 * 12 : 120 + index % 80 * 3;
    const items = life
      ? [
          { code: "A101", title: "Okamžitá provize", amount: immediateAmount },
          { code: "B101-B104", title: "Následná provize (2.–5. rok)", amount: 30 + index % 10 },
          { code: "B201-B206", title: "Pečovatelská provize (5.–10. rok)", amount: 15 + index % 5 },
        ]
      : [{ code: "A101", title: "Okamžitá provize", amount: immediateAmount }];
    const entry: EntryDoc = {
      id: `contract-${String(index).padStart(4, "0")}`,
      userEmail: team ? `member-${Math.floor(index / 4) % 8}@example.test` : ownerEmail,
      productKey,
      frequencyRaw: frequencies[(index + Math.floor(index / products.length)) % frequencies.length],
      contractNumber: String(100000 + index),
      clientName: `Syntetický klient ${index + 1}`,
      contractSignedDate: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 3),
      policyStartDate: startDate,
      position: "poradce3",
      ownerCurrentPosition: "poradce3",
      commissionMode: "standard",
      status: "active",
      inputAmount: life ? 1000 + index % 40 * 25 : 6000 + index % 80 * 100,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    };
    if (team) {
      const overrideItems = items.map(item => ({ ...item, amount: Math.round(item.amount * 0.2 * 100) / 100 }));
      entry.managerOverrides = [{
        email: ownerEmail,
        position: "manazer8",
        commissionMode: "standard",
        items: overrideItems,
        total: overrideItems.reduce((sum, item) => sum + item.amount, 0),
      }];
    }
    (team ? snapshot.teamEntriesRaw : snapshot.ownEntries).push(entry);
    contracts.push(entry);
  }

  snapshot.tipPayouts = Array.from({ length: Math.max(3, Math.ceil(contractCount / 25)) }, (_, index) => ({
    id: `tip-${index}`,
    payoutDate: new Date(asOf.getFullYear(), asOf.getMonth() + index % 6, 25).getTime(),
    amount: 150 + index % 20 * 15,
    clientName: `Syntetický TIP ${index + 1}`,
    sourceOwnerEmail: `member-${index % 8}@example.test`,
    productKey: products[index % products.length],
  }));

  const statementCount = Math.max(3, Math.min(24, Math.ceil(contractCount / 40)));
  const paidContractsPerStatement = Math.min(contractCount, 30, Math.max(2, Math.ceil(contractCount / 30)));
  const statements = Array.from({ length: statementCount }, (_, index): CashflowCommissionStatementSummary => {
    const date = new Date(asOf.getFullYear(), asOf.getMonth() - index - 1, 24);
    const paidEntries = Array.from({ length: paidContractsPerStatement }, (_, row) => contracts[(row * 7 + index) % contracts.length]);
    const commissionTotal = paidEntries.reduce((sum, entry) => sum + (
      entry.managerOverrides?.[0]?.items[0]?.amount ?? entry.items?.[0]?.amount ?? 0
    ), 0);
    return {
      id: `statement-${index}`,
      fileName: `synthetic-statement-${index}.html`,
      statementNumber: `SYN-${index + 1}`,
      statementDate: `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`,
      period: `${date.getMonth() + 1}/${date.getFullYear()}`,
      advisorNumber: "synthetic",
      periodStartMs: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
      periodEndMs: new Date(date.getFullYear(), date.getMonth() + 1, 0).getTime(),
      statementDateMs: date.getTime(),
      // Same unpadded month key as the current cashflow view regression fixtures.
      payoutMonthKey: `${date.getFullYear()}-${date.getMonth() + 1}`,
      paidContractNumbers: paidEntries.map(entry => entry.contractNumber!),
      paidCommissionKeys: paidEntries.map(entry => `${entry.contractNumber}:A101`),
      commissionTotal,
      payoutTotal: commissionTotal,
      otherPaymentsTotal: 0,
      managerCommissionTotal: 0,
      createdAtMs: date.getTime(),
      updatedAtMs: date.getTime(),
    };
  });

  // Keep date strings represented too, as real API inputs contain both formats.
  snapshot.ownEntries.forEach((entry, index) => {
    if (index % 3 === 0) entry.policyStartDate = isoDay(entry.policyStartDate as Date);
  });
  return { snapshot, statements };
}

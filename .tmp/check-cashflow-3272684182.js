const { createJiti } = require("jiti");
const Module = require("module");
const path = require("path");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(process.cwd(), "src", request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const jiti = createJiti(`${process.cwd()}/.tmp/check-cashflow-3272684182.js`);
const { generateCashflow } = jiti("../src/app/cashflow/generator.ts");
const {
  commissionAuditSummaryForContract,
} = jiti("../src/app/lib/commissionAudit.ts");

const contract = {
  id: "ag5Aj2kkkCi615g6tCWX",
  productKey: "cppAuto",
  frequencyRaw: "quarterly",
  inputAmount: 4970,
  contractNumber: "3272684182",
  clientName: "Valerij Vjačeslavovyč Zlatnik",
  policyStartDate: "2025-11-12T00:00:00.000Z",
  contractSignedDate: "2025-11-12T00:00:00.000Z",
  status: "active",
  userEmail: "jakub.rauscher@bohemika.eu",
  items: [
    { amount: 631.19, code: "A101", title: "🚗 Okamžitá provize" },
    { amount: 631.19, code: "B101", excludeFromTotal: true, title: "🔁 Následná provize" },
    { amount: 2524.76, title: "📅 Provize za rok" },
  ],
  result: {
    items: [
      { amount: 631.19, title: "🚗 Okamžitá provize" },
      { amount: 2524.76, title: "📅 Provize za rok" },
    ],
    total: 2524.76,
  },
  commissionPayouts: [
    {
      amount: 631.19,
      code: "A101",
      expectedAmount: 631.19,
      payoutMonthKey: "2025-12",
      status: "paid",
      statementPeriod: "01.11.2025 - 30.11.2025",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "a101",
    },
    {
      amount: 631.19,
      code: "A102",
      expectedAmount: 631.19,
      payoutMonthKey: "2026-3",
      status: "paid",
      statementPeriod: "01.02.2026 - 28.02.2026",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "a102",
    },
    {
      amount: 631.19,
      code: "A103",
      expectedAmount: 631.19,
      payoutMonthKey: "2026-6",
      status: "paid",
      statementPeriod: "01.05.2026 - 31.05.2026",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "a103",
    },
  ],
};

const cashflow = generateCashflow([contract], 2, "jakub.rauscher@bohemika.eu")
  .filter((item) => item.contractNumber === "3272684182")
  .slice(0, 8)
  .map((item) => ({
    date: item.date.toISOString().slice(0, 10),
    code: item.commissionCode,
    aliases: item.commissionCodeAliases,
    label: item.commissionLabel,
    status: item.payoutStatus ?? "predicted",
    amount: item.amount,
    predictedAmount: item.predictedAmount,
  }));

const audit = commissionAuditSummaryForContract(contract, {
  mode: "all",
  viewerEmail: "jakub.rauscher@bohemika.eu",
  now: new Date("2026-07-19T00:00:00.000Z"),
});

console.log(JSON.stringify({ cashflow, audit }, null, 2));

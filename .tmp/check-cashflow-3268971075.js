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

const jiti = createJiti(`${process.cwd()}/.tmp/check-cashflow-3268971075.js`);
const { generateCashflow } = jiti("../src/app/cashflow/generator.ts");
const {
  commissionAuditSummaryForContract,
} = jiti("../src/app/lib/commissionAudit.ts");

const contract = {
  id: "idem_1f8317ab7f71770807e4a4cb2d08cc9b10e41431",
  productKey: "cppAuto",
  frequencyRaw: "semiannual",
  inputAmount: 5958,
  contractNumber: "3268971075",
  clientName: "David Beránek",
  policyStartDate: "2025-01-17T00:00:00.000Z",
  contractSignedDate: "2025-01-16T00:00:00.000Z",
  status: "active",
  userEmail: "jakub.rauscher@bohemika.eu",
  items: [
    { amount: 643.46, code: "A101", title: "🚗 Okamžitá provize" },
    { amount: 643.46, code: "B101", excludeFromTotal: true, title: "🔁 Následná provize" },
    { amount: 1286.93, title: "📅 Provize za rok" },
  ],
  commissionPayouts: [
    {
      amount: 643.46,
      code: "A101",
      expectedAmount: 643.46,
      payoutMonthKey: "2025-2",
      status: "paid",
      statementPeriod: "01.01.2025 - 31.01.2025",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "a101",
    },
    {
      amount: 643.46,
      code: "A102",
      expectedAmount: 643.46,
      payoutMonthKey: "2025-9",
      status: "paid",
      statementPeriod: "01.08.2025 - 31.08.2025",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "a102",
    },
    {
      amount: 667.01,
      code: "B101",
      expectedAmount: 667.01,
      payoutMonthKey: "2026-2",
      status: "paid",
      statementPeriod: "01.01.2026 - 31.01.2026",
      writtenBy: "jakub.rauscher@bohemika.eu",
      key: "b101",
    },
  ],
};

const cashflow = generateCashflow([contract], 2, "jakub.rauscher@bohemika.eu")
  .filter((item) => item.contractNumber === "3268971075")
  .slice(0, 6)
  .map((item) => ({
    date: item.date.toISOString().slice(0, 10),
    code: item.commissionCode,
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

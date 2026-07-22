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

const jiti = createJiti(`${process.cwd()}/.tmp/check-cashflow-3264928752.js`);
const { generateCashflow } = jiti("../src/app/cashflow/generator.ts");
const {
  commissionAuditSummaryForContract,
} = jiti("../src/app/lib/commissionAudit.ts");

const contract = {
  id: "idem_d66313daf6d0279c4a7038b94b5e07836ca72045",
  productKey: "cppAuto",
  frequencyRaw: "annual",
  inputAmount: 59322,
  contractNumber: "3264928752",
  clientName: "Tomáš Voltr",
  policyStartDate: "2024-01-18T00:00:00.000Z",
  contractSignedDate: "2024-01-18T00:00:00.000Z",
  status: "active",
  userEmail: "jakub.rauscher@bohemika.eu",
  items: [
    { amount: 6406.776, code: "A101", title: "🚗 Okamžitá provize" },
    { amount: 6406.776, code: "B101", excludeFromTotal: true, title: "🔁 Následná provize" },
    { amount: 6406.776, title: "📅 Provize za rok" },
  ],
  commissionPayouts: [
    {
      amount: 6682.72,
      code: "A101",
      expectedAmount: 6406.78,
      payoutMonthKey: "2024-2",
      status: "difference",
      key: "a101",
      writtenBy: "jakub.rauscher@bohemika.eu",
    },
    {
      amount: 6406.78,
      code: "B101",
      expectedAmount: 6406.78,
      payoutMonthKey: "2025-2",
      status: "paid",
      key: "b101",
      writtenBy: "jakub.rauscher@bohemika.eu",
    },
    {
      amount: 6222.31,
      code: "B102",
      expectedAmount: 6222.31,
      payoutMonthKey: "2026-2",
      status: "paid",
      key: "b102",
      writtenBy: "jakub.rauscher@bohemika.eu",
    },
  ],
};

const cashflow = generateCashflow([contract], 4, "jakub.rauscher@bohemika.eu")
  .filter((item) => item.contractNumber === "3264928752")
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

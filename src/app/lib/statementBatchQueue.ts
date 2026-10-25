import type { PaymentFrequency, Product } from "@/app/types/domain";

export type StatementBatchQueueProduct = Extract<Product, "cppAuto" | "domex" | "kooperativaAuto" | "uniqaAuto" | "allianzAuto" | "cppcestovko" | "pillowAuto">;

export const isStatementBatchQueueProduct = (value: unknown): value is StatementBatchQueueProduct =>
  value === "cppAuto" || value === "domex" || value === "kooperativaAuto" || value === "uniqaAuto" || value === "allianzAuto" || value === "cppcestovko" || value === "pillowAuto";

export const canQueueStatementProduct = (product: Product, replacementActive: boolean): product is StatementBatchQueueProduct =>
  isStatementBatchQueueProduct(product) && (!replacementActive || product === "cppAuto");

export type StatementBatchQueueReplacement = {
  isRefresh?: boolean;
  refreshOriginalContractNumber?: string | null;
};

export const statementBatchQueueReplacementError = (
  value: StatementBatchQueueReplacement & { product: Product; contractNumber: string }
): string | null => {
  const originalNumber = value.refreshOriginalContractNumber?.trim() ?? "";
  if (!value.isRefresh) {
    return originalNumber ? "Číslo původní smlouvy lze vyplnit pouze u náhrady." : null;
  }
  if (value.product !== "cppAuto") return "Náhradu lze přidat do fronty pouze pro ČPP Auto.";
  if (!originalNumber) return "Doplň číslo původní smlouvy.";
  const normalize = (number: string) => number.replace(/\s+/g, "").toUpperCase();
  if (normalize(originalNumber) === normalize(value.contractNumber)) {
    return "Číslo původní smlouvy musí být jiné než číslo nové smlouvy.";
  }
  return null;
};

// Keep the existing iframe message name compatible with already open forms.
export const STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE = "bohemka:statement-cpp-a101-queue-add";

export type StatementBatchQueueAddMessage = StatementBatchQueueReplacement & {
  type: typeof STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE;
  product: StatementBatchQueueProduct;
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
  policyEndDate?: string;
  amountText: string;
  frequency: PaymentFrequency;
  stornoDate: string;
  pdfFile?: File | null;
};

export const isStatementBatchQueueAddMessage = (value: unknown): value is StatementBatchQueueAddMessage => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.type === STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE &&
    isStatementBatchQueueProduct(record.product) &&
    ["contractNumber", "clientName", "contractSignedDate", "policyStartDate", "amountText", "stornoDate"]
      .every((key) => typeof record[key] === "string") &&
    typeof record.frequency === "string" &&
    ["monthly", "quarterly", "semiannual", "annual"].includes(record.frequency) &&
    (record.policyEndDate === undefined || typeof record.policyEndDate === "string") &&
    (record.isRefresh === undefined || typeof record.isRefresh === "boolean") &&
    (record.refreshOriginalContractNumber == null || typeof record.refreshOriginalContractNumber === "string") &&
    statementBatchQueueReplacementError({
      product: record.product,
      contractNumber: record.contractNumber as string,
      isRefresh: record.isRefresh as boolean | undefined,
      refreshOriginalContractNumber: record.refreshOriginalContractNumber as string | null | undefined,
    }) === null;
};

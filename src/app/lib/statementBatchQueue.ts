import type { PaymentFrequency, Product } from "@/app/types/domain";

export type StatementBatchQueueProduct = Extract<Product, "cppAuto" | "domex" | "kooperativaAuto" | "uniqaAuto">;

export const isStatementBatchQueueProduct = (value: unknown): value is StatementBatchQueueProduct =>
  value === "cppAuto" || value === "domex" || value === "kooperativaAuto" || value === "uniqaAuto";

// Keep the existing iframe message name compatible with already open forms.
export const STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE = "bohemka:statement-cpp-a101-queue-add";

export type StatementBatchQueueAddMessage = {
  type: typeof STATEMENT_BATCH_QUEUE_ADD_MESSAGE_TYPE;
  product: StatementBatchQueueProduct;
  contractNumber: string;
  clientName: string;
  contractSignedDate: string;
  policyStartDate: string;
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
    ["monthly", "quarterly", "semiannual", "annual"].includes(record.frequency);
};

import { PRODUCT_CATALOG } from "@/app/lib/productCatalog";
import type { PaymentFrequency, Product } from "@/app/types/domain";

export type StatementBatchQueueProduct = Product;

export const isStatementBatchQueueProduct = (value: unknown): value is StatementBatchQueueProduct =>
  typeof value === "string" && Object.hasOwn(PRODUCT_CATALOG, value);

export const canQueueStatementProduct = (product: Product, replacementActive: boolean): product is StatementBatchQueueProduct => {
  // Replacement validation now runs through the same calculator workflow as direct saves.
  void replacementActive;
  return isStatementBatchQueueProduct(product);
};

export type StatementBatchQueueReplacement = {
  isRefresh?: boolean;
  refreshOriginalMissingInSystem?: boolean;
  refreshOriginalContractNumber?: string | null;
};

export const statementBatchQueueReplacementError = (
  value: StatementBatchQueueReplacement & { product: Product; contractNumber: string }
): string | null => {
  const originalNumber = value.refreshOriginalContractNumber?.trim() ?? "";
  if (!value.isRefresh) {
    return originalNumber ? "Číslo původní smlouvy lze vyplnit pouze u náhrady." : null;
  }
  if (value.refreshOriginalMissingInSystem && value.product === "neon") return null;
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
  contractEntry?: Record<string, unknown>;
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
    (record.contractEntry === undefined || (
      record.contractEntry !== null && typeof record.contractEntry === "object" &&
      !Array.isArray(record.contractEntry) &&
      (record.contractEntry as Record<string, unknown>).productKey === record.product &&
      (record.contractEntry as Record<string, unknown>).entryType === "contract"
    )) &&
    (record.refreshOriginalMissingInSystem === undefined || typeof record.refreshOriginalMissingInSystem === "boolean") &&
    (record.policyEndDate === undefined || typeof record.policyEndDate === "string") &&
    (record.isRefresh === undefined || typeof record.isRefresh === "boolean") &&
    (record.refreshOriginalContractNumber == null || typeof record.refreshOriginalContractNumber === "string") &&
    statementBatchQueueReplacementError({
      product: record.product,
      contractNumber: record.contractNumber as string,
      refreshOriginalMissingInSystem: record.refreshOriginalMissingInSystem as boolean | undefined,
      isRefresh: record.isRefresh as boolean | undefined,
      refreshOriginalContractNumber: record.refreshOriginalContractNumber as string | null | undefined,
    }) === null;
};

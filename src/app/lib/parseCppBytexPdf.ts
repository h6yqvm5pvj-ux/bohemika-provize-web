import { type PaymentFrequency } from "../types/domain";
import { parseCppHafanPdf } from "./parseCppHafanPdf";

export type CppBytexPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

export async function parseCppBytexPdf(file: File): Promise<CppBytexPdfResult> {
  return parseCppHafanPdf(file);
}

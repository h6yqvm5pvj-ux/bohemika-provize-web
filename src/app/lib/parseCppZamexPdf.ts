// src/app/lib/parseCppZamexPdf.ts
import { type PaymentFrequency } from "../types/domain";
import { parseCppHafanPdf } from "./parseCppHafanPdf";

export type CppZamexPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

export async function parseCppZamexPdf(file: File): Promise<CppZamexPdfResult> {
  return parseCppHafanPdf(file);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import { type Product } from "@/app/types/domain";

type FirestoreTimestamp = { seconds: number; nanoseconds: number };

type ContractDoc = {
  id: string;
  product?: Product;
  clientName?: string | null;
  contractNumber?: string | null;
  contractStartDate?: string | FirestoreTimestamp | Date | null;
};

type AnniversaryRow = {
  id: string;
  client: string;
  contractNumber: string;
  product: Product;
  daysToAnniversary: number;
};

const AUTO_PRODUCTS: Product[] = [
  "cppAuto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
];

const PRODUCT_LABEL: Record<Product, string> = {
  neon: "ČPP ŽP NEON",
  flexi: "Kooperativa ŽP FLEXI",
  maximaMaxEfekt: "MAXIMA ŽP MaxEfekt",
  pillowInjury: "Pillow Úraz / Nemoc",
  zamex: "ČPP ZAMEX",
  domex: "ČPP DOMEX",
  maxdomov: "Maxima MAXDOMOV",
  cppAuto: "ČPP Auto",
  allianzAuto: "Allianz Auto",
  csobAuto: "ČSOB Auto",
  uniqaAuto: "UNIQA Auto",
  pillowAuto: "Pillow Auto",
  kooperativaAuto: "Kooperativa Auto",
  cppPPRs: "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS",
  cppPPRbez: "ČPP Pojištění majetku a odpovědnosti podnikatelů",
  cppcestovko: "ČPP Cestovko",
  axacestovko: "AXA Cestovko",
  comfortcc: "Comfort Commodity",
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextAnniversary(start: Date, now: Date): Date {
  const ann = new Date(start);
  ann.setFullYear(ann.getFullYear() + 1);
  while (ann < now) {
    ann.setFullYear(ann.getFullYear() + 1);
  }
  return ann;
}

export function AutoAnniversaryModal({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AnniversaryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      try {
        const qContracts = query(
          collection(db, "contracts"),
          where("userId", "==", userId),
          where("product", "in", AUTO_PRODUCTS)
        );
        const snap = await getDocs(qContracts);
        const now = new Date();

        const results: AnniversaryRow[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as ContractDoc;
          const start = toDate(data.contractStartDate);
          if (!start) return;
          const ann = nextAnniversary(start, now);
          const diffDays = Math.ceil(
            (ann.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays < 0 || diffDays > 60) return;
          const product = data.product;
          if (!product) return;
          results.push({
            id: docSnap.id,
            client: data.clientName ?? "Neznámý klient",
            contractNumber: data.contractNumber ?? "—",
            product,
            daysToAnniversary: diffDays,
          });
        });

        results.sort((a, b) => a.daysToAnniversary - b.daysToAnniversary);
        setRows(results);
        setOpen(results.length > 0);
      } catch (e) {
        console.error("Chyba při načítání výročí", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const content = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        productLabel: PRODUCT_LABEL[r.product] ?? r.product,
      })),
    [rows]
  );

  if (!open || rows.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[min(720px,90vw)] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Blížící se výročí – Auto
            </p>
            <p className="text-sm text-slate-700">
              Smlouvy s výročním datem do 60 dní
            </p>
          </div>
          <button
            className="text-xs text-slate-500 hover:text-slate-800"
            onClick={() => setOpen(false)}
          >
            Zavřít
          </button>
        </div>

        <div className="max-h-[420px] overflow-auto">
          {loading && (
            <p className="text-sm text-slate-500 px-4 py-3">
              Načítám smlouvy…
            </p>
          )}
          {!loading && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-4 py-2">Klient</th>
                  <th className="px-4 py-2">Číslo smlouvy</th>
                  <th className="px-4 py-2">Produkt</th>
                  <th className="px-4 py-2 text-right">Dnů do výročí</th>
                </tr>
              </thead>
              <tbody>
                {content.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-4 py-2">{r.client}</td>
                    <td className="px-4 py-2">{r.contractNumber}</td>
                    <td className="px-4 py-2">{r.productLabel}</td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      {r.daysToAnniversary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

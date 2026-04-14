"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import { toDate } from "@/app/lib/formatters";
import {
  isAutoProduct,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import { type Product } from "@/app/types/domain";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds?: number;
  toDate?: () => Date;
};

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  productKey?: Product;
  clientName?: string | null;
  contractNumber?: string | null;
  policyStartDate?: string | FirestoreTimestamp | Date | null;
  contractSignedDate?: string | FirestoreTimestamp | Date | null;
  createdAt?: string | FirestoreTimestamp | Date | null;
  contractStartDate?: string | FirestoreTimestamp | Date | null;
};

type AnniversaryRow = {
  id: string;
  client: string;
  contractNumber: string;
  product: Product;
  daysToAnniversary: number;
};

function nextAnniversary(start: Date, now: Date): Date {
  const ann = new Date(start);
  ann.setFullYear(ann.getFullYear() + 1);
  while (ann < now) {
    ann.setFullYear(ann.getFullYear() + 1);
  }
  return ann;
}

const normalizeEmail = (email?: string | null) => (email ?? "").trim().toLowerCase();

export function AutoAnniversaryModal({
  userEmail,
}: {
  userEmail?: string | null;
}) {
  const [rows, setRows] = useState<AnniversaryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const normalizedEmail = normalizeEmail(userEmail);
    if (!normalizedEmail) {
      setRows([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const rawEmail = (userEmail ?? "").trim();
        const ownerIds = Array.from(
          new Set([
            normalizedEmail,
            rawEmail && rawEmail !== normalizedEmail ? rawEmail : null,
          ].filter(Boolean) as string[])
        );

        const byEntryKey = new Map<string, EntryDoc>();

        const ownerSnaps = await Promise.all(
          ownerIds.map((owner) => getDocs(collection(db, "users", owner, "entries")))
        );
        ownerSnaps.forEach((ownerSnap, index) => {
          const owner = ownerIds[index];
          ownerSnap.forEach((docSnap) => {
            const key = `${owner.toLowerCase()}___${docSnap.id}`;
            byEntryKey.set(key, {
              ...(docSnap.data() as Omit<EntryDoc, "id">),
              id: key,
            });
          });
        });

        const groupSnap = await getDocs(
          query(collectionGroup(db, "entries"), where("userEmail", "==", normalizedEmail))
        );
        groupSnap.forEach((docSnap) => {
          const data = docSnap.data() as Omit<EntryDoc, "id">;
          const owner =
            normalizeEmail(data.userEmail) ||
            normalizeEmail(docSnap.ref.parent.parent?.id) ||
            normalizedEmail;
          const key = `${owner}___${docSnap.id}`;
          if (!byEntryKey.has(key)) {
            byEntryKey.set(key, { ...data, id: key });
          }
        });

        const now = new Date();

        const results: AnniversaryRow[] = [];
        byEntryKey.forEach((data) => {
          const start =
            toDate(data.policyStartDate) ??
            toDate(data.contractSignedDate) ??
            toDate(data.createdAt) ??
            toDate(data.contractStartDate);
          if (!start) return;

          const ann = nextAnniversary(start, now);
          const diffDays = Math.ceil(
            (ann.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays < 0 || diffDays > 60) return;

          const product = data.productKey;
          if (!product || !isAutoProduct(product)) return;

          results.push({
            id: data.id,
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
    void load();
  }, [userEmail]);

  const content = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        productLabel: productLabelFromCatalog(r.product, r.product),
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

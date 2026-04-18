"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/app/firebase";
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

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: (EntryDoc & { adviserEmail?: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

const CONTRACTS_PAGE_LIMIT = 50;
const CONTRACTS_MAX_PAGES = 80;

function nextAnniversary(start: Date, now: Date): Date {
  const ann = new Date(start);
  ann.setFullYear(ann.getFullYear() + 1);
  while (ann < now) {
    ann.setFullYear(ann.getFullYear() + 1);
  }
  return ann;
}

const normalizeEmail = (email?: string | null) => (email ?? "").trim().toLowerCase();
const normalizeCursorToken = (
  token: string | null | undefined,
  legacyCursor: number | null | undefined
): string | null => {
  if (typeof token === "string" && token.trim()) {
    return token.trim();
  }
  if (typeof legacyCursor === "number" && Number.isFinite(legacyCursor)) {
    return String(legacyCursor);
  }
  return null;
};

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
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setRows([]);
          setOpen(false);
          return;
        }

        let bearerToken = await currentUser.getIdToken();
        const requestContracts = async (cursor?: string | null) => {
          const params = new URLSearchParams({
            scope: "my",
            limit: String(CONTRACTS_PAGE_LIMIT),
          });
          if (cursor) params.set("cursor", cursor);

          const requestWithToken = async (token: string) =>
            fetch(`/api/contracts?${params.toString()}`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            });

          let res = await requestWithToken(bearerToken);
          if (res.status === 401) {
            bearerToken = await currentUser.getIdToken(true);
            res = await requestWithToken(bearerToken);
          }
          const payload = (await res.json()) as ContractsApiResponse;
          if (!res.ok || payload?.ok === false) {
            throw new Error(payload?.error || "Nepodařilo se načíst smlouvy.");
          }
          return payload;
        };

        const byEntryKey = new Map<string, EntryDoc>();
        let cursor: string | null = null;
        let hasMore = true;
        let page = 0;
        while (hasMore && page < CONTRACTS_MAX_PAGES) {
          page += 1;
          const payload = await requestContracts(cursor);
          const items = (payload.contracts ?? []) as (EntryDoc & {
            adviserEmail?: string | null;
          })[];
          items.forEach((item) => {
            const owner = normalizeEmail(
              item.adviserEmail ?? item.userEmail ?? normalizedEmail
            );
            const id = String(item.id ?? "").trim();
            if (!owner || !id) return;
            const key = `${owner}___${id}`;
            byEntryKey.set(key, {
              ...(item as Omit<EntryDoc, "id">),
              id: key,
              userEmail: owner,
            });
          });

          cursor = normalizeCursorToken(payload.nextCursorToken, payload.nextCursor);
          hasMore = Boolean(payload.hasMore) && Boolean(cursor);
        }

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

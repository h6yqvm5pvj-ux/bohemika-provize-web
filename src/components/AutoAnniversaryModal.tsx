"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, X } from "lucide-react";
import { auth } from "@/app/firebase";
import { productLabel as productLabelFromCatalog } from "@/app/lib/productCatalog";
import {
  buildAutoAnniversaryRows,
  normalizeAutoAnniversaryEmail,
  type AutoAnniversaryEntry,
  type AutoAnniversaryRow,
} from "@/components/autoAnniversary";

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: AutoAnniversaryEntry[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

const CONTRACTS_PAGE_LIMIT = 50;
const CONTRACTS_MAX_PAGES = 80;
const ANNIVERSARY_MODAL_SHOWN_KEY_PREFIX = "home.auto-anniversary.shown";

const localDayStamp = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const modalShownStorageKey = (email: string) =>
  `${ANNIVERSARY_MODAL_SHOWN_KEY_PREFIX}:${email}`;

const anniversaryCountLabel = (count: number) => {
  if (count === 1) return "1 smlouva s výročním datem do 60 dní";
  if (count >= 2 && count <= 4) {
    return `${count} smlouvy s výročním datem do 60 dní`;
  }
  return `${count} smluv s výročním datem do 60 dní`;
};

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
  const [rows, setRows] = useState<AutoAnniversaryRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const markModalShownToday = (email: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        modalShownStorageKey(email),
        localDayStamp(new Date())
      );
    } catch {
      // ignore storage access errors (private mode, quota, etc.)
    }
  };

  const wasModalShownToday = (email: string) => {
    if (typeof window === "undefined") return false;
    try {
      const value = window.localStorage.getItem(modalShownStorageKey(email));
      return value === localDayStamp(new Date());
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const normalizedEmail = normalizeAutoAnniversaryEmail(userEmail);
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
            fetch(`/api/contracts/list?${params.toString()}`, {
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

        const byEntryKey = new Map<string, AutoAnniversaryEntry>();
        let cursor: string | null = null;
        let hasMore = true;
        let page = 0;
        while (hasMore && page < CONTRACTS_MAX_PAGES) {
          page += 1;
          const payload = await requestContracts(cursor);
          const items = payload.contracts ?? [];
          items.forEach((item) => {
            const owner = normalizeAutoAnniversaryEmail(
              item.adviserEmail ?? item.userEmail ?? normalizedEmail
            );
            const id = String(item.id ?? "").trim();
            if (!owner || !id) return;
            const key = `${owner}___${id}`;
            byEntryKey.set(key, {
              ...item,
              id,
              userEmail: owner,
            });
          });

          cursor = normalizeCursorToken(payload.nextCursorToken, payload.nextCursor);
          hasMore = Boolean(payload.hasMore) && Boolean(cursor);
        }

        const now = new Date();
        const results = buildAutoAnniversaryRows(
          Array.from(byEntryKey.values()),
          now,
          normalizedEmail
        );
        setRows(results);
        const hasRows = results.length > 0;
        if (!hasRows) {
          setOpen(false);
          return;
        }
        if (wasModalShownToday(normalizedEmail)) {
          setOpen(false);
          return;
        }
        setOpen(true);
      } catch (e) {
        console.error("Chyba při načítání výročí", e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [userEmail]);

  useEffect(() => {
    if (!open) return;
    const normalizedEmail = normalizeAutoAnniversaryEmail(userEmail);
    if (!normalizedEmail) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      markModalShownToday(normalizedEmail);
      setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, userEmail]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-4 backdrop-blur-md sm:px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-anniversary-title"
    >
      <div className="flex max-h-[min(720px,92vh)] w-[min(860px,94vw)] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#7c2d12] text-white shadow-[0_10px_24px_rgba(124,45,18,0.24)]">
              <CalendarDays className="h-5 w-5" strokeWidth={2.3} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p
                id="auto-anniversary-title"
                className="text-xs font-black uppercase tracking-[0.18em] text-slate-500"
              >
                Blížící se výročí - Auto
              </p>
              <p className="mt-1 text-base font-semibold text-slate-800">
                {anniversaryCountLabel(content.length)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Kliknutím na řádek otevřeš detail smlouvy.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ui-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
            aria-label="Zavřít upozornění na výročí"
            onClick={() => {
              markModalShownToday(normalizeAutoAnniversaryEmail(userEmail));
              setOpen(false);
            }}
          >
            <X className="h-4.5 w-4.5" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-auto">
          {loading && (
            <p className="px-5 py-4 text-sm text-slate-500">
              Načítám smlouvy…
            </p>
          )}
          {!loading && (
            <div className="text-sm">
              <div className="sticky top-0 z-[1] hidden grid-cols-[minmax(150px,1.35fr)_minmax(110px,0.8fr)_minmax(110px,0.9fr)_92px_34px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-500 sm:grid">
                <span>Klient</span>
                <span>Číslo smlouvy</span>
                <span>Produkt</span>
                <span className="text-right">Dnů</span>
                <span className="sr-only">Otevřít</span>
              </div>
              <div className="divide-y divide-slate-100">
                {content.map((r) => (
                  <Link
                    key={r.id}
                    href={r.href}
                    onClick={() => {
                      markModalShownToday(normalizeAutoAnniversaryEmail(userEmail));
                    }}
                    className="group grid gap-2 px-5 py-3 text-slate-800 transition hover:bg-amber-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:grid-cols-[minmax(150px,1.35fr)_minmax(110px,0.8fr)_minmax(110px,0.9fr)_92px_34px] sm:items-center sm:gap-3"
                    title={`Otevřít smlouvu ${r.contractNumber}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-950">
                        {r.client}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500 sm:hidden">
                        {r.productLabel} · {r.contractNumber}
                      </div>
                    </div>
                    <div className="hidden font-semibold text-slate-700 sm:block">
                      {r.contractNumber}
                    </div>
                    <div className="hidden text-slate-700 sm:block">
                      {r.productLabel}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-xs font-black uppercase tracking-[0.08em] text-slate-500 sm:hidden">
                        Dnů do výročí
                      </span>
                      <span className="inline-flex min-w-11 justify-center rounded-full bg-slate-950 px-2.5 py-1 text-sm font-black text-white">
                        {r.daysToAnniversary}
                      </span>
                    </div>
                    <span className="hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition group-hover:border-amber-200 group-hover:text-amber-800 sm:inline-flex">
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                      <span className="sr-only">Otevřít detail smlouvy</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

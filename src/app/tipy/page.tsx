"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Car,
  CheckSquare,
  Home,
  Package,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { AppLayout } from "@/components/AppLayout";

type AccountType = "advisor" | "tipster";
type TipLifecycleStatus = "pending" | "contracted" | "failed";
type TipFilterStatus = "all" | "new" | "contracted";

type TipField = {
  label: string;
  value: string;
};

type TipAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

type TipsterTip = {
  id: string;
  title: string;
  product: string;
  productLabel: string;
  status: TipLifecycleStatus | string;
  recipientEmail: string;
  recipientName: string;
  tipsterEmail: string;
  tipsterName: string;
  messageText: string;
  fields: TipField[];
  attachments: TipAttachment[];
  attachmentCount: number;
  createdAtMs: number | null;
};

type TipsResponse = {
  ok?: boolean;
  items?: TipsterTip[];
  counts?: Partial<Record<TipFilterStatus, number>>;
  error?: string;
};

type TipStatusPatchResponse = {
  ok?: boolean;
  id?: string;
  status?: TipLifecycleStatus;
  error?: string;
};

type TipsBulkDeleteResponse = {
  ok?: boolean;
  deletedIds?: string[];
  skippedIds?: string[];
  deletedCount?: number;
  skippedCount?: number;
  error?: string;
};

const TIP_STATUS_OPTIONS: Array<{
  key: TipLifecycleStatus;
  label: string;
  badgeClass: string;
}> = [
  {
    key: "pending",
    label: "Čeká na zpracování",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    key: "contracted",
    label: "Sjednáno",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    key: "failed",
    label: "Obchod neproběhl",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const resolveAccountType = (
  profile: Record<string, unknown> | null | undefined
): AccountType => {
  const raw =
    typeof profile?.accountType === "string"
      ? profile.accountType
      : typeof profile?.userRole === "string"
        ? profile.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const formatDateTime = (ms: number | null): string => {
  if (!ms || !Number.isFinite(ms)) return "Neznámý čas";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return "Neznámý čas";
  }
};

const normalizeTipStatus = (value: unknown): TipLifecycleStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const tipStatusMeta = (status: TipLifecycleStatus) =>
  TIP_STATUS_OPTIONS.find((option) => option.key === status) ?? TIP_STATUS_OPTIONS[0]!;

const tipMatchesFilter = (tip: TipsterTip, filter: TipFilterStatus): boolean => {
  if (filter === "all") return true;
  const status = normalizeTipStatus(tip.status);
  if (filter === "new") return status === "pending";
  return status === "contracted";
};

const countTipsByFilter = (tips: TipsterTip[]): Record<TipFilterStatus, number> => ({
  all: tips.length,
  new: tips.filter((tip) => normalizeTipStatus(tip.status) === "pending").length,
  contracted: tips.filter((tip) => normalizeTipStatus(tip.status) === "contracted").length,
});

function TipStatusBadge({ status }: { status: TipLifecycleStatus }) {
  const meta = tipStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${meta.badgeClass}`}
    >
      {meta.label}
    </span>
  );
}

const productIconKind = (product: string): "vehicle" | "business" | "property" | "other" => {
  const normalized = normalize(product);
  if (normalized.includes("vehicle") || normalized.includes("vozidel")) return "vehicle";
  if (normalized.includes("business") || normalized.includes("podnikatel")) return "business";
  if (normalized.includes("property") || normalized.includes("majetek")) return "property";
  return "other";
};

const findField = (tip: TipsterTip, patterns: RegExp[]): string => {
  const found = tip.fields.find((field) => {
    const label = normalize(field.label);
    return patterns.some((pattern) => pattern.test(label));
  });
  return found?.value ?? "";
};

const primaryClient = (tip: TipsterTip): string =>
  findField(tip, [/jmeno/, /klient/, /nazev/, /ares/]) || "Neuvedený klient";

const contactText = (tip: TipsterTip): string => {
  const phone = findField(tip, [/telefon/]);
  const email = findField(tip, [/e-mail/, /email/]);
  if (phone && email) return `${phone} • ${email}`;
  return phone || email || "Kontakt neuveden";
};

const preferredCallText = (tip: TipsterTip): string =>
  findField(tip, [/preferovany.*cas/, /preferovany.*datum/]) || "Čas volání neuveden";

function ProductIcon({ product }: { product: string }) {
  const productKind = productIconKind(product);
  if (productKind === "vehicle") return <Car className="h-3.5 w-3.5" />;
  if (productKind === "business") return <Building2 className="h-3.5 w-3.5" />;
  if (productKind === "property") return <Home className="h-3.5 w-3.5" />;
  return <Package className="h-3.5 w-3.5" />;
}

function TipCard({
  tip,
  mode,
  updating,
  selected,
  selectionDisabled,
  onToggleSelected,
  onSetStatus,
  onOpen,
}: {
  tip: TipsterTip;
  mode: AccountType;
  updating: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onToggleSelected: () => void;
  onSetStatus?: (id: string, status: TipLifecycleStatus) => void;
  onOpen: () => void;
}) {
  const isAdvisorMode = mode === "advisor";
  const tipStatus = normalizeTipStatus(tip.status);
  const sideLabel = isAdvisorMode ? "Tipař" : "Příjemce";
  const sideValue = isAdvisorMode
    ? tip.tipsterName || tip.tipsterEmail || "Tipař"
    : tip.recipientName || tip.recipientEmail || "Neuveden";

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Otevřít detail tipu ${tip.productLabel}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      className={`group relative isolate cursor-pointer overflow-hidden rounded-2xl border px-4 py-3 font-mono shadow-[0_8px_20px_rgba(15,23,42,0.05)] outline-none transition focus-visible:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 ${
        selected
          ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(100,116,139,0.45),rgba(30,41,59,0.72),rgba(100,116,139,0.45),rgba(148,163,184,0))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-[2px] z-[1] h-px rounded-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(226,232,240,0.88),rgba(148,163,184,0))]"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-4">
        <div className="relative z-[1] min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
              } ${selectionDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={selectionDisabled}
                onChange={onToggleSelected}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                aria-label={`Označit tip ${tip.productLabel}`}
              />
              {selected ? "Vybráno" : "Označit"}
            </label>
            <TipStatusBadge status={tipStatus} />
            <div className="min-w-0 text-[1.5rem] leading-tight font-semibold text-slate-900 sm:text-[1.75rem]">
              {tip.productLabel}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-1.5 text-[15px] leading-tight text-slate-700">
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                Klient
              </span>
              <span className="text-base font-semibold text-slate-900">{primaryClient(tip)}</span>
            </p>
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                Kontakt
              </span>
              <span className="text-slate-900">{contactText(tip)}</span>
            </p>
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                Volání
              </span>
              <span className="text-slate-900">{preferredCallText(tip)}</span>
            </p>
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                Odesláno
              </span>
              <span className="text-slate-900">{formatDateTime(tip.createdAtMs)}</span>
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-5 sm:pt-0">
          <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                {sideLabel}
              </span>
              <div className="mt-1 max-w-[180px] truncate text-sm font-semibold text-slate-900">
                {sideValue}
              </div>
              {tip.attachmentCount > 0 ? (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                  <Paperclip className="h-3.5 w-3.5" />
                  {tip.attachmentCount} {tip.attachmentCount === 1 ? "příloha" : "příloh"}
                </div>
              ) : null}
            </div>

            {isAdvisorMode && onSetStatus ? (
              <label
                className="w-full max-w-[180px] cursor-default text-right"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Stav tipu
                </span>
                <select
                  value={tipStatus}
                  onChange={(event) =>
                    onSetStatus(tip.id, event.target.value as TipLifecycleStatus)
                  }
                  disabled={updating}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition hover:border-slate-400 focus:border-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {TIP_STATUS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <ProductIcon product={`${tip.product} ${tip.productLabel}`} />
          {tip.productLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3.5 w-3.5" />
          {tip.tipsterName || tip.tipsterEmail || "Tipař"}
        </span>
      </div>
    </article>
  );
}

function TipsPageContent() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [items, setItems] = useState<TipsterTip[]>([]);
  const [counts, setCounts] = useState<Record<TipFilterStatus, number>>({
    all: 0,
    new: 0,
    contracted: 0,
  });
  const [statusFilter, setStatusFilter] = useState<TipFilterStatus>("new");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      setUser(null);
      setAuthReady(true);
      setProfileReady(true);
      setLoading(false);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setUser(fbUser ?? null);
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      if (authReady) {
        setProfileReady(true);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    setProfileReady(false);
    void getUserProfileCached(user)
      .then((payload) => {
        if (cancelled) return;
        setAccountType(resolveAccountType(payload.profile));
      })
      .catch(() => {
        if (cancelled) return;
        setAccountType("advisor");
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const loadTips = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const endpoint =
          accountType === "tipster"
            ? "/api/tipster-tips?limit=160"
            : `/api/advisor-tips?status=${encodeURIComponent(statusFilter)}`;
        const payload = await fetchAuthedJsonOrThrow<TipsResponse>(currentUser, endpoint, {
          method: "GET",
          cache: "no-store",
        });
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
        if (accountType === "advisor") {
          setCounts({
            all: Math.max(0, Math.floor(payload.counts?.all ?? nextItems.length)),
            new: Math.max(0, Math.floor(payload.counts?.new ?? 0)),
            contracted: Math.max(0, Math.floor(payload.counts?.contracted ?? 0)),
          });
        } else {
          setCounts(countTipsByFilter(nextItems));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Tipy se nepodařilo načíst.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountType, statusFilter]
  );

  useEffect(() => {
    if (!authReady || !profileReady || !user) return;
    void loadTips();
  }, [authReady, profileReady, user, loadTips]);

  const handleSetStatus = async (id: string, status: TipLifecycleStatus) => {
    const currentUser = auth.currentUser;
    if (!currentUser || accountType !== "advisor") return;
    setUpdatingId(id);
    setError(null);
    try {
      await fetchAuthedJsonOrThrow<TipStatusPatchResponse>(currentUser, "/api/advisor-tips", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      await loadTips("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stav tipu se nepodařilo uložit.");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    const query = normalize(searchText);
    return items.filter((tip) => {
      if (!tipMatchesFilter(tip, statusFilter)) return false;
      if (!query) return true;
      const haystack = normalize(
        [
          tip.productLabel,
          tip.recipientEmail,
          tip.recipientName,
          tip.tipsterEmail,
          tip.tipsterName,
          ...tip.fields.flatMap((field) => [field.label, field.value]),
        ].join(" ")
      );
      return haystack.includes(query);
    });
  }, [items, searchText, statusFilter]);

  const visibleItemIds = useMemo(() => filteredItems.map((tip) => tip.id), [filteredItems]);
  const selectedVisibleCount = useMemo(
    () => visibleItemIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleItemIds]
  );
  const allVisibleSelected = visibleItemIds.length > 0 && selectedVisibleCount === visibleItemIds.length;

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(visibleItemIds);
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleItemIds]);

  const toggleTipSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleItemIds.forEach((id) => next.delete(id));
      } else {
        visibleItemIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleItemIds]);

  const clearSelectedTips = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDeleteSelected = useCallback(async () => {
    const currentUser = auth.currentUser;
    const ids = Array.from(selectedIds);
    if (!currentUser || ids.length === 0) return;

    const confirmed = window.confirm(
      `Opravdu chceš smazat vybrané tipy (${ids.length})? Tuto akci nelze vrátit.`
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<TipsBulkDeleteResponse>(
        currentUser,
        "/api/tips/bulk-delete",
        {
          method: "DELETE",
          body: JSON.stringify({ ids }),
        }
      );
      const deletedIds = Array.isArray(payload.deletedIds) ? payload.deletedIds : [];
      if (deletedIds.length === 0) {
        throw new Error("Vybrané tipy nebyly nalezené nebo je nešlo smazat.");
      }
      const deletedIdSet = new Set(deletedIds);
      setItems((prev) => prev.filter((tip) => !deletedIdSet.has(tip.id)));
      setSelectedIds(new Set());
      await loadTips("refresh");
      if ((payload.skippedCount ?? 0) > 0) {
        setError(`Smazáno ${deletedIds.length}, ${payload.skippedCount} tipů přeskočeno.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vybrané tipy se nepodařilo smazat.");
    } finally {
      setBulkDeleting(false);
    }
  }, [loadTips, selectedIds]);

  const isAdvisorMode = accountType === "advisor";
  const hasAnyTips = counts.all > 0;
  const hasSearchQuery = normalize(searchText).length > 0;
  const openTipDetail = useCallback(
    (id: string) => {
      router.push(`/tipy/${encodeURIComponent(id)}`);
    },
    [router]
  );

  return (
    <div className="w-full bg-slate-50 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-5 font-mono text-slate-900">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#6d28d9_0%,#a855f7_55%,#c084fc_100%)]" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                {isAdvisorMode ? "Přijaté tipy" : "Tipařský účet"}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Tipy
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                {isAdvisorMode
                  ? "Přehled tipů od tipařů. Nově odeslané tipy najdeš ve filtru Nové."
                  : "Přehled tipů odeslaných z domovské stránky."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadTips("refresh")}
              disabled={refreshing || loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Obnovit
            </button>
          </div>
        </section>

        <section className="sticky top-16 z-20 rounded-2xl border border-slate-200/80 bg-slate-50/95 p-2 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-slate-50/85 lg:top-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex rounded-2xl border border-slate-200 bg-white p-1">
              {([
                ["all", "Všechny", counts.all],
                ["new", "Nové", counts.new],
                ["contracted", "Sjednané", counts.contracted],
              ] as Array<[TipFilterStatus, string, number]>).map(([key, label, count]) => {
                const active = statusFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? "bg-slate-900 text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {label} <span className={active ? "text-white/75" : "text-slate-400"}>({count})</span>
                  </button>
                );
              })}
            </div>

            <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 xl:max-w-xl">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Hledat klienta, produkt, telefon nebo e-mail…"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              {filteredItems.length} {filteredItems.length === 1 ? "tip" : "tipů"}
            </div>
          </div>

          {filteredItems.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleAllVisible}
                  disabled={bulkDeleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:border-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckSquare className="h-4 w-4" aria-hidden="true" />
                  {allVisibleSelected ? "Zrušit výběr zobrazených" : "Označit zobrazené"}
                </button>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  Vybráno {selectedIds.size}
                </span>
                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={clearSelectedTips}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Zrušit
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleBulkDeleteSelected}
                disabled={selectedIds.size === 0 || bulkDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-700 bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-[0_10px_20px_rgba(190,18,60,0.22)] transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:hover:translate-y-0"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {bulkDeleting ? "Mažu…" : `Smazat vybrané${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
              </button>
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading || !profileReady ? (
          <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p>Načítám tipy…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="ui-card ui-card-quiet mt-4 rounded-2xl bg-white px-6 py-10 text-center text-sm text-slate-700">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              {!hasAnyTips
                ? "Zatím žádné tipy"
                : hasSearchQuery
                  ? "Nic neodpovídá hledání"
                  : "V tomto filtru nejsou žádné tipy"}
            </h2>
            <p className="mx-auto mt-1 max-w-xl text-slate-600">
              {!hasAnyTips
                ? isAdvisorMode
                  ? "Tipy od tipařů se zobrazí tady."
                  : "Jakmile odešleš tip z domovské stránky, zobrazí se tady."
                : hasSearchQuery
                  ? "Zkus upravit hledaný výraz."
                  : statusFilter === "new"
                    ? "Nové tipy se zobrazí tady."
                    : "Sjednané tipy se zobrazí tady."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredItems.map((tip) => (
              <TipCard
                key={tip.id}
                tip={tip}
                mode={accountType}
                updating={updatingId === tip.id}
                selected={selectedIds.has(tip.id)}
                selectionDisabled={bulkDeleting}
                onToggleSelected={() => toggleTipSelected(tip.id)}
                onSetStatus={handleSetStatus}
                onOpen={() => openTipDetail(tip.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TipyPage() {
  return (
    <AppLayout active="tips">
      <TipsPageContent />
    </AppLayout>
  );
}

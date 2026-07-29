"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  TableProperties,
  Trash2,
} from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { PRODUCT_OPTIONS } from "@/app/lib/productCatalog";
import {
  STATEMENT_PRODUCT_BASE_RULE_OPTIONS,
  STATEMENT_PRODUCT_CATEGORY_OPTIONS,
  normalizeStatementProductMapCode,
  statementProductMapEntryEquals,
  statementProductBaseRuleLabel,
  statementProductCategoryLabel,
  type StatementProductBaseRule,
  type StatementProductMapEntry,
} from "@/app/_provizni-vypisy/statementProductMap";
import type { Product } from "@/app/types/domain";
import { AppLayout } from "@/components/AppLayout";

type ProductMapResponse = {
  ok: true;
  entries: StatementProductMapEntry[];
  defaultEntries: StatementProductMapEntry[];
  overrideEntries: StatementProductMapEntry[];
  updatedAtMs: number | null;
  updatedBy: string | null;
} & Record<string, unknown>;

type EditableStatementProductMapEntry = StatementProductMapEntry & {
  localId: string;
};

const sourceLabel = (source: StatementProductMapEntry["source"]): string => {
  switch (source) {
    case "override":
      return "Upraveno";
    case "custom":
      return "Vlastní";
    default:
      return "Default";
  }
};

const sourceClass = (source: StatementProductMapEntry["source"]): string => {
  switch (source) {
    case "override":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "custom":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
};

const createEditableEntry = (
  entry: StatementProductMapEntry,
  index: number
): EditableStatementProductMapEntry => ({
  ...entry,
  localId: `${entry.code || "new"}-${index}-${Math.random().toString(36).slice(2)}`,
});

const serializeEntry = (entry: EditableStatementProductMapEntry): StatementProductMapEntry => ({
  code: normalizeStatementProductMapCode(entry.code),
  label: entry.label?.trim() || null,
  productKey: entry.productKey || null,
  category: entry.category,
  baseRule: entry.baseRule,
  isLifeSplit: entry.isLifeSplit === true,
  isInvestmentSection: entry.isInvestmentSection === true,
  note: entry.note?.trim() || null,
});

const formatDateTime = (value: number | null | undefined): string => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export default function AdminStatementProductMapPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [entries, setEntries] = useState<EditableStatementProductMapEntry[]>([]);
  const [defaultEntries, setDefaultEntries] = useState<StatementProductMapEntry[]>([]);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const defaultByCode = useMemo(
    () => new Map(defaultEntries.map((entry) => [entry.code, entry])),
    [defaultEntries]
  );

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
      if (!query) return true;
      return [
        entry.code,
        entry.label ?? "",
        entry.productKey ?? "",
        statementProductCategoryLabel(entry.category),
        statementProductBaseRuleLabel(entry.baseRule),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [categoryFilter, entries, search]);

  const loadMap = useCallback(
    async (currentUser: FirebaseUser | null = auth.currentUser) => {
      if (!currentUser) return;
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<ProductMapResponse>(
          currentUser,
          "/api/admin/commission-statement-product-map"
        );
        setEntries(payload.entries.map(createEditableEntry));
        setDefaultEntries(payload.defaultEntries ?? []);
        setUpdatedAtMs(payload.updatedAtMs ?? null);
        setUpdatedBy(payload.updatedBy ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    void loadMap(user);
  }, [authReady, loadMap, user]);

  const patchEntry = (
    localId: string,
    patch: Partial<EditableStatementProductMapEntry>
  ) => {
    setEntries((previous) =>
      previous.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry))
    );
    setStatus(null);
  };

  const addEntry = () => {
    const entry: EditableStatementProductMapEntry = {
      localId: `new-${Date.now()}`,
      code: "",
      label: null,
      productKey: null,
      category: "unknown",
      baseRule: "auto",
      isLifeSplit: false,
      isInvestmentSection: false,
      note: null,
      source: "custom",
    };
    setEntries((previous) => [entry, ...previous]);
    setStatus(null);
  };

  const removeEntry = (localId: string) => {
    setEntries((previous) => previous.filter((entry) => entry.localId !== localId));
    setStatus(null);
  };

  const resetEntry = (entry: EditableStatementProductMapEntry) => {
    const defaultEntry = defaultByCode.get(normalizeStatementProductMapCode(entry.code));
    if (!defaultEntry) {
      removeEntry(entry.localId);
      return;
    }
    patchEntry(entry.localId, {
      ...defaultEntry,
      localId: entry.localId,
      source: "default",
    });
  };

  const saveMap = async () => {
    if (!user || saving) return;

    const serialized = entries.map(serializeEntry).filter((entry) => entry.code);
    const codes = serialized.map((entry) => entry.code);
    const duplicated = codes.find((code, index) => codes.indexOf(code) !== index);
    if (duplicated) {
      setError(`Kód ${duplicated} je v mapě vícekrát.`);
      return;
    }
    if (serialized.length === 0) {
      setError("Mapa musí obsahovat alespoň jeden produktový kód.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<ProductMapResponse>(
        user,
        "/api/admin/commission-statement-product-map",
        {
          method: "PUT",
          body: JSON.stringify({ entries: serialized }),
        }
      );
      setEntries(payload.entries.map(createEditableEntry));
      setDefaultEntries(payload.defaultEntries ?? []);
      setUpdatedAtMs(payload.updatedAtMs ?? null);
      setUpdatedBy(payload.updatedBy ?? null);
      setStatus("Produktová mapa výpisů je uložená.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout active="admin">
      <div className="w-full max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/zadosti"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Admin
            </Link>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Produktová mapa výpisů
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>Řádků: {entries.length}</span>
              <span>Upraveno: {formatDateTime(updatedAtMs)}</span>
              <span>Admin: {updatedBy ?? user?.email ?? "—"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addEntry}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              Přidat kód
            </button>
            <button
              type="button"
              onClick={() => void loadMap()}
              disabled={!user || loading || saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              )}
              Načíst znovu
            </button>
            <button
              type="button"
              onClick={() => void saveMap()}
              disabled={!user || loading || saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              )}
              Uložit mapu
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-700">
                <TableProperties className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Mapa produktových kódů z provizního výpisu
                </h2>
                <p className="text-sm text-slate-600">
                  Admin změny se použijí při novém načtení provizního výpisu.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-[260px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <Search className="h-4 w-4 text-slate-400" strokeWidth={2.2} aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Hledat kód, název, produkt..."
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="all">Všechny kategorie</option>
                {STATEMENT_PRODUCT_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {status}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="w-[150px] px-3 py-3">Kód z výpisu</th>
                  <th className="w-[210px] px-3 py-3">Název</th>
                  <th className="w-[230px] px-3 py-3">Produkt v systému</th>
                  <th className="w-[190px] px-3 py-3">Kategorie</th>
                  <th className="w-[170px] px-3 py-3">Pravidlo základny</th>
                  <th className="w-[110px] px-3 py-3">ŽP rozpad</th>
                  <th className="w-[120px] px-3 py-3">Investice</th>
                  <th className="w-[260px] px-3 py-3">Poznámka</th>
                  <th className="w-[110px] px-3 py-3">Zdroj</th>
                  <th className="w-[110px] px-3 py-3 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading && entries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-sm font-semibold text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                        Načítám produktovou mapu...
                      </span>
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-sm font-semibold text-slate-500">
                      Žádný řádek neodpovídá filtru.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const serializedEntry = serializeEntry(entry);
                    const matchingDefault = defaultByCode.get(serializedEntry.code);
                    const liveSource = matchingDefault
                      ? statementProductMapEntryEquals(serializedEntry, matchingDefault)
                        ? "default"
                        : "override"
                      : "custom";
                    const canRemoveEntry = liveSource === "custom";

                    return (
                    <tr key={entry.localId} className="align-top hover:bg-slate-50/60">
                      <td className="px-3 py-3">
                        <input
                          value={entry.code}
                          onChange={(event) =>
                            patchEntry(entry.localId, {
                              code: normalizeStatementProductMapCode(event.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={entry.label ?? ""}
                          onChange={(event) =>
                            patchEntry(entry.localId, { label: event.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={entry.productKey ?? ""}
                          onChange={(event) =>
                            patchEntry(entry.localId, {
                              productKey: (event.target.value || null) as Product | null,
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        >
                          <option value="">Bez vazby</option>
                          {PRODUCT_OPTIONS.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={entry.category}
                          onChange={(event) =>
                            patchEntry(entry.localId, {
                              category: event.target.value as StatementProductMapEntry["category"],
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        >
                          {STATEMENT_PRODUCT_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={entry.baseRule}
                          onChange={(event) =>
                            patchEntry(entry.localId, {
                              baseRule: event.target.value as StatementProductBaseRule,
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        >
                          {STATEMENT_PRODUCT_BASE_RULE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={entry.isLifeSplit}
                            onChange={(event) =>
                              patchEntry(entry.localId, { isLifeSplit: event.target.checked })
                            }
                            className="h-4 w-4 accent-violet-700"
                          />
                          Ano
                        </label>
                      </td>
                      <td className="px-3 py-3">
                        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={entry.isInvestmentSection}
                            onChange={(event) =>
                              patchEntry(entry.localId, {
                                isInvestmentSection: event.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-violet-700"
                          />
                          Ano
                        </label>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={entry.note ?? ""}
                          onChange={(event) =>
                            patchEntry(entry.localId, { note: event.target.value })
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${sourceClass(liveSource)}`}
                        >
                          {sourceLabel(liveSource)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => resetEntry(entry)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
                            title="Vrátit default nebo odebrat vlastní řádek"
                          >
                            <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEntry(entry.localId)}
                            disabled={!canRemoveEntry}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300"
                            title={
                              canRemoveEntry
                                ? "Odebrat vlastní řádek"
                                : "Výchozí kódy se neodstraňují, použij reset"
                            }
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

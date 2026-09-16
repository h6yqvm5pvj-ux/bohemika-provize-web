"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownWideNarrow, ArrowRight, Building2, CalendarDays, Car, Check,
  CheckCheck, CheckSquare, ChevronRight, CircleCheck, CircleX, Clock3,
  Home, Inbox, Lightbulb, Mail, Package, Paperclip, Phone,
  RefreshCw, Search, Sparkles, Trash2, UserRound, X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { getUserProfileCached } from "@/app/lib/userProfileCache";
import { AppLayout } from "@/components/AppLayout";
import { TipDetailModal } from "./TipDetailModal";
import styles from "./tips.module.css";

type AccountType = "advisor" | "tipster";
type TipLifecycleStatus = "pending" | "contracted" | "failed";
type TipFilterStatus = "all" | "new" | "contracted" | "failed";
type TipSort = "newest" | "oldest" | "client";

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

const TIP_STATUS_OPTIONS: Array<{ key: TipLifecycleStatus; label: string }> = [
  { key: "pending", label: "Čeká na zpracování" },
  { key: "contracted", label: "Sjednáno" },
  { key: "failed", label: "Obchod neproběhl" },
];

const TIP_FILTERS: Array<{ key: TipFilterStatus; label: string; description: string; icon: typeof Inbox }> = [
  { key: "all", label: "Všechny tipy", description: "Příležitosti na jednom místě", icon: Inbox },
  { key: "new", label: "Nové", description: "Čekají na zpracování", icon: Clock3 },
  { key: "contracted", label: "Sjednané", description: "Úspěšně uzavřené obchody", icon: CircleCheck },
  { key: "failed", label: "Neuskutečněné", description: "Obchod tentokrát nevyšel", icon: CircleX },
];

const tipCountLabel = (count: number): string => `${count} ${count === 1 ? "tip" : count > 1 && count < 5 ? "tipy" : "tipů"}`;

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
  return status === filter;
};

const countTipsByFilter = (tips: TipsterTip[]): Record<TipFilterStatus, number> => ({
  all: tips.length,
  new: tips.filter((tip) => normalizeTipStatus(tip.status) === "pending").length,
  contracted: tips.filter((tip) => normalizeTipStatus(tip.status) === "contracted").length,
  failed: tips.filter((tip) => normalizeTipStatus(tip.status) === "failed").length,
});

function TipStatusBadge({ status }: { status: TipLifecycleStatus }) {
  return <span className={styles.statusBadge} data-status={status}>
    {status === "contracted" ? <Check size={12} /> : <span className={styles.statusDot} />}
    {tipStatusMeta(status).label}
  </span>;
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

const preferredCallText = (tip: TipsterTip): string =>
  tip.fields.filter((field) => /preferovany.*(?:cas|datum)/.test(normalize(field.label)))
    .map((field) => field.value).filter(Boolean).join(" · ");

function ProductIcon({ product }: { product: string }) {
  const productKind = productIconKind(product);
  if (productKind === "vehicle") return <Car size={23} />;
  if (productKind === "business") return <Building2 size={23} />;
  if (productKind === "property") return <Home size={23} />;
  return <Package size={23} />;
}

function TipCard({ tip, mode, updating, selected, selectionDisabled, onToggleSelected, onSetStatus, onOpen }: {
  tip: TipsterTip;
  mode: AccountType;
  updating: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onToggleSelected: () => void;
  onSetStatus: (id: string, status: TipLifecycleStatus) => void;
  onOpen: () => void;
}) {
  const status = normalizeTipStatus(tip.status);
  const client = primaryClient(tip);
  const phone = findField(tip, [/telefon/]);
  const email = findField(tip, [/e-mail/, /email/]);
  const callTime = preferredCallText(tip);
  const sideValue = mode === "advisor"
    ? tip.tipsterName || tip.tipsterEmail || "Neuvedený tipař"
    : tip.recipientName || tip.recipientEmail || "Neuvedený příjemce";
  const href = `/tipy/${encodeURIComponent(tip.id)}`;
  const openInWindow = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen();
  };

  return (
    <article className={`${styles.tipCard} ${selected ? styles.selectedCard : ""}`} aria-label={`Tip pro klienta ${client}`}>
      <div className={styles.cardTop}>
        <TipStatusBadge status={status} />
        <label className={styles.cardCheckbox}>
          <span>{selected ? "Vybráno" : "Vybrat"}</span>
          <input type="checkbox" checked={selected} disabled={selectionDisabled} onChange={onToggleSelected} aria-label={`Označit tip pro ${client}`} />
        </label>
      </div>
      <div className={styles.cardMain}>
        <div className={styles.clientHeading}>
          <span className={styles.productIcon} data-product={productIconKind(`${tip.product} ${tip.productLabel}`)}><ProductIcon product={`${tip.product} ${tip.productLabel}`} /></span>
          <div className={styles.clientInfo}>
            <h3><Link href={href} onClick={openInWindow} aria-haspopup="dialog">{client}</Link></h3>
            <p>{tip.productLabel}</p>
          </div>
        </div>
        <div className={styles.contacts}>
          {phone ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} aria-label={`Zavolat klientovi ${client}: ${phone}`}><Phone size={15} /><span>{phone}</span></a> : null}
          {email ? <a href={`mailto:${email.trim().replace(/[\r\n?&#]/g, "")}`} aria-label={`Napsat klientovi ${client}: ${email}`}><Mail size={15} /><span>{email}</span></a> : null}
          {!phone && !email ? <span className={styles.muted}><UserRound size={15} />Kontakt neuveden</span> : null}
        </div>
      </div>
      {callTime ? <div className={styles.callTime}><CalendarDays size={15} /><span>Ideální čas zavolat <strong>{callTime}</strong></span></div> : null}
      <div className={styles.cardMeta}>
        <span className={styles.personAvatar}><UserRound size={15} /></span>
        <span className={styles.sender}><small>{mode === "advisor" ? "Tip od" : "Odesláno pro"}</small><span title={sideValue}>{sideValue}</span></span>
        <span className={styles.sentAt} title="Datum odeslání"><Clock3 size={13} />{formatDateTime(tip.createdAtMs)}</span>
        {tip.attachmentCount > 0 ? <Link href={href} onClick={openInWindow} aria-haspopup="dialog" className={styles.attachments} aria-label={`Zobrazit přílohy (${tip.attachmentCount})`}><Paperclip size={14} />{tip.attachmentCount}</Link> : null}
      </div>
      <div className={styles.cardFooter}>
        {mode === "advisor" ? <label className={styles.statusControl}>
          <span>Stav tipu</span>
          <select value={status} onChange={(event) => onSetStatus(tip.id, event.target.value as TipLifecycleStatus)} disabled={updating || selectionDisabled} aria-label={`Stav tipu pro ${client}`}>
            {TIP_STATUS_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          {updating ? <RefreshCw size={13} className={styles.spinning} aria-label="Ukládám stav" /> : null}
        </label> : <span className={styles.readonlyStatus}><CheckCheck size={15} />Tip odeslán poradci</span>}
        <Link href={href} onClick={openInWindow} aria-haspopup="dialog" className={styles.detailLink}>Detail tipu<ArrowRight size={16} /></Link>
      </div>
    </article>
  );
}

function TipsPageContent() {
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [items, setItems] = useState<TipsterTip[]>([]);
  const counts = useMemo(() => countTipsByFilter(items), [items]);
  const [statusFilter, setStatusFilter] = useState<TipFilterStatus>("new");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<TipSort>("newest");
  const [detailTip, setDetailTip] = useState<{ id: string; client: string } | null>(null);
  const closeDetail = useCallback(() => setDetailTip(null), []);

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
            ? "/api/tipster-tips?limit=200"
            : "/api/advisor-tips?status=all";
        const payload = await fetchAuthedJsonOrThrow<TipsResponse>(currentUser, endpoint, {
          method: "GET",
          cache: "no-store",
        });
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Tipy se nepodařilo načíst.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountType]
  );

  useEffect(() => {
    if (!authReady || !profileReady || !user) return;
    void loadTips();
  }, [authReady, profileReady, user, loadTips]);

  const refreshAfterDetailChange = useCallback(() => { void loadTips("refresh"); }, [loadTips]);

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
    }).sort((a, b) => {
      if (sort === "client") return primaryClient(a).localeCompare(primaryClient(b), "cs");
      if (a.createdAtMs === null) return b.createdAtMs === null ? 0 : 1;
      if (b.createdAtMs === null) return -1;
      return sort === "oldest" ? a.createdAtMs - b.createdAtMs : b.createdAtMs - a.createdAtMs;
    });
  }, [items, searchText, statusFilter, sort]);

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
  const busy = loading || !profileReady || !authReady;
  const disabled = busy || refreshing || bulkDeleting || updatingId !== null || !user;

  return (
    <div className={styles.page}>
      {detailTip ? <TipDetailModal key={detailTip.id} {...detailTip} onClose={closeDetail} onChanged={refreshAfterDetailChange} /> : null}
      <header className={styles.pageHeader}>
        <div className={styles.pageTitle}><span><Lightbulb size={21} /></span><h1>Tipy</h1><span className={styles.headerDivider} /><p>{isAdvisorMode ? "Přijaté příležitosti" : "Moje odeslané příležitosti"}</p></div>
        <button type="button" onClick={() => void loadTips("refresh")} disabled={disabled} className={styles.refreshButton}><RefreshCw size={15} className={refreshing ? styles.spinning : undefined} />{refreshing ? "Obnovuji…" : "Obnovit"}</button>
      </header>

      <section className={styles.hero} aria-labelledby="tips-hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span />PROSTOR PRO NOVÉ PŘÍLEŽITOSTI</span>
          <h2 id="tips-hero-title">Dobrý obchod<br />začíná <span>tipem.</span></h2>
          <p>{isAdvisorMode ? "Spojujeme dobré kontakty se správnou péčí. Každý tip je šance pomoci dalšímu klientovi." : "Doporuč kontakt, který si zaslouží dobrou péči. Průběh svých tipů najdeš přehledně tady."}</p>
          {isAdvisorMode ? <button type="button" className={styles.heroAction} onClick={() => { setStatusFilter("new"); setSearchText(""); document.getElementById("tips-overview")?.scrollIntoView({ block: "start" }); }} disabled={busy || !user}>
            <span className={styles.heroActionDot} />{busy ? "Načítám příležitosti…" : counts.new > 0 ? `${tipCountLabel(counts.new)} ke zpracování` : "Prohlédnout nové tipy"}<ArrowRight size={16} />
          </button> : <Link href="/" className={styles.heroAction}>Odeslat nový tip<ArrowRight size={16} /></Link>}
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.orbit} /><div className={styles.orbitInner} />
          <Image src="/illustrations/tips/referral-lightbulb.webp" alt="" width={800} height={800} priority sizes="(max-width: 600px) 150px, 340px" className={styles.heroImage} />
          <span className={styles.artCaption}><Sparkles size={13} />Malý tip. Velká příležitost.</span>
        </div>
      </section>

      <section className={styles.stats} aria-label="Přehled počtu tipů">
        {TIP_FILTERS.map(({ key, label, description, icon: Icon }) => <button key={key} type="button" className={styles.statCard} data-tone={key} aria-pressed={statusFilter === key} disabled={busy || !user} onClick={() => { setStatusFilter(key); setSearchText(""); }}>
          <div className={styles.statTop}><span className={styles.statIcon}><Icon size={18} /></span><ChevronRight size={15} className={styles.statArrow} /></div>
          <div className={styles.statValue}><strong>{busy ? "—" : counts[key]}</strong><span>{label}</span></div>
          <p>{description}</p>
        </button>)}
      </section>

      <div className={styles.workspace}>
        <section className={styles.overview} id="tips-overview" aria-labelledby="tips-overview-title" aria-busy={busy || refreshing}>
          <div className={styles.sectionHeading}><h2 id="tips-overview-title">{isAdvisorMode ? "Přehled tipů" : "Moje tipy"}</h2><span aria-live="polite">{busy ? "Načítám…" : `${tipCountLabel(filteredItems.length)} v přehledu`}</span></div>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}><Search size={17} /><input aria-label="Hledat v tipech" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Hledat klienta, kontakt nebo produkt…" />{searchText ? <button type="button" aria-label="Vymazat hledání" onClick={() => setSearchText("")}><X size={15} /></button> : null}</div>
            <label className={styles.sortControl}><ArrowDownWideNarrow size={16} /><select aria-label="Řazení tipů" value={sort} onChange={(event) => setSort(event.target.value as TipSort)}><option value="newest">Nejnovější</option><option value="oldest">Nejstarší</option><option value="client">Podle klienta</option></select></label>
          </div>
          <div className={styles.filterBar}>
            <div className={styles.filters} aria-label="Filtrovat podle stavu">{TIP_FILTERS.map(({ key, label }) => <button key={key} type="button" aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>{key === "all" ? "Všechny" : label}<span>{busy ? "–" : counts[key]}</span></button>)}</div>
            {filteredItems.length > 0 ? <label className={styles.selectAll}><input type="checkbox" checked={allVisibleSelected} onChange={handleToggleAllVisible} disabled={disabled} /><span>Vybrat vše</span></label> : null}
          </div>
          {selectedIds.size > 0 ? <div className={styles.selectionBar} role="region" aria-label="Hromadné akce"><span><CheckSquare size={16} />Vybráno {selectedIds.size}</span><button type="button" onClick={clearSelectedTips} disabled={bulkDeleting}><X size={14} />Zrušit výběr</button><button type="button" className={styles.deleteButton} onClick={() => void handleBulkDeleteSelected()} disabled={disabled}><Trash2 size={14} />{bulkDeleting ? "Mažu…" : "Smazat vybrané"}</button></div> : null}
          {error ? <div className={styles.error} role="alert"><CircleX size={18} /><span>{error}</span><button type="button" onClick={() => void loadTips("refresh")} disabled={disabled}>Zkusit znovu</button></div> : null}
          {busy ? <div className={styles.loading} role="status"><RefreshCw size={20} className={styles.spinning} /><p>Načítám tvoje příležitosti…</p><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
            : !user ? <div className={styles.empty}><span className={styles.emptyIcon}><UserRound size={28} /></span><h3>Pro zobrazení tipů se přihlas</h3><Link href="/">Přejít na přihlášení<ArrowRight size={16} /></Link></div>
            : error && !hasAnyTips ? null
            : filteredItems.length === 0 ? <div className={styles.empty}>
              <span className={styles.emptyIcon}>{hasSearchQuery ? <Search size={28} /> : statusFilter === "new" && hasAnyTips ? <CheckCheck size={30} /> : <Lightbulb size={30} />}</span>
              <h3>{hasSearchQuery ? "Tenhle tip jsme nenašli" : !hasAnyTips ? "Tady začínají nové příležitosti" : statusFilter === "new" ? "Všechno máš zpracované" : "Zatím žádné tipy v tomto stavu"}</h3>
              <p>{hasSearchQuery ? "Zkus jiné jméno, telefon nebo název produktu." : !hasAnyTips ? isAdvisorMode ? "Jakmile ti tipař pošle první kontakt, najdeš ho tady. Připravený na další krok." : "Pošli svůj první tip z domovské stránky. Tady pak uvidíš, jak se mu daří." : statusFilter === "new" ? "Až dorazí další tip, najdeš ho právě tady." : "Ostatní příležitosti najdeš v přehledu všech tipů."}</p>
              {hasSearchQuery ? <button type="button" onClick={() => setSearchText("")}>Vymazat hledání<ArrowRight size={16} /></button> : hasAnyTips && statusFilter !== "all" ? <button type="button" onClick={() => setStatusFilter("all")}>Zobrazit všechny tipy<ArrowRight size={16} /></button> : !isAdvisorMode ? <Link href="/">Odeslat první tip<ArrowRight size={16} /></Link> : null}
            </div>
            : <div className={styles.cardList}>{filteredItems.map((tip) => <TipCard key={tip.id} tip={tip} mode={accountType} updating={updatingId === tip.id} selected={selectedIds.has(tip.id)} selectionDisabled={disabled} onToggleSelected={() => toggleTipSelected(tip.id)} onSetStatus={handleSetStatus} onOpen={() => setDetailTip({ id: tip.id, client: primaryClient(tip) })} />)}</div>}
        </section>
        <aside className={styles.sidebar} aria-label="Jak pracovat s tipy">
          <div className={styles.guide}><span className={styles.guideEyebrow}>KAŽDÝ KONTAKT SE POČÍTÁ</span><h2>Od tipu ke smlouvě</h2><p>Tři malé kroky k dobrému obchodu.</p><ol>
            <li><span className={styles.stepNumber}>01</span><div><h3>{isAdvisorMode ? "Ozvi se klientovi" : "Předej dobrý kontakt"}</h3><p>{isAdvisorMode ? "Využij telefon nebo e-mail přímo na kartě. Respektuj čas, který si klient přeje." : "Přidej telefon, e-mail a čas, kdy se klientovi hodí zavolat."}</p></div></li>
            <li><span className={styles.stepNumber}>02</span><div><h3>{isAdvisorMode ? "Najdi správné řešení" : "Poradce se ozve"}</h3><p>{isAdvisorMode ? "V detailu najdeš podklady a přílohy od tipaře. Všechno pro první schůzku." : "Poradce s klientem projde jeho potřeby a navrhne vhodné řešení."}</p></div></li>
            <li><span className={styles.stepNumber}>03</span><div><h3>{isAdvisorMode ? "Dej tipaři vědět" : "Sleduj výsledek"}</h3><p>{isAdvisorMode ? "Aktualizuj stav tipu. Tipař tak uvidí, jak jeho doporučení dopadlo." : "Jakmile poradce aktualizuje stav, výsledek uvidíš i ve svém přehledu."}</p></div></li>
          </ol></div>
          <div className={styles.advice}><span className={styles.adviceIcon}><Lightbulb size={20} /></span><h3>Osobní přístup dělá rozdíl.</h3><p>{isAdvisorMode ? "Při prvním hovoru zmiň, kdo vás propojil. Známé jméno je dobrý začátek důvěry." : "Řekni klientovi, že se mu poradce ozve. Předem domluvený kontakt začíná lépe."}</p><span className={styles.adviceFooter}><span />Malý detail, lepší první dojem</span></div>
        </aside>
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

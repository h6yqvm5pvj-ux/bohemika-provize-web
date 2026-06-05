"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Car,
  ChevronDown,
  Clock,
  CircleDollarSign,
  CircleX,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Home,
  IdCard,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { AppLayout } from "@/components/AppLayout";

type AccountType = "advisor" | "tipster";
type TipLifecycleStatus = "pending" | "contracted" | "failed";

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

type LinkedContractSummary = {
  ownerEmail: string;
  entryId: string;
  path: string;
  number: string;
  tipsterPercent: number | null;
  immediateGrossFirstYear: number | null;
  immediateNetFirstYear: number | null;
  tipsterAmountFirstYear: number | null;
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
  linkedContractOwnerEmail?: string;
  linkedContractEntryId?: string;
  linkedContractPath?: string;
  linkedContractNumber?: string;
  linkedContract?: LinkedContractSummary | null;
  createdAtMs: number | null;
};

type TipDetailResponse = {
  ok?: boolean;
  accountType?: AccountType;
  item?: TipsterTip;
  error?: string;
};

type TipStatusPatchResponse = {
  ok?: boolean;
  id?: string;
  status?: TipLifecycleStatus;
  error?: string;
};

type TipDeleteResponse = {
  ok?: boolean;
  id?: string;
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

const normalizeIco = (value: string): string =>
  value.replace(/\D+/g, "").slice(0, 8);

const getAresIcoFromField = (field: TipField): string | null => {
  const normalizedLabel = normalize(field.label);
  if (!normalizedLabel.includes("ico")) return null;

  const ico = normalizeIco(field.value);
  return ico.length === 8 ? ico : null;
};

const normalizeTipStatus = (value: unknown): TipLifecycleStatus => {
  if (value === "failed") return "failed";
  if (value === "paid" || value === "contracted") return "contracted";
  return "pending";
};

const tipStatusMeta = (status: TipLifecycleStatus) =>
  TIP_STATUS_OPTIONS.find((option) => option.key === status) ?? TIP_STATUS_OPTIONS[0]!;

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

const formatMoney = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Neuvedeno";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Velikost neuvedena";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const secondaryActionButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 text-sm font-bold text-violet-800 shadow-[0_8px_18px_rgba(124,58,237,0.08)] transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

const dangerActionButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 shadow-[0_8px_18px_rgba(190,18,60,0.08)] transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";

const isImageAttachment = (attachment: TipAttachment): boolean => {
  const contentType = attachment.contentType.toLowerCase();
  if (contentType.startsWith("image/")) return true;
  return /\.(avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(attachment.url);
};

const productIconKind = (product: string): "vehicle" | "business" | "property" | "other" => {
  const normalized = normalize(product);
  if (normalized.includes("vehicle") || normalized.includes("vozidel")) return "vehicle";
  if (normalized.includes("business") || normalized.includes("podnikatel")) return "business";
  if (normalized.includes("property") || normalized.includes("majetek")) return "property";
  return "other";
};

function ProductIcon({ product, className = "h-4 w-4" }: { product: string; className?: string }) {
  const productKind = productIconKind(product);
  if (productKind === "vehicle") return <Car className={className} />;
  if (productKind === "business") return <Building2 className={className} />;
  if (productKind === "property") return <Home className={className} />;
  return <Package className={className} />;
}

function StatusIcon({
  status,
  className = "h-4 w-4",
}: {
  status: TipLifecycleStatus;
  className?: string;
}) {
  if (status === "failed") return <CircleX className={className} />;
  if (status === "contracted") return <CircleDollarSign className={className} />;
  return <Clock className={className} />;
}

function StatusPicker({
  status,
  saving,
  onChange,
}: {
  status: TipLifecycleStatus;
  saving: boolean;
  onChange: (status: TipLifecycleStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = tipStatusMeta(status);

  return (
    <div
      className="relative min-w-[190px] flex-1 sm:flex-none"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={saving}
        className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-full border border-violet-500 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] px-4 text-sm font-bold !text-white shadow-[0_10px_20px_rgba(124,58,237,0.26)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(124,58,237,0.32)] focus:border-violet-200 focus:ring-2 focus:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex min-w-0 items-center gap-2 !text-white">
          <StatusIcon status={status} className="h-4 w-4 shrink-0 !text-white" />
          <span className="truncate !text-white">{current.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 !text-white transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 z-40 mt-2 w-full min-w-[220px] overflow-hidden rounded-2xl border border-violet-100 bg-white p-1.5 shadow-[0_18px_38px_rgba(88,28,135,0.18)]"
        >
          {TIP_STATUS_OPTIONS.map((option) => {
            const active = option.key === status;
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setOpen(false);
                  if (!active) onChange(option.key);
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                  active
                    ? "bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_100%)] text-white"
                    : "text-slate-800 hover:bg-violet-50 hover:text-violet-800"
                }`}
              >
                <StatusIcon status={option.key} className="h-4 w-4 shrink-0" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FieldIcon({ label }: { label: string }) {
  const normalized = normalize(label);
  if (normalized.includes("telefon")) return <Phone className="h-4 w-4" />;
  if (normalized.includes("mail")) return <Mail className="h-4 w-4" />;
  if (normalized.includes("rodne") || normalized.includes("ico")) return <IdCard className="h-4 w-4" />;
  if (normalized.includes("cas") || normalized.includes("datum")) return <Clock className="h-4 w-4" />;
  if (normalized.includes("najed") || normalized.includes("najezd")) return <Gauge className="h-4 w-4" />;
  if (normalized.includes("spz") || normalized.includes("technick")) {
    return <Car className="h-4 w-4" />;
  }
  if (normalized.includes("adresa")) return <Home className="h-4 w-4" />;
  if (normalized.includes("jmeno") || normalized.includes("klient") || normalized.includes("firma")) {
    return <UserRound className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

function DetailField({
  field,
  onOpenAres,
}: {
  field: TipField;
  onOpenAres: (ico: string) => void;
}) {
  const aresIco = getAresIcoFromField(field);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700">
          <FieldIcon label={field.label} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {field.label}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-base font-semibold text-slate-950">
            {field.value}
          </p>
        </div>
        {aresIco ? (
          <button
            type="button"
            onClick={() => onOpenAres(aresIco)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold uppercase tracking-[0.08em] text-emerald-800 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100"
            title={`Otevřít ARES pro IČO ${aresIco}`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            ARES
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentCard({
  attachment,
  onOpen,
}: {
  attachment: TipAttachment;
  onOpen: (attachment: TipAttachment) => void;
}) {
  const isImage = isImageAttachment(attachment);
  const imageUrl = attachment.url.replace(/"/g, "%22");

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(attachment)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(attachment);
      }}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)]"
    >
      {isImage ? (
        <div
          className="h-44 bg-slate-100 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.18)),url(\"${imageUrl}\")`,
          }}
        />
      ) : (
        <div className="flex h-44 items-center justify-center bg-slate-100 text-slate-500">
          <FileText className="h-12 w-12" />
        </div>
      )}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{attachment.name}</p>
          <p className="mt-1 text-xs text-slate-500">{formatFileSize(attachment.sizeBytes)}</p>
        </div>
        <a
          href={attachment.url}
          download={attachment.name}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white"
          aria-label={`Stáhnout ${attachment.name}`}
        >
          <Download className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

function AttachmentPreviewModal({
  attachment,
  onClose,
}: {
  attachment: TipAttachment;
  onClose: () => void;
}) {
  const isImage = isImageAttachment(attachment);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attachment-preview-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-white shadow-[0_28px_90px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
              Náhled přílohy
            </p>
            <h2 id="attachment-preview-title" className="truncate text-lg font-bold text-slate-950">
              {attachment.name}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={attachment.url}
              download={attachment.name}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 text-sm font-bold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <Download className="h-4 w-4" />
              Stáhnout
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label="Zavřít náhled"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-950">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.url}
              alt={attachment.name}
              className="mx-auto max-h-[78vh] w-full object-contain"
            />
          ) : (
            <iframe
              src={attachment.url}
              title={attachment.name}
              className="h-[78vh] w-full bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AresToolModal({
  ico,
  onClose,
}: {
  ico: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-3 py-4 backdrop-blur-sm sm:px-5"
      role="dialog"
      aria-modal="true"
      aria-label={`ARES detail IČO ${ico}`}
    >
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              Pomůcka ARES
            </p>
            <h2 className="truncate text-lg font-black text-slate-950">
              IČO {ico}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Zavřít ARES"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <iframe
          src={`/pomucky/ares?ico=${encodeURIComponent(ico)}&embed=1`}
          title={`ARES IČO ${ico}`}
          className="min-h-0 flex-1 bg-slate-50"
        />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-4 h-10 w-2/3 animate-pulse rounded-2xl bg-slate-200" />
      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

function TipDetailContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rawId = params?.id;
  const tipId = typeof rawId === "string" ? decodeURIComponent(rawId) : "";

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [tip, setTip] = useState<TipsterTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<TipAttachment | null>(null);
  const [aresModalIco, setAresModalIco] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      setUser(null);
      setAuthReady(true);
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

  const loadTip = useCallback(
    async (currentUser: FirebaseUser, mode: "initial" | "refresh" = "initial") => {
      if (!tipId) {
        setError("Neplatné ID tipu.");
        setLoading(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ id: tipId });
        const payload = await fetchAuthedJsonOrThrow<TipDetailResponse>(
          currentUser,
          `/api/tips/detail?${query.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        if (!payload.item) {
          throw new Error(payload.error || "Tip nebyl nalezen.");
        }
        setTip(payload.item);
        setAccountType(payload.accountType === "tipster" ? "tipster" : "advisor");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detail tipu se nepodařilo načíst.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tipId]
  );

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      setError("Pro zobrazení detailu tipu je potřeba přihlášení.");
      return;
    }
    void loadTip(user);
  }, [authReady, user, loadTip]);

  useEffect(() => {
    if (!aresModalIco) return;

    const previousOverflow = document.body.style.overflow;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAresModalIco(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [aresModalIco]);

  const handleRefresh = () => {
    if (!user) return;
    void loadTip(user, "refresh");
  };

  const handleSetStatus = async (status: TipLifecycleStatus) => {
    const currentUser = auth.currentUser;
    if (!currentUser || accountType !== "advisor" || !tip) return;
    setSavingStatus(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<TipStatusPatchResponse>(
        currentUser,
        "/api/advisor-tips",
        {
          method: "PATCH",
          body: JSON.stringify({ id: tip.id, status }),
        }
      );
      const nextStatus = normalizeTipStatus(payload.status ?? status);
      setTip((previous) => (previous ? { ...previous, status: nextStatus } : previous));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stav tipu se nepodařilo uložit.");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDeleteTip = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !tip) return;
    setDeleting(true);
    setError(null);
    try {
      const query = new URLSearchParams({ id: tip.id });
      await fetchAuthedJsonOrThrow<TipDeleteResponse>(
        currentUser,
        `/api/tips/detail?${query.toString()}`,
        {
          method: "DELETE",
        }
      );
      router.push("/tipy");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tip se nepodařilo smazat.");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const tipStatus = normalizeTipStatus(tip?.status);
  const statusMeta = tipStatusMeta(tipStatus);
  const isAdvisorMode = accountType === "advisor";
  const counterpartValue = useMemo(() => {
    if (!tip) return "Neuvedeno";
    return isAdvisorMode
      ? tip.tipsterName || tip.tipsterEmail || "Tipař neuveden"
      : tip.recipientName || tip.recipientEmail || "Příjemce neuveden";
  }, [isAdvisorMode, tip]);
  const linkedContractHref = useMemo(() => {
    const ownerEmail = (tip?.linkedContractOwnerEmail ?? "").trim().toLowerCase();
    const entryId = (tip?.linkedContractEntryId ?? "").trim();
    if (!ownerEmail || !entryId) return null;
    return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}`;
  }, [tip?.linkedContractEntryId, tip?.linkedContractOwnerEmail]);
  const hasLinkedContract = Boolean(linkedContractHref || tip?.linkedContractNumber);
  const linkedContract = tip?.linkedContract ?? null;
  const linkedContractNumber =
    linkedContract?.number || tip?.linkedContractNumber || "";
  const linkedTipPercent =
    typeof linkedContract?.tipsterPercent === "number" &&
    Number.isFinite(linkedContract.tipsterPercent)
      ? linkedContract.tipsterPercent
      : null;
  const showAdvisorLinkedContractData = isAdvisorMode;

  return (
    <div className="w-full bg-slate-50 px-3 py-6 text-slate-900 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        {loading ? (
          <LoadingState />
        ) : error && !tip ? (
          <section className="rounded-[28px] border border-rose-200 bg-white p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
            <Link
              href="/tipy"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na tipy
            </Link>
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          </section>
        ) : tip ? (
          <>
            <section className="relative overflow-visible rounded-[34px] border border-violet-100 bg-[radial-gradient(900px_260px_at_8%_0%,rgba(168,85,247,0.16),transparent_58%),linear-gradient(135deg,#ffffff_0%,#faf7ff_48%,#f4efff_100%)] p-5 shadow-[0_22px_52px_rgba(88,28,135,0.14)] sm:p-7">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#6d28d9_0%,#a855f7_50%,#d8b4fe_100%)]" />
              <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="min-w-0 flex-1">
                  <Link
                    href="/tipy"
                    className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-4 py-2 text-sm font-semibold text-violet-800 shadow-[0_8px_18px_rgba(124,58,237,0.08)] transition hover:border-violet-300 hover:bg-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Zpět na tipy
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-violet-200 bg-white/75 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
                      {isAdvisorMode ? "Přijatý tip" : "Odeslaný tip"}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/75 px-3 py-1 text-xs font-semibold text-violet-800">
                      <ProductIcon product={`${tip.product} ${tip.productLabel}`} className="h-3.5 w-3.5" />
                      {tip.productLabel}
                    </span>
                  </div>
                  <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                    {tip.title || `Nový tip - ${tip.productLabel}`}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                    Tip od <span className="font-bold text-slate-950">{counterpartValue}</span> •
                    vytvořeno {formatDateTime(tip.createdAtMs)}
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap 2xl:w-auto 2xl:max-w-[520px] 2xl:justify-end">
                  {isAdvisorMode ? (
                    <StatusPicker
                      status={tipStatus}
                      saving={savingStatus}
                      onChange={(nextStatus) => void handleSetStatus(nextStatus)}
                    />
                  ) : (
                    <div className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-violet-500 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] px-4 text-sm font-bold text-white shadow-[0_10px_20px_rgba(124,58,237,0.26)]">
                      <StatusIcon status={tipStatus} className="h-4 w-4 text-white" />
                      {statusMeta.label}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={refreshing || !user}
                    className={secondaryActionButtonClass}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Obnovit
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting}
                    className={dangerActionButtonClass}
                  >
                    <Trash2 className="h-4 w-4" />
                    Smazat tip
                  </button>
                </div>
              </div>
            </section>

            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {hasLinkedContract && (
              <section className="rounded-[28px] border border-fuchsia-200 bg-[linear-gradient(160deg,#fff7ff_0%,#f6f3ff_100%)] p-5 shadow-[0_16px_38px_rgba(147,51,234,0.12)]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-200 bg-white/80 text-fuchsia-700">
                      <Tag className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-700">
                        Smlouva z TIPU
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-fuchsia-950">
                        Tip je napojený na smlouvu
                        {linkedContractNumber ? ` ${linkedContractNumber}` : ""}.
                      </h2>
                      <p className="mt-1 text-sm text-slate-700">
                        Tipař má nárok pouze na podíl z okamžité provize v 1. roce.
                      </p>
                      <div
                        className={`mt-4 grid gap-2 ${
                          showAdvisorLinkedContractData ? "sm:grid-cols-3" : "sm:grid-cols-2"
                        }`}
                      >
                        <div className="rounded-2xl border border-fuchsia-200 bg-white/75 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-700">
                            Podíl tipaře
                          </p>
                          <p className="mt-1 text-lg font-black text-fuchsia-950">
                            {linkedTipPercent != null ? `${linkedTipPercent} %` : "Neuvedeno"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-fuchsia-200 bg-white/75 px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-700">
                            Provize tipaře
                          </p>
                          <p className="mt-1 text-lg font-black text-fuchsia-950">
                            {formatMoney(linkedContract?.tipsterAmountFirstYear)}
                          </p>
                        </div>
                        {showAdvisorLinkedContractData && (
                          <div className="rounded-2xl border border-fuchsia-200 bg-white/75 px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-700">
                              Okamžitá provize
                            </p>
                            <p className="mt-1 text-lg font-black text-slate-950">
                              {formatMoney(linkedContract?.immediateGrossFirstYear)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {showAdvisorLinkedContractData && linkedContractHref && (
                    <Link
                      href={linkedContractHref}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#d946ef_0%,#9d22c9_100%)] px-4 py-2 text-sm font-bold text-white shadow-[0_10px_24px_rgba(217,70,239,0.25)] transition hover:-translate-y-0.5"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      Otevřít smlouvu
                    </Link>
                  )}
                </div>
              </section>
            )}

            <main className="space-y-5">
              <section className="rounded-[30px] border border-slate-200 bg-slate-50 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Formulář
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">Údaje k tipu</h2>
                </div>

                {tip.fields.length > 0 ? (
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {tip.fields.map((field, index) => (
                      <DetailField
                        key={`${field.label}-${index}`}
                        field={field}
                        onOpenAres={setAresModalIco}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                    Tip nemá uložené žádné položky formuláře.
                  </div>
                )}
              </section>

              <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Přílohy
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-950">
                      Technický průkaz a soubory
                    </h2>
                  </div>
                </div>

                {tip.attachments.length > 0 ? (
                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {tip.attachments.map((attachment) => (
                      <AttachmentCard
                        key={attachment.id}
                        attachment={attachment}
                        onOpen={setPreviewAttachment}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    K tipu nejsou přiložené žádné soubory.
                  </div>
                )}
              </section>
            </main>

            {previewAttachment ? (
              <AttachmentPreviewModal
                attachment={previewAttachment}
                onClose={() => setPreviewAttachment(null)}
              />
            ) : null}

            {aresModalIco ? (
              <AresToolModal
                ico={aresModalIco}
                onClose={() => setAresModalIco(null)}
              />
            ) : null}

            {showDeleteConfirm ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-tip-title"
              >
                <div className="w-full max-w-lg rounded-[28px] border border-rose-200 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
                  <div className="flex items-start gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700">
                      <AlertTriangle className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="delete-tip-title" className="text-2xl font-bold text-slate-950">
                        Smazat tip?
                      </h2>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        Tuhle akci nejde vrátit zpět. Tip se odstraní z tvého přehledu tipů.
                      </p>
                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Tip
                        </p>
                        <p className="mt-1 truncate text-base font-semibold text-slate-950">
                          {tip.title || tip.productLabel}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTip()}
                      disabled={deleting}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-700 bg-rose-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(190,18,60,0.22)] transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleting ? "Mažu…" : "Smazat tip"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function TipDetailPage() {
  return (
    <AppLayout active="tips">
      <TipDetailContent />
    </AppLayout>
  );
}

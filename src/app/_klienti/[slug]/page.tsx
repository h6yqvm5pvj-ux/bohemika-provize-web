// src/app/klienti/[slug]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import type { User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  History,
  LayoutGrid,
  Archive,
  CalendarDays,
  ChevronDown,
  FileText,
  Home,
  IdCard,
  MapPin,
  LoaderCircle,
  LockKeyhole,
  X,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  PRODUCT_CATALOG,
  productInstitutionLabel,
  productInstitutionLogo,
} from "@/app/lib/productCatalog";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
  institutionLogoKeyFromInsurerName,
  institutionLogoKeyFromPath,
  type InstitutionLogoKey,
} from "@/app/lib/institutionLogoDisplay";
import type { Product } from "@/app/types/domain";
import { ClientSession } from "../ClientSession";
import { contractReturnHrefFromClientCard } from "../clientAccess";
import { ClientDetailLoader } from "../ClientDetailLoader";
import { ClientNotesSection } from "../ClientNotesSection";
import { ClientProfileHeader } from "../ClientProfileHeader";
import styles from "../clientCard.module.css";
import { ClientLinkIndicator } from "../ClientLinkIndicator";
import { clientScopeQuery, readClientScope, selectClientContracts, type ClientScopeSelection } from "../clientScope";
import { buildClientDirectory } from "../clientDirectory";
import { isClientCardSlug } from "../clientIdentity";
import { loadClientContracts } from "../loadClientContracts";
import { loadSharedClientContracts } from "../loadSharedClientContracts";
import type { SharedClientContractsResponse, SharedContractSummary } from "../sharedClientContracts";
import {
  createEmptyClientCard,
  MAX_CLIENT_IDENTITY_DOCUMENTS,
  type ClientCardDraft,
  type ClientCardResponse,
  type ClientIdentityDocument,
  type IdentityDocumentType,
} from "../clientCardData";
import {
  clientContractProductLabel,
  clientContractStatusLabel,
  collectAddressSuggestions,
  contractDetailHref,
  formatDate,
  parseBirthNumberDate,
  splitClientContracts,
  contractConcludingAdviserEmail,
  uniqueContracts,
  type ClientAdviser,
  type ClientContractItem,
} from "../clientCardHelpers";

type CuzkSuggestion = {
  adresa?: string | null;
  text?: string | null;
  label?: string | null;
};

type ClientIdentityDocumentField = Exclude<keyof ClientIdentityDocument, "id">;

const IDENTITY_DOCUMENT_TYPES: {
  value: IdentityDocumentType;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: "identity-card",
    label: "Občanský průkaz",
    icon: <IdCard className="h-5 w-5" />,
  },
  {
    value: "passport",
    label: "Cestovní pas",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    value: "permanent-residence",
    label: "Povolení k trvalému pobytu",
    icon: <Home className="h-5 w-5" />,
  },
  {
    value: "long-term-residence",
    label: "Povolení k dlouhodobému pobytu",
    icon: <CalendarDays className="h-5 w-5" />,
  },
  {
    value: "temporary-residence-confirmation",
    label: "Potvrzení o přechodném pobytu",
    icon: <FileText className="h-5 w-5" />,
  },
];

const DEFAULT_IDENTITY_DOCUMENT_TYPE = IDENTITY_DOCUMENT_TYPES[0]!;

function createIdentityDocument(): ClientIdentityDocument {
  return {
    id: `doklad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "identity-card",
    validFrom: "",
    validTo: "",
    number: "",
    issuedBy: "",
  };
}

function identityDocumentTypeMeta(type: IdentityDocumentType) {
  return (
    IDENTITY_DOCUMENT_TYPES.find((item) => item.value === type) ??
    DEFAULT_IDENTITY_DOCUMENT_TYPE
  );
}

function parseLocalIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatCzechDayCount(days: number): string {
  if (days === 1) return "1 den";
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dní`;
}

function identityDocumentExpiryWarning(validTo: string): {
  tone: "warning" | "expired";
  title: string;
  description: string;
} | null {
  const expiryDate = parseLocalIsoDate(validTo);
  if (!expiryDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysLeft < 0) {
    return {
      tone: "expired",
      title: "Doklad je po platnosti",
      description: `Platnost skončila ${formatDate(expiryDate)}.`,
    };
  }

  if (daysLeft <= 10) {
    return {
      tone: "warning",
      title: daysLeft === 0 ? "Platnost dokladu končí dnes" : "Blíží se konec platnosti",
      description:
        daysLeft === 0
          ? `Doklad je platný pouze do dnešního dne (${formatDate(expiryDate)}).`
          : `Doklad končí za ${formatCzechDayCount(daysLeft)} (${formatDate(expiryDate)}).`,
    };
  }

  return null;
}

function normalizeSuggestion(value: CuzkSuggestion | string): string {
  if (typeof value === "string") return value.trim();
  return String(value.adresa ?? value.text ?? value.label ?? "").trim();
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  helper?: string;
  disabled?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
      </span>
      <input
        type={type}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? "Nevyplněno" : placeholder}
        disabled={disabled}
        className={styles.fieldInput}
      />
      {helper ? <span className={styles.fieldHelp}>{helper}</span> : null}
    </label>
  );
}

function AddressField({
  label,
  value,
  onChange,
  localSuggestions,
  user,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  localSuggestions: string[];
  user: FirebaseUser | null;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (disabled || !focused || !user || query.length < 3) {
      setRemoteSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setRemoteSuggestions([]);
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ action: "suggest", q: query });
        const payload = (await fetchAuthedJsonOrThrow(
          user,
          `/api/cuzk/search?${params.toString()}`,
          { signal: controller.signal },
        )) as { suggestions?: Array<CuzkSuggestion | string> };
        if (controller.signal.aborted) return;
        const next = (payload.suggestions ?? [])
          .map(normalizeSuggestion)
          .filter(Boolean)
          .slice(0, 6);
        setRemoteSuggestions(next);
      } catch {
        if (!controller.signal.aborted) setRemoteSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [disabled, focused, user, value]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    [...localSuggestions, ...remoteSuggestions].forEach((item) => {
      const normalized = item.trim();
      if (normalized) seen.add(normalized);
    });
    return Array.from(seen).slice(0, 8);
  }, [localSuggestions, remoteSuggestions]);

  return (
    <div className="relative space-y-1">
      <span className={styles.fieldLabel}>
        {label}
      </span>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
        <input
          type="text"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (!disabled) setFocused(true);
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          aria-label={label}
          aria-busy={loading}
          placeholder={disabled ? "Nevyplněno" : "Začni psát adresu..."}
          disabled={disabled}
          className={styles.fieldInput} style={{ paddingLeft: 38, paddingRight: 40 }}
        />
        {loading && !disabled && <LoaderCircle aria-hidden="true" className="absolute right-4 top-4 h-4 w-4 animate-spin text-violet-600 motion-reduce:animate-none" />}
      </div>
      <span role="status" className={styles.fieldHelp}>
        {!disabled && (loading ? "Našeptávám adresu…" : "Vyber adresu z nabídky.")}
      </span>
      {!disabled && focused && suggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.16)]">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(suggestion);
                setFocused(false);
              }}
              className="block w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm font-semibold text-slate-800 transition last:border-b-0 hover:bg-slate-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IdentityDocumentsSection({
  documents,
  editable,
  onAdd,
  onRemove,
  onUpdate,
}: {
  documents: ClientIdentityDocument[];
  editable: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (
    id: string,
    field: ClientIdentityDocumentField,
    value: string
  ) => void;
}) {
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(
    () => new Set()
  );
  const knownDocumentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nextKnownIds = new Set(documents.map((document) => document.id));
    const addedIds = documents
      .map((document) => document.id)
      .filter((id) => !knownDocumentIdsRef.current.has(id));

    knownDocumentIdsRef.current = nextKnownIds;
    setExpandedDocumentIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (nextKnownIds.has(id)) next.add(id);
      });
      if (editable) {
        addedIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [documents, editable]);

  const toggleDocument = (id: string) => {
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className="flex items-center gap-3">
          <span className={styles.sectionIcon}>
            <IdCard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Doklady</h2>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              Eviduj nejvýše {MAX_CLIENT_IDENTITY_DOCUMENTS} identifikačních dokladů klienta.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!editable || documents.length >= MAX_CLIENT_IDENTITY_DOCUMENTS}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition ${
            editable && documents.length < MAX_CLIENT_IDENTITY_DOCUMENTS
              ? "bg-violet-600 text-white shadow-[0_10px_22px_rgba(124,58,237,0.2)] hover:bg-violet-700"
              : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          <Plus className="h-4 w-4" />
          Přidat doklad
        </button>
      </div>

      {documents.length > 0 ? (
        <div className={styles.documentList}>
          {documents.map((document, index) => {
            const meta = identityDocumentTypeMeta(document.type);
            const expiryWarning = identityDocumentExpiryWarning(document.validTo);
            const isExpanded = expandedDocumentIds.has(document.id);
            return (
              <div
                key={document.id}
                className={styles.document} data-warning={expiryWarning?.tone}
              >
                <div
                  className={`flex flex-col gap-3 bg-white px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    isExpanded ? "border-b border-slate-100" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleDocument(document.id)}
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl text-left transition hover:bg-slate-50 sm:pr-2"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                        {meta.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-bold text-slate-950">
                            {meta.label}
                          </span>
                          {expiryWarning ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                expiryWarning.tone === "expired"
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                              }`}
                            >
                              {expiryWarning.tone === "expired"
                                ? "Po platnosti"
                                : "Končí platnost"}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                          Doklad #{index + 1}
                          {document.number.trim()
                            ? ` · ${document.number.trim()}`
                            : ""}
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">
                      {isExpanded ? "Sbalit" : "Detail"}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(document.id)}
                    disabled={!editable}
                    className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      editable
                        ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Odebrat
                  </button>
                </div>

                {isExpanded ? (
                  <>
                    {expiryWarning ? (
                      <div
                        className={`mx-3 mt-3 flex gap-2.5 rounded-2xl border px-3 py-2.5 ${
                          expiryWarning.tone === "expired"
                            ? "border-rose-200 bg-rose-50 text-rose-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}
                      >
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                          <div className="text-sm font-bold">{expiryWarning.title}</div>
                          <div className="mt-0.5 text-sm font-medium">
                            {expiryWarning.description}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 p-3.5 md:grid-cols-2 xl:grid-cols-3">
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          Typ dokladu
                        </span>
                        <select
                          value={document.type}
                          disabled={!editable}
                          onChange={(event) =>
                            onUpdate(
                              document.id,
                              "type",
                              event.target.value as IdentityDocumentType
                            )
                          }
                          className={`h-12 w-full rounded-2xl border px-3.5 text-sm font-semibold outline-none transition sm:text-base ${
                            editable
                              ? "border-slate-200 bg-white text-slate-950 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                              : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >
                          {IDENTITY_DOCUMENT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <Field
                        label="Platnost od"
                        type="date"
                        value={document.validFrom}
                        onChange={(value) => onUpdate(document.id, "validFrom", value)}
                        disabled={!editable}
                      />
                      <Field
                        label="Platnost do"
                        type="date"
                        value={document.validTo}
                        onChange={(value) => onUpdate(document.id, "validTo", value)}
                        disabled={!editable}
                      />
                      <Field
                        label="Číslo dokladu"
                        value={document.number}
                        onChange={(value) => onUpdate(document.id, "number", value)}
                        placeholder="Např. 123456789 nebo AB123456"
                        disabled={!editable}
                      />
                      <div className="xl:col-span-2">
                        <Field
                          label="Kdo doklad vydal"
                          value={document.issuedBy}
                          onChange={(value) => onUpdate(document.id, "issuedBy", value)}
                          placeholder="Např. Magistrát města / MVČR"
                          disabled={!editable}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <button
            type="button"
            onClick={onAdd}
            disabled={!editable}
            className={`flex w-full flex-col items-center justify-center rounded-[20px] border border-dashed px-5 py-6 text-center transition ${
              editable
                ? "border-slate-300 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/40"
                : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                editable ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              <Plus className="h-5 w-5" />
            </span>
            <span
              className={`mt-3 text-base font-bold ${
                editable ? "text-slate-950" : "text-slate-400"
              }`}
            >
              Přidat první doklad
            </span>
            <span
              className={`mt-1 text-sm font-medium ${
                editable ? "text-slate-500" : "text-slate-400"
              }`}
            >
              Občanský průkaz, pas nebo pobytový doklad.
            </span>
          </button>
        </div>
      )}
    </section>
  );
}

const FALLBACK_LOGOS: Partial<Record<InstitutionLogoKey, { src: string; alt: string }>> = {
  cpp: { src: "/icons/cpp.png", alt: "ČPP" },
  kooperativa: { src: "/icons/koop-v2.png", alt: "Kooperativa" },
  maxima: { src: "/icons/maxima.png", alt: "Maxima" },
  allianz: { src: "/icons/allianz.png", alt: "Allianz" },
  slavia: { src: "/icons/slavialogo.png", alt: "Slavia" },
  uniqa: { src: "/icons/uniqa.png", alt: "UNIQA" },
  csob: { src: "/icons/csb.png", alt: "ČSOB" },
  pillow: { src: "/icons/pillow.png", alt: "Pillow" },
  axa: { src: "/icons/axalogo.png", alt: "AXA" },
  comfort: { src: "/icons/cclogo.png", alt: "Comfort Commodity" },
};

function asProductKey(value: ClientContractItem["productKey"]): Product | null {
  if (typeof value !== "string") return null;
  return value in PRODUCT_CATALOG ? (value as Product) : null;
}

function contractLogo(contract: ClientContractItem): {
  src: string;
  alt: string;
  logoKey: InstitutionLogoKey;
} {
  const productKey = asProductKey(contract.productKey);
  const productLogo = productInstitutionLogo(productKey, null);
  const productLabel = clientContractProductLabel(contract);

  if (productLogo) {
    return {
      src: productLogo,
      alt: productInstitutionLabel(productKey, productLabel) ?? productLabel,
      logoKey: institutionLogoKeyFromPath(productLogo),
    };
  }

  const guessedLogoKey = institutionLogoKeyFromInsurerName(productLabel);
  const guessedLogo = FALLBACK_LOGOS[guessedLogoKey];
  if (guessedLogo) {
    return {
      ...guessedLogo,
      logoKey: guessedLogoKey,
    };
  }

  return {
    src: "/icons/produkt.png",
    alt: productLabel,
    logoKey: "unknown",
  };
}

function adviserNameFromEmail(email: string): string {
  if (!email) return "Neuvedeno";
  const beforeAt = email.split("@")[0] ?? "";
  const parts = beforeAt.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) => part.charAt(0).toLocaleUpperCase("cs-CZ") + part.slice(1).toLocaleLowerCase("cs-CZ"))
    .join(" ");
}

function ContractCard({ contract }: { contract: ClientContractItem }) {
  const [expanded, setExpanded] = useState(false);
  const logo = contractLogo(contract);
  const signerEmail = contractConcludingAdviserEmail(contract);
  const adviser = contract.originalAdviserName ||
    (signerEmail === (contract.adviserEmail || contract.userEmail) ? contract.adviserName : null) ||
    adviserNameFromEmail(signerEmail);
  const title = clientContractProductLabel(contract);
  const status = clientContractStatusLabel(contract);

  return <article className={styles.contract}>
    <div className={styles.contractTop}>
      <span className={styles.contractLogo}>
        <span className={`relative block ${institutionLogoFrameClass(logo.logoKey, "compact")}`}>
          <Image src={logo.src} alt={`${logo.alt} logo`} fill sizes="48px" className={institutionLogoImageClass(logo.logoKey)} />
        </span>
      </span>
      <div className={styles.contractInfo}>
        <div className={styles.contractHeading}>
          <Link href={contractDetailHref(contract)} className={styles.contractTitle}>{title}</Link>
          <span className={styles.status} data-archived={status !== "Aktivní"}>{status}</span>
        </div>
        <span className={styles.contractNumber}>č. {contract.contractNumber?.trim() || "Neuvedeno"}</span>
        <div className={styles.contractMeta}>
          <span><CalendarDays size={12} aria-hidden="true" />Počátek {formatDate(contract.policyStartDate)}</span>
          <span><UserRound size={12} aria-hidden="true" />{adviser}</span>
        </div>
      </div>
      <div className={styles.contractActions}>
        <Link href={contractDetailHref(contract)} className={styles.iconButton} title="Otevřít smlouvu" aria-label={`Otevřít smlouvu ${title} ${contract.contractNumber || ""}`}><ArrowUpRight size={17} aria-hidden="true" /></Link>
        <button type="button" onClick={() => setExpanded(value => !value)} className={styles.iconButton}
          title={expanded ? "Skrýt podrobnosti" : "Rychlý náhled"} aria-label={`${expanded ? "Skrýt podrobnosti" : "Rychlý náhled"}: ${title}`} aria-expanded={expanded}>
          <ChevronDown size={15} className={expanded ? "rotate-180" : ""} aria-hidden="true" />
        </button>
      </div>
    </div>
    {expanded && <div className={styles.contractDetails}>
      <strong>{contract.clientName}</strong>
      <div className="mt-1 flex flex-wrap gap-x-3 break-words">
        {contract.clientPhone && <span>{contract.clientPhone}</span>}
        {contract.clientEmail && <span>{contract.clientEmail}</span>}
        {contract.clientAddress && <span>{contract.clientAddress}</span>}
      </div>
      <dl>
        <div><dt>Sjednal</dt><dd>{adviser}<br />{signerEmail || "E-mail není dostupný"}</dd></div>
        <div><dt>Datum sjednání</dt><dd>{formatDate(contract.contractSignedDate)}</dd></div>
      </dl>
      <Link href={contractDetailHref(contract)} className={styles.button}>Zobrazit smlouvu<ClientLinkIndicator kind="open" /></Link>
    </div>}
  </article>;
}

function RestrictedContractCard({ summary }: { summary: SharedContractSummary }) {
  const logo = contractLogo({ id: "", productKey: summary.productKey });
  return <article aria-label="Smlouva jiného poradce" className={styles.restricted}>
    <span className={styles.contractLogo}>
      <span className={`relative block ${institutionLogoFrameClass(logo.logoKey, "compact")}`}><Image src={logo.src} alt={`${logo.alt} logo`} fill sizes="48px" className={institutionLogoImageClass(logo.logoKey)} /></span>
    </span>
    <div className="min-w-0 flex-1">
      <h3>{clientContractProductLabel({ id: "", productKey: summary.productKey })}</h3>
      <p>Sjednal <strong className="font-medium">{summary.adviserName}</strong></p>
      <span className={styles.restrictedBadge}><LockKeyhole size={11} aria-hidden="true" />Pouze přehled</span>
    </div>
  </article>;
}

function ContractList({ title, icon, contracts, emptyText }: {
  title: string; icon: ReactNode; contracts: ClientContractItem[]; emptyText: string;
}) {
  return <section className={styles.panel}>
    <div className={styles.panelHeader}>
      <div className={styles.sectionTitle}>
        <span className={styles.sectionIcon} data-tone={title === "Aktivní smlouvy" ? "green" : undefined}>{icon}</span>
        <div><h2>{title}</h2><p>Přehled sjednaných produktů</p></div>
      </div>
      <span className={styles.count}>{contracts.length}</span>
    </div>
    {contracts.length ? <div className={styles.contractList}>
      {contracts.map(contract => <ContractCard key={`${contract.adviserEmail ?? contract.userEmail ?? "owner"}-${contract.id}`} contract={contract} />)}
    </div> : <div className={styles.empty}>{emptyText}</div>}
  </section>;
}

export default function ClientCardPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const searchParams = useSearchParams();
  const linkedNoteId = searchParams.get("noteId") ?? "";
  const selection = searchParams.has("scope") ? readClientScope(searchParams) : null;
  const query = selection ? clientScopeQuery(selection) : "";
  const returnContractHref = contractReturnHrefFromClientCard(searchParams);
  return <ClientSession>{(user) => <ClientCardEditor key={`${user.uid}:${slug}:${query}:${linkedNoteId}`} user={user} slug={slug} query={query} returnContractHref={returnContractHref} />}</ClientSession>;
}

function ClientCardEditor({ user, slug, query, returnContractHref }: { user: FirebaseUser; slug: string; query: string; returnContractHref: string | null }) {
  const selection = useMemo<ClientScopeSelection | null>(() => query ? readClientScope(new URLSearchParams(query)) : null, [query]);
  const backHref = query ? `/klienti?${query}` : "/klienti";
  const [loadedContracts, setLoadedContracts] = useState(0);
  const [contracts, setContracts] = useState<ClientContractItem[]>([]);
  const [sharedContracts, setSharedContracts] = useState<SharedClientContractsResponse | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState(false);
  const [sharedReload, setSharedReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cardLoaded, setCardLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [tab, setTab] = useState<"overview" | "details">("overview");
  const [notFound, setNotFound] = useState(!isClientCardSlug(slug));
  const savedCard = useRef<ClientCardDraft | null>(null);
  const [birthNumber, setBirthNumber] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [permanentAddress, setPermanentAddress] = useState("");
  const [correspondenceAddress, setCorrespondenceAddress] = useState("");
  const [occupation, setOccupation] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [showArchivedContracts, setShowArchivedContracts] = useState(false);
  const [identityDocuments, setIdentityDocuments] = useState<ClientIdentityDocument[]>([]);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    tone: "success" | "error";
    message: string;
    conflict?: boolean;
  } | null>(null);

  const applyCard = useCallback((card: ClientCardDraft) => {
    setClientName(card.clientName);
    setBirthNumber(card.birthNumber);
    setCompanyId(card.companyId ?? "");
    setBirthDate(card.birthDate);
    setPhone(card.phone);
    setEmail(card.email);
    setPermanentAddress(card.permanentAddress);
    setCorrespondenceAddress(card.correspondenceAddress);
    setOccupation(card.occupation);
    setEmployerName(card.employerName);
    setPartnerName(card.partnerName);
    setIdentityDocuments(card.identityDocuments);
  }, []);

  useEffect(() => {
    if (!isClientCardSlug(slug)) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setLoadedContracts(0);
      setCardLoaded(false);
      setError(null);
      let teamAdvisers: ClientAdviser[] = [];
      const [cardResult, contractsResult] = await Promise.allSettled([
        fetchAuthedJsonOrThrow<ClientCardResponse>(user, `/api/client-cards/${encodeURIComponent(slug)}`, { signal: controller.signal }),
        loadClientContracts(user, controller.signal, setLoadedContracts, (advisers) => { teamAdvisers = advisers; }, { slug, selection }),
      ]);
      if (controller.signal.aborted) return;
      const portfolio = contractsResult.status === "fulfilled" ? contractsResult.value : [];
      const scoped = selection ? selectClientContracts(portfolio, user.email ?? "", selection, teamAdvisers) : portfolio;
      const client = buildClientDirectory(scoped).find((item) => item.slug === slug);
      setContracts(client?.contracts ?? []);
      if (cardResult.status === "fulfilled" && contractsResult.status === "fulfilled") {
        const payload = cardResult.value;
        if (!client && !payload.card) {
          setNotFound(true);
        } else {
          const initialCard = payload.card ?? {
            ...createEmptyClientCard(client!.name),
            permanentAddress: client!.address,
            phone: client!.phone,
            email: client!.email,
          };
          savedCard.current = initialCard;
          applyCard(initialCard);
          setRevision(payload.revision);
          setCardLoaded(true);
        }
      } else {
        setError("Klientskou kartu a smlouvy se nepodařilo načíst. Zkus to prosím znovu.");
      }
      setLoading(false);
    };
    void load();
    return () => controller.abort();
  }, [slug, user, applyCard, reloadVersion, selection]);

  useEffect(() => {
    setSharedContracts(null);
    setSharedError(false);
    if (!cardLoaded || !contracts.length) { setSharedLoading(false); return; }
    const controller = new AbortController();
    setSharedLoading(true);
    void loadSharedClientContracts(user, slug, query, controller.signal, setSharedContracts)
      .catch(() => { if (!controller.signal.aborted) { setSharedContracts(null); setSharedError(true); } })
      .finally(() => { if (!controller.signal.aborted) setSharedLoading(false); });
    return () => controller.abort();
  }, [user, slug, query, cardLoaded, contracts, reloadVersion, sharedReload]);

  useEffect(() => {
    if (!isEditingClient) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [isEditingClient]);

  const directoryClient = useMemo(() => buildClientDirectory(contracts)[0], [contracts]);
  const addressSuggestions = useMemo(() => collectAddressSuggestions(contracts), [contracts]);
  const accessibleContracts = useMemo(() => uniqueContracts([...contracts, ...(sharedContracts?.contracts ?? [])]), [contracts, sharedContracts]);
  const splitContracts = useMemo(() => splitClientContracts(accessibleContracts), [accessibleContracts]);
  const totalContracts = accessibleContracts.length + (sharedContracts?.summaries.length ?? 0);
  const canEditFields = cardLoaded && !loading && isEditingClient && !saving;

  const handleBirthNumberChange = (value: string) => {
    if (!canEditFields) return;
    setBirthNumber(value);
    const parsed = parseBirthNumberDate(value);
    if (parsed) setBirthDate(parsed);
  };

  const handleAddIdentityDocument = () => {
    if (!canEditFields || identityDocuments.length >= MAX_CLIENT_IDENTITY_DOCUMENTS) return;
    setIdentityDocuments((current) => [...current, createIdentityDocument()]);
  };

  const handleUpdateIdentityDocument = (
    id: string,
    field: ClientIdentityDocumentField,
    value: string
  ) => {
    if (!canEditFields) return;
    setIdentityDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, [field]: value } : document
      )
    );
  };

  const handleRemoveIdentityDocument = (id: string) => {
    if (!canEditFields) return;
    setIdentityDocuments((current) =>
      current.filter((document) => document.id !== id)
    );
  };

  const handleEditToggle = async () => {
    if (!cardLoaded || saving) return;
    if (!isEditingClient) {
      setSaveStatus(null);
      setIsEditingClient(true);
      setTab("details");
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      const card: ClientCardDraft = {
        clientName,
        birthNumber,
        companyId,
        birthDate,
        phone,
        email,
        permanentAddress,
        correspondenceAddress,
        occupation,
        employerName,
        partnerName,
        identityDocuments,
      };
      const saved = await fetchAuthedJsonOrThrow<ClientCardResponse>(
        user,
        `/api/client-cards/${encodeURIComponent(slug)}`,
        { method: "PUT", body: JSON.stringify({ card, expectedRevision: revision }) },
      );
      if (saved.card) { applyCard(saved.card); savedCard.current = saved.card; }
      setRevision(saved.revision);
      setIsEditingClient(false);
      setSaveStatus({ tone: "success", message: "Změny uloženy." });
    } catch (err) {
      setSaveStatus({
        tone: "error",
        message: err instanceof Error ? err.message : "Změny se nepodařilo uložit.",
        conflict: err instanceof Error && "status" in err && err.status === 409,
      });
    } finally {
      setSaving(false);
    }
  };

  if (notFound) {
    return (
      <AppLayout active="clients">
        <div className="w-full bg-white px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 text-center">
            <IdCard className="mx-auto h-8 w-8 text-slate-400" />
            <h1 className="mt-3 text-2xl font-bold text-slate-950">Karta není dostupná</h1>
            <p className="mt-2 text-sm text-slate-600">
              Klienta se nepodařilo najít ve smlouvách ani v uložených kartách.
            </p>
            <Link
              href={returnContractHref ?? backHref}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
            >
              <ClientLinkIndicator kind="back" />
              {returnContractHref ? "Zpět na smlouvu" : "Zpět na klienty"}
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="clients">
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.topbar}>
            <nav aria-label="Drobečková navigace" className={styles.breadcrumb}>
              <Link href={backHref}><ClientLinkIndicator kind="back" />Klienti</Link>
              <ChevronRight size={12} aria-hidden="true" />
              <span>Karta klienta</span>
            </nav>
            {returnContractHref && (
              <Link href={returnContractHref} className={styles.button}>
                <ArrowLeft size={15} aria-hidden="true" />Zpět na smlouvu
              </Link>
            )}
          </div>

          {loading ? <ClientDetailLoader loadedContracts={loadedContracts} /> : <ClientProfileHeader
            name={clientName} phone={phone} email={email} address={permanentAddress}
            total={sharedError ? accessibleContracts.length : totalContracts}
            active={splitContracts.active.length} archived={splitContracts.archived.length}
            totalLoading={sharedLoading} totalIncomplete={sharedError}
            actions={<>
              {isEditingClient && <button type="button" disabled={saving} onClick={() => {
                if (savedCard.current) applyCard(savedCard.current);
                setIsEditingClient(false); setSaveStatus(null);
              }} className={styles.button}><X size={15} aria-hidden="true" />Zrušit</button>}
              <button type="button" onClick={handleEditToggle} disabled={!cardLoaded || saving} aria-busy={saving}
                className={isEditingClient ? styles.primaryButton : styles.button}>
                {saving ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  : isEditingClient ? <Save size={15} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
                {saving ? "Ukládám…" : isEditingClient ? "Uložit změny" : "Upravit údaje"}
              </button>
            </>}
            status={saveStatus ? <div role="status" className={styles.saveMessage} data-error={saveStatus.tone === "error"}>
              {saveStatus.message}
              {saveStatus.conflict && <button type="button" onClick={() => {
                if (!window.confirm("Zahodit neuložené změny v tomto okně a načíst aktuální uloženou kartu?")) return;
                setIsEditingClient(false); setSaveStatus(null); setReloadVersion(current => current + 1);
              }}>Načíst uloženou verzi</button>}
            </div> : saving ? <p role="status" className={styles.saveMessage}>Ukládám změny klientské karty…</p> : undefined}
          />}

          {error ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
              {!loading && !isEditingClient ? (
                <button type="button" onClick={() => setReloadVersion((current) => current + 1)} className="ml-3 underline">
                  Zkusit znovu
                </button>
              ) : null}
            </div>
          ) : null}

          {cardLoaded && <>
          <div className={styles.tabBar}>
          <div role="tablist" aria-label="Obsah klientské karty" className={styles.tabs}>
            {(["overview", "details"] as const).map((value) => <button key={value} type="button" role="tab" id={`client-tab-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls={`client-panel-${value}`} onClick={() => setTab(value)} onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "overview" : event.key === "End" ? "details" : value === "overview" ? "details" : "overview";
              setTab(next);
              document.getElementById(`client-tab-${next}`)?.focus();
            }} className={styles.tab}>
              {value === "overview" ? <LayoutGrid size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}
              {value === "overview" ? "Přehled a smlouvy" : "Osobní údaje"}
            </button>)}
          </div>
          <a href="#client-notes" className={styles.historyLink} onClick={event => {
            event.preventDefault(); setTab("overview");
            requestAnimationFrame(() => document.getElementById("client-notes")?.scrollIntoView({ block: "start" }));
          }}><History size={14} aria-hidden="true" />Historie jednání<ArrowUpRight size={13} aria-hidden="true" /></a>
          </div>

          {directoryClient && (directoryClient.aliases.length > 1 || directoryClient.contactConflicts.length > 0) && <section className={styles.notice} data-tone={directoryClient.contactConflicts.length ? "warning" : "info"}>
            <h2 className="text-sm font-semibold text-slate-900">{directoryClient.contactConflicts.length ? "Ověřit údaje klienta" : "Zápisy jména ve smlouvách"}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{directoryClient.contactConflicts.length ? `Ve smlouvách se liší ${directoryClient.contactConflicts.join(", ")}. Ověř, zda jde o stejnou osobu. Jednotlivé údaje najdeš po rozkliknutí smlouvy.` : "Tyto zápisy se zobrazují ve společné kartě. Původní jména ve smlouvách zůstávají zachována."}</p>
            <div className="mt-3 flex flex-wrap gap-2">{directoryClient.aliases.map((name) => <span key={name} className="max-w-full break-words rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{name}</span>)}</div>
          </section>}

          <div role="tabpanel" id="client-panel-details" aria-labelledby="client-tab-details" hidden={tab !== "details"} className={styles.detailsGrid}>
          <section className={`${styles.panel} ${styles.personalFields}`}>
            <div className={styles.panelHeader}>
              <span className={styles.sectionIcon}>
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Osobní údaje</h2>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  Identita, kontakt, práce a rodinná vazba klienta.
                </p>
              </div>
            </div>

            <div className={styles.fields}>
              <Field
                label="Jméno a příjmení / název firmy"
                value={clientName}
                onChange={setClientName}
                placeholder="Jméno a příjmení"
                disabled={!canEditFields}
              />
              <Field
                label="Rodné číslo"
                value={birthNumber}
                onChange={handleBirthNumberChange}
                placeholder="Např. 850101/1234"
                disabled={!canEditFields}
              />
              <Field
                label="IČO"
                value={companyId}
                onChange={setCompanyId}
                placeholder="Např. 12345678"
                disabled={!canEditFields}
              />
              <Field
                label="Datum narození"
                type="date"
                value={birthDate}
                onChange={setBirthDate}
                disabled={!canEditFields}
              />
              <Field
                label="Telefon"
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+420 ..."
                disabled={!canEditFields}
              />
              <Field
                label="E-mail"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="email@domena.cz"
                disabled={!canEditFields}
              />
              <Field
                label="Povolání"
                value={occupation}
                onChange={setOccupation}
                placeholder="Např. projektový manažer"
                disabled={!canEditFields}
              />
              <Field
                label="Název firmy kde pracuje"
                value={employerName}
                onChange={setEmployerName}
                placeholder="Firma / zaměstnavatel"
                disabled={!canEditFields}
              />
              <Field
                label="Partner/ka"
                value={partnerName}
                onChange={setPartnerName}
                placeholder="Jméno partnera nebo partnerky"
                disabled={!canEditFields}
              />
            </div>
          </section>

          <IdentityDocumentsSection
            documents={identityDocuments}
            editable={canEditFields}
            onAdd={handleAddIdentityDocument}
            onRemove={handleRemoveIdentityDocument}
            onUpdate={handleUpdateIdentityDocument}
          />

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <span className={styles.sectionIcon}>
                <Home className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Adresy</h2>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  Trvalá a korespondenční adresa s našeptávačem.
                </p>
              </div>
            </div>
            <div className={styles.addressFields}>
              <AddressField
                label="Trvalá adresa"
                value={permanentAddress}
                onChange={setPermanentAddress}
                localSuggestions={addressSuggestions}
                user={user}
                disabled={!canEditFields}
              />
              <AddressField
                label="Korespondenční adresa"
                value={correspondenceAddress}
                onChange={setCorrespondenceAddress}
                localSuggestions={addressSuggestions}
                user={user}
                disabled={!canEditFields}
              />
            </div>
          </section>

          </div>
          <div role="tabpanel" id="client-panel-overview" aria-labelledby="client-tab-overview" hidden={tab !== "overview"}>
          <div className={styles.overview}>
          <div className={styles.portfolio}>
            <ContractList
              title="Aktivní smlouvy"
              icon={<FileText className="h-5 w-5 text-emerald-700" />}
              contracts={splitContracts.active}
              emptyText="Klient zatím nemá aktivní smlouvy."
            />

            {(sharedLoading || sharedError || sharedContracts?.matchingAvailable === false || Boolean(sharedContracts?.summaries.length)) && <section aria-label="Další smlouvy klienta" className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><h2 className="text-lg font-bold text-slate-900">Smlouvy dalších poradců</h2><p className="mt-1 text-xs text-slate-500">Přehled produktů sjednaných mimo tvou strukturu.</p></div>
                <LockKeyhole className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              </div>
              {sharedLoading && <p role="status" className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-violet-500 motion-reduce:animate-none" aria-hidden="true" />{sharedContracts?.indexing ? "Propojuji starší smlouvy dalších poradců…" : "Načítám další smlouvy klienta…"}</p>}
              {sharedError && <div role="alert" className="px-5 py-4 text-sm text-slate-600">Další smlouvy se nepodařilo načíst. <button type="button" className="font-semibold text-violet-700 underline" onClick={() => setSharedReload(value => value + 1)}>Zkusit znovu</button></div>}
              {sharedContracts?.matchingAvailable === false && <p className="px-5 py-4 text-sm leading-6 text-slate-500">Pro propojení s dalšími poradci musí být ve smlouvách shodné jméno a telefon nebo e-mail. U těchto smluv kontakt zatím chybí.</p>}
              {Boolean(sharedContracts?.summaries.length) && <div className={styles.contractList}>{sharedContracts!.summaries.map(summary => <RestrictedContractCard key={summary.shareId} summary={summary} />)}</div>}
            </section>}

            <button type="button" onClick={() => setShowArchivedContracts(current => !current)} className={styles.archive} aria-expanded={showArchivedContracts}>
              <span className={styles.sectionIcon}><Archive size={17} aria-hidden="true" /></span>
              <span className={styles.archiveText}><strong>Archivované smlouvy</strong><small>Dožité a stornované smlouvy</small></span>
              <span className={styles.count}>{splitContracts.archived.length}</span>
              <ChevronDown size={15} className={`text-purple-300 ${showArchivedContracts ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>

            {showArchivedContracts ? (
              <ContractList
                title="Archivované smlouvy"
                icon={<Archive className="h-5 w-5 text-slate-600" />}
                contracts={splitContracts.archived}
                emptyText="Dožité a stornované smlouvy se zobrazí tady."
              />
            ) : null}
          </div>
          <aside className={styles.activity} aria-label="Jednání s klientem">
            <ClientNotesSection user={user} slug={slug} clientName={savedCard.current?.clientName || clientName} />
          </aside>
          </div>
          </div>
          </>}

        </div>
      </div>
    </AppLayout>
  );
}

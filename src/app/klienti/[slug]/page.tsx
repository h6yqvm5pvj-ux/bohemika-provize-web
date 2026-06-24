// src/app/klienti/[slug]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  FileText,
  Home,
  IdCard,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase-auth";
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
import {
  TEST_CLIENT_NAME,
  TEST_CLIENT_SLUG,
  isTestClientName,
} from "../clientAccess";
import {
  bestClientAddress,
  bestClientEmail,
  bestClientPhone,
  clientContractProductLabel,
  clientContractStatusLabel,
  collectAddressSuggestions,
  contractDetailHref,
  formatDate,
  parseBirthNumberDate,
  splitClientContracts,
  uniqueContracts,
  type ClientContractItem,
  type ClientContractsResponse,
} from "../clientCardHelpers";

type CuzkSuggestion = {
  adresa?: string | null;
  text?: string | null;
  label?: string | null;
};

type IdentityDocumentType =
  | "identity-card"
  | "passport"
  | "permanent-residence"
  | "long-term-residence"
  | "temporary-residence-confirmation";

type ClientIdentityDocument = {
  id: string;
  type: IdentityDocumentType;
  validFrom: string;
  validTo: string;
  number: string;
  issuedBy: string;
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

type ClientCardDraft = {
  clientName: string;
  birthNumber: string;
  birthDate: string;
  phone: string;
  email: string;
  permanentAddress: string;
  correspondenceAddress: string;
  occupation: string;
  employerName: string;
  partnerName: string;
  identityDocuments: ClientIdentityDocument[];
};

const CLIENT_CARD_STORAGE_VERSION = 1;

function clientCardStorageKey(slug: string): string {
  return `bohemika.client-card.${slug}.v${CLIENT_CARD_STORAGE_VERSION}`;
}

function readStoredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isIdentityDocumentType(value: unknown): value is IdentityDocumentType {
  return IDENTITY_DOCUMENT_TYPES.some((type) => type.value === value);
}

function readStoredIdentityDocuments(value: unknown): ClientIdentityDocument[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const type = isIdentityDocumentType(record.type)
        ? record.type
        : DEFAULT_IDENTITY_DOCUMENT_TYPE.value;

      return {
        id: readStoredString(record.id) || createIdentityDocument().id,
        type,
        validFrom: readStoredString(record.validFrom),
        validTo: readStoredString(record.validTo),
        number: readStoredString(record.number),
        issuedBy: readStoredString(record.issuedBy),
      };
    })
    .filter((item): item is ClientIdentityDocument => item !== null);
}

function readStoredClientCard(slug: string): ClientCardDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(clientCardStorageKey(slug));
    if (!raw) return null;

    const record = JSON.parse(raw) as Record<string, unknown>;
    return {
      clientName: readStoredString(record.clientName),
      birthNumber: readStoredString(record.birthNumber),
      birthDate: readStoredString(record.birthDate),
      phone: readStoredString(record.phone),
      email: readStoredString(record.email),
      permanentAddress: readStoredString(record.permanentAddress),
      correspondenceAddress: readStoredString(record.correspondenceAddress),
      occupation: readStoredString(record.occupation),
      employerName: readStoredString(record.employerName),
      partnerName: readStoredString(record.partnerName),
      identityDocuments: readStoredIdentityDocuments(record.identityDocuments),
    };
  } catch {
    return null;
  }
}

function saveStoredClientCard(slug: string, draft: ClientCardDraft) {
  window.localStorage.setItem(
    clientCardStorageKey(slug),
    JSON.stringify({
      ...draft,
      savedAt: new Date().toISOString(),
    })
  );
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

async function loadMartinContracts(user: FirebaseUser): Promise<ClientContractItem[]> {
  const params = new URLSearchParams({
    scope: "my",
    q: TEST_CLIENT_NAME,
    limit: "50",
  });

  const ownPayload = (await fetchAuthedJsonOrThrow(
    user,
    `/api/contracts/list?${params.toString()}`
  )) as ClientContractsResponse;

  let teamContracts: ClientContractItem[] = [];
  const teamParams = new URLSearchParams(params);
  teamParams.set("scope", "team");

  try {
    const teamPayload = (await fetchAuthedJsonOrThrow(
      user,
      `/api/contracts/list?${teamParams.toString()}`
    )) as ClientContractsResponse;
    teamContracts = teamPayload.contracts ?? [];
  } catch {
    teamContracts = [];
  }

  return uniqueContracts([...(ownPayload.contracts ?? []), ...teamContracts]).filter(
    (contract) => isTestClientName(contract.clientName)
  );
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
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-12 w-full rounded-2xl border px-3.5 text-sm font-semibold outline-none transition placeholder:text-slate-400 sm:text-base ${
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-700"
            : "border-slate-200 bg-white text-slate-950 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
        }`}
      />
      {helper ? <span className="block text-xs font-semibold text-slate-500">{helper}</span> : null}
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
    if (disabled || !user || query.length < 3) {
      setRemoteSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ action: "suggest", q: query });
        const payload = (await fetchAuthedJsonOrThrow(
          user,
          `/api/cuzk/search?${params.toString()}`
        )) as { suggestions?: Array<CuzkSuggestion | string> };
        if (cancelled) return;
        const next = (payload.suggestions ?? [])
          .map(normalizeSuggestion)
          .filter(Boolean)
          .slice(0, 6);
        setRemoteSuggestions(next);
      } catch {
        if (!cancelled) setRemoteSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [disabled, user, value]);

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
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </span>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (!disabled) setFocused(true);
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Začni psát adresu..."
          disabled={disabled}
          className={`h-12 w-full rounded-2xl border pl-10 pr-3.5 text-sm font-semibold outline-none transition placeholder:text-slate-400 sm:text-base ${
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-700"
              : "border-slate-200 bg-white text-slate-950 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
          }`}
        />
      </div>
      <span className="block text-xs font-semibold text-slate-500">
        {loading ? "Našeptávám adresu..." : "Našeptávač bere adresy ze smluv a RÚIAN."}
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
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <IdCard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">Doklady</h2>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              Eviduj jeden nebo více identifikačních dokladů klienta.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!editable}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition ${
            editable
              ? "bg-violet-600 text-white shadow-[0_10px_22px_rgba(124,58,237,0.2)] hover:bg-violet-700"
              : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          <Plus className="h-4 w-4" />
          Přidat doklad
        </button>
      </div>

      {documents.length > 0 ? (
        <div className="space-y-3 p-4">
          {documents.map((document, index) => {
            const meta = identityDocumentTypeMeta(document.type);
            const expiryWarning = identityDocumentExpiryWarning(document.validTo);
            const isExpanded = expandedDocumentIds.has(document.id);
            return (
              <div
                key={document.id}
                className={`overflow-hidden rounded-[20px] border bg-slate-50 ${
                  expiryWarning?.tone === "expired"
                    ? "border-rose-300"
                    : expiryWarning?.tone === "warning"
                      ? "border-amber-300"
                      : "border-slate-200"
                }`}
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
                      <label className="block space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
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
  csob: { src: "/icons/csob.png", alt: "ČSOB" },
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

function adviserEmail(contract: ClientContractItem): string {
  return (contract.adviserEmail ?? contract.userEmail ?? "").trim().toLowerCase();
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
  const [note, setNote] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"public" | "private">("private");
  const logo = contractLogo(contract);
  const signerEmail = adviserEmail(contract);
  const logoFrameClass = institutionLogoFrameClass(logo.logoKey, "compact");
  const logoImageClass = institutionLogoImageClass(logo.logoKey);

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-slate-50 transition ${
        expanded ? "border-violet-200 bg-white" : "border-slate-200 hover:border-violet-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full flex-col gap-3 px-3.5 py-3.5 text-left"
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-12 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
            <span className={`relative block ${logoFrameClass}`}>
              <Image
                src={logo.src}
                alt={`${logo.alt} logo`}
                fill
                sizes="64px"
                className={logoImageClass}
              />
            </span>
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-950">
                {clientContractProductLabel(contract)}
              </span>
              <span className="rounded-full border border-violet-100 bg-white px-2 py-0.5 text-[11px] font-bold text-violet-700">
                {clientContractStatusLabel(contract)}
              </span>
            </span>
            <span className="mt-1 block truncate text-sm text-slate-600">
              Číslo smlouvy:{" "}
              <span className="font-semibold text-slate-900">
                {contract.contractNumber?.trim() || "—"}
              </span>
            </span>
            <span className="mt-1 block text-xs font-medium text-slate-500">
              Sjednáno {formatDate(contract.contractSignedDate)} · Počátek {formatDate(contract.policyStartDate)}
            </span>
          </span>
        </span>
        <span className="inline-flex w-fit shrink-0 items-center gap-2 self-end rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800">
          Detail
          <ChevronDown
            className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 bg-white px-4 pb-4 pt-1">
          <div className="grid gap-3 py-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Sjednal
              </div>
              <div className="mt-1 text-sm font-bold text-slate-950">
                {adviserNameFromEmail(signerEmail)}
              </div>
              <div className="mt-0.5 break-words text-xs font-medium text-slate-500">
                {signerEmail || "E-mail není dostupný"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Datum sjednání
              </div>
              <div className="mt-1 text-sm font-bold text-slate-950">
                {formatDate(contract.contractSignedDate)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Počátek smlouvy
              </div>
              <div className="mt-1 text-sm font-bold text-slate-950">
                {formatDate(contract.policyStartDate)}
              </div>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
              Poznámka
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Doplň poznámku ke smlouvě..."
              rows={3}
              className="w-full resize-none rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
            />
          </label>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
              {(["private", "public"] as const).map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  onClick={() => setNoteVisibility(visibility)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    noteVisibility === visibility
                      ? "bg-violet-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  {visibility === "private" ? "Neveřejná" : "Veřejná"}
                </button>
              ))}
            </div>
            <Link
              href={contractDetailHref(contract)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(124,58,237,0.28)] transition hover:bg-violet-700"
            >
              Zobrazit smlouvu
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ContractList({
  title,
  icon,
  contracts,
  emptyText,
}: {
  title: string;
  icon: ReactNode;
  contracts: ClientContractItem[];
  emptyText: string;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-slate-950">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
            {icon}
          </span>
          {title}
        </h2>
        <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
          {contracts.length}
        </span>
      </div>

      {contracts.length > 0 ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {contracts.map((contract) => (
            <ContractCard
              key={`${contract.adviserEmail ?? contract.userEmail ?? "owner"}-${contract.id}`}
              contract={contract}
            />
          ))}
        </div>
      ) : (
        <div className="m-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
          {emptyText}
        </div>
      )}
    </section>
  );
}

export default function ClientCardPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [contracts, setContracts] = useState<ClientContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState(TEST_CLIENT_NAME);
  const [birthNumber, setBirthNumber] = useState("");
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
  } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => setUser(nextUser));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (slug !== TEST_CLIENT_SLUG) return;

    const stored = readStoredClientCard(slug);
    if (!stored) return;

    setClientName(stored.clientName || TEST_CLIENT_NAME);
    setBirthNumber(stored.birthNumber);
    setBirthDate(stored.birthDate);
    setPhone(stored.phone);
    setEmail(stored.email);
    setPermanentAddress(stored.permanentAddress);
    setCorrespondenceAddress(stored.correspondenceAddress);
    setOccupation(stored.occupation);
    setEmployerName(stored.employerName);
    setPartnerName(stored.partnerName);
    setIdentityDocuments(stored.identityDocuments);
  }, [slug]);

  useEffect(() => {
    if (!user || slug !== TEST_CLIENT_SLUG) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await loadMartinContracts(user);
        if (cancelled) return;
        setContracts(items);
        setPermanentAddress((current) => current || bestClientAddress(items));
        setPhone((current) => current || bestClientPhone(items));
        setEmail((current) => current || bestClientEmail(items));
      } catch (err) {
        console.error("Karta klienta: načtení smluv selhalo", err);
        if (!cancelled) {
          setContracts([]);
          setError("Smlouvy klienta se nepodařilo načíst.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, user]);

  const addressSuggestions = useMemo(() => collectAddressSuggestions(contracts), [contracts]);
  const splitContracts = useMemo(() => splitClientContracts(contracts), [contracts]);

  const handleBirthNumberChange = (value: string) => {
    if (!isEditingClient) return;
    setBirthNumber(value);
    const parsed = parseBirthNumberDate(value);
    if (parsed) setBirthDate(parsed);
  };

  const handleAddIdentityDocument = () => {
    if (!isEditingClient) return;
    setIdentityDocuments((current) => [...current, createIdentityDocument()]);
  };

  const handleUpdateIdentityDocument = (
    id: string,
    field: ClientIdentityDocumentField,
    value: string
  ) => {
    if (!isEditingClient) return;
    setIdentityDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, [field]: value } : document
      )
    );
  };

  const handleRemoveIdentityDocument = (id: string) => {
    if (!isEditingClient) return;
    setIdentityDocuments((current) =>
      current.filter((document) => document.id !== id)
    );
  };

  const handleEditToggle = () => {
    if (!isEditingClient) {
      setSaveStatus(null);
      setIsEditingClient(true);
      return;
    }

    try {
      saveStoredClientCard(slug, {
        clientName,
        birthNumber,
        birthDate,
        phone,
        email,
        permanentAddress,
        correspondenceAddress,
        occupation,
        employerName,
        partnerName,
        identityDocuments,
      });
      setIsEditingClient(false);
      setSaveStatus({ tone: "success", message: "Změny uloženy." });
      window.setTimeout(() => setSaveStatus(null), 2600);
    } catch (err) {
      console.error("Karta klienta: uložení změn selhalo", err);
      setSaveStatus({
        tone: "error",
        message: "Změny se nepodařilo uložit.",
      });
    }
  };

  if (slug !== TEST_CLIENT_SLUG) {
    return (
      <AppLayout active="clients">
        <div className="w-full bg-white px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 text-center">
            <IdCard className="mx-auto h-8 w-8 text-slate-400" />
            <h1 className="mt-3 text-2xl font-bold text-slate-950">Karta není dostupná</h1>
            <p className="mt-2 text-sm text-slate-600">
              Testovací karta je zatím zapnutá pouze pro klienta Martin Březina.
            </p>
            <Link
              href="/klienti"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na klienty
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="clients">
      <div className="w-full bg-slate-50 px-2 pb-10 pt-4 sm:px-4">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/klienti"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Zpět na klienty
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-700 shadow-sm">
              <IdCard className="h-3.5 w-3.5" />
              Testovací karta
            </span>
          </div>

          <header>
            <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
              <div className="bg-gradient-to-r from-violet-950 via-violet-700 to-purple-500 px-6 py-6 text-white sm:px-7">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-50">
                    <IdCard className="h-3.5 w-3.5" />
                    Náhled klienta
                  </div>
                  <button
                    type="button"
                    onClick={handleEditToggle}
                    className={`inline-flex w-fit items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                      isEditingClient
                        ? "border-white bg-white text-violet-800 shadow-[0_12px_28px_rgba(15,23,42,0.18)] hover:bg-violet-50"
                        : "border-white/25 bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {isEditingClient ? (
                      <Save className="h-3.5 w-3.5" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    {isEditingClient ? "Uložit změny" : "Upravit"}
                  </button>
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight !text-white sm:text-4xl">
                  {clientName || TEST_CLIENT_NAME}
                </h1>
                {saveStatus ? (
                  <p
                    className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${
                      saveStatus.tone === "success"
                        ? "border-emerald-200/60 bg-emerald-400/15 text-emerald-50"
                        : "border-rose-200/70 bg-rose-400/20 text-rose-50"
                    }`}
                  >
                    {saveStatus.message}
                  </p>
                ) : null}
              </div>
            </section>
          </header>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              Načítám smlouvy klienta...
            </p>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Osobní údaje</h2>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  Identita, kontakt, práce a rodinná vazba klienta.
                </p>
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2">
              <Field
                label="Jméno a příjmení / název firmy"
                value={clientName}
                onChange={setClientName}
                placeholder="Martin Březina"
                disabled={!isEditingClient}
              />
              <Field
                label="Rodné číslo"
                value={birthNumber}
                onChange={handleBirthNumberChange}
                placeholder="Např. 850101/1234"
                disabled={!isEditingClient}
              />
              <Field
                label="Datum narození"
                type="date"
                value={birthDate}
                onChange={setBirthDate}
                disabled={!isEditingClient}
              />
              <Field
                label="Telefon"
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+420 ..."
                disabled={!isEditingClient}
              />
              <Field
                label="E-mail"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="email@domena.cz"
                disabled={!isEditingClient}
              />
              <Field
                label="Povolání"
                value={occupation}
                onChange={setOccupation}
                placeholder="Např. projektový manažer"
                disabled={!isEditingClient}
              />
              <Field
                label="Název firmy kde pracuje"
                value={employerName}
                onChange={setEmployerName}
                placeholder="Firma / zaměstnavatel"
                disabled={!isEditingClient}
              />
              <Field
                label="Partner/ka"
                value={partnerName}
                onChange={setPartnerName}
                placeholder="Jméno partnera nebo partnerky"
                disabled={!isEditingClient}
              />
            </div>
          </section>

          <IdentityDocumentsSection
            documents={identityDocuments}
            editable={isEditingClient}
            onAdd={handleAddIdentityDocument}
            onRemove={handleRemoveIdentityDocument}
            onUpdate={handleUpdateIdentityDocument}
          />

          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.07)]">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Home className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-950">Adresy</h2>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  Trvalá a korespondenční adresa s našeptávačem.
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <AddressField
                label="Trvalá adresa"
                value={permanentAddress}
                onChange={setPermanentAddress}
                localSuggestions={addressSuggestions}
                user={user}
                disabled={!isEditingClient}
              />
              <AddressField
                label="Korespondenční adresa"
                value={correspondenceAddress}
                onChange={setCorrespondenceAddress}
                localSuggestions={addressSuggestions}
                user={user}
                disabled={!isEditingClient}
              />
            </div>
          </section>

          <div className="space-y-4">
            <ContractList
              title="Aktivní smlouvy"
              icon={<FileText className="h-5 w-5 text-emerald-700" />}
              contracts={splitContracts.active}
              emptyText="Klient zatím nemá aktivní smlouvy."
            />

            <button
              type="button"
              onClick={() => setShowArchivedContracts((current) => !current)}
              className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-white px-5 py-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.06)] transition hover:border-violet-200 hover:bg-violet-50/40"
              aria-expanded={showArchivedContracts}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Archive className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-bold tracking-tight text-slate-950">
                    Archivované smlouvy
                  </span>
                  <span className="block text-sm font-medium text-slate-500">
                    Dožité a stornované smlouvy se zobrazí až po rozkliknutí.
                  </span>
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                  {splitContracts.archived.length}
                </span>
                <ChevronDown
                  className={`h-5 w-5 text-slate-500 transition ${
                    showArchivedContracts ? "rotate-180" : ""
                  }`}
                />
              </span>
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

        </div>
      </div>
    </AppLayout>
  );
}

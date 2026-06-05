"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import type { User as FirebaseUser } from "firebase/auth";
import {
  ArrowRight,
  Building2,
  Camera,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Home as HomeIcon,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { aresGetEntityDetail, aresSearchEntities } from "@/app/lib/ares";

type TipProduct = "property" | "vehicle" | "business" | "other";

type TipFormState = {
  propertyFullName: string;
  propertyBirthNumber: string;
  propertyInsuranceAddress: string;
  propertyPhone: string;
  propertyEmail: string;
  propertyPreferredCallTime: string;
  vehicleClientName: string;
  vehicleBirthNumber: string;
  vehicleCompanyId: string;
  vehiclePhone: string;
  vehicleEmail: string;
  vehiclePreferredCallTime: string;
  vehiclePlate: string;
  vehicleAnnualMileage: string;
  businessIco: string;
  businessCompanyName: string;
  businessAddress: string;
  businessTurnover: string;
  businessEmployees: string;
  businessActivity: string;
  businessPreferredCallAt: string;
  otherClientName: string;
  otherPhone: string;
  otherEmail: string;
  otherPreferredCallTime: string;
  otherDescription: string;
  note: string;
};

type TipSnapshotField = {
  label: string;
  value: string;
};

type AresDetailResponse = {
  ok?: boolean;
  subject?: {
    obchodniJmeno?: string | null;
    sidlo?: string | null;
    czNace?: string[];
    czNace2008?: string[];
  };
  sections?: {
    zivnostiRzp?: Array<{ predmet?: string | null }>;
  };
};

type AresSearchEntity = {
  ico?: string | null;
  obchodniJmeno?: string | null;
  sidlo?: {
    textovaAdresa?: string | null;
    nazevObce?: string | null;
    psc?: string | null;
  } | null;
};

type AresSearchResponse = {
  ok?: boolean;
  entities?: AresSearchEntity[];
};

const EMPTY_FORM: TipFormState = {
  propertyFullName: "",
  propertyBirthNumber: "",
  propertyInsuranceAddress: "",
  propertyPhone: "",
  propertyEmail: "",
  propertyPreferredCallTime: "",
  vehicleClientName: "",
  vehicleBirthNumber: "",
  vehicleCompanyId: "",
  vehiclePhone: "",
  vehicleEmail: "",
  vehiclePreferredCallTime: "",
  vehiclePlate: "",
  vehicleAnnualMileage: "",
  businessIco: "",
  businessCompanyName: "",
  businessAddress: "",
  businessTurnover: "",
  businessEmployees: "",
  businessActivity: "",
  businessPreferredCallAt: "",
  otherClientName: "",
  otherPhone: "",
  otherEmail: "",
  otherPreferredCallTime: "",
  otherDescription: "",
  note: "",
};

const PRODUCT_OPTIONS: Array<{
  id: TipProduct;
  label: string;
  icon: typeof HomeIcon;
}> = [
  {
    id: "property",
    label: "Majetek a odpovědnost",
    icon: HomeIcon,
  },
  {
    id: "vehicle",
    label: "Pojištění vozidel",
    icon: Car,
  },
  {
    id: "business",
    label: "Podnikatelé",
    icon: Building2,
  },
  {
    id: "other",
    label: "Ostatní produkty",
    icon: Package,
  },
];

const PRODUCT_HOME_META: Record<
  TipProduct,
  {
    title: string;
    description: string;
    accent: string;
  }
> = {
  property: {
    title: "Majetek",
    description: "Byt, dům, odpovědnost nebo pojištění domácnosti.",
    accent: "from-emerald-400 to-cyan-400",
  },
  vehicle: {
    title: "Vozidla",
    description: "Auto, SPZ, nájezd a volitelně technický průkaz v příloze.",
    accent: "from-sky-400 to-blue-500",
  },
  business: {
    title: "Podnikatelé",
    description: "IČO nebo název firmy s ARES dohledáním a poznámkou.",
    accent: "from-amber-300 to-orange-500",
  },
  other: {
    title: "Ostatní",
    description: "Volný popis situace, kontakt a soubory k posouzení.",
    accent: "from-fuchsia-400 to-violet-500",
  },
};

const TIP_WORKFLOW_STEPS = [
  {
    title: "Vyber produkt",
    description: "Zvol kategorii a formulář ukáže jen relevantní pole.",
    icon: ClipboardCheck,
  },
  {
    title: "Doplň kontakt",
    description: "Stačí telefon nebo e-mail, u firem pomůže ARES.",
    icon: ShieldCheck,
  },
  {
    title: "Přidej podklady",
    description: "Obrázky a PDF až do 20 MB na soubor.",
    icon: FileText,
  },
] as const;

const MILEAGE_OPTIONS = [
  "0-5000 km",
  ...Array.from({ length: 19 }, (_, index) => `${6000 + index * 1000} km`),
  "nad 25000 km",
];

const TIP_ATTACHMENT_MAX_COUNT = 6;
const TIP_ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const TIP_ATTACHMENT_ACCEPT = "image/*,application/pdf";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85";
const fieldClass =
  "w-full rounded-2xl border border-white/14 bg-white/[0.06] px-3 py-2.5 text-sm text-[#f8fafc] shadow-[0_8px_18px_rgba(7,6,25,0.18)] outline-none transition placeholder:text-violet-100/45 focus:border-violet-200/70 focus:ring-4 focus:ring-violet-300/10";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeIco = (value: string): string =>
  value.replace(/\D+/g, "").slice(0, 8);

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const isAllowedTipAttachment = (file: File): boolean => {
  const contentType = file.type.toLowerCase();
  if (contentType.startsWith("image/") || contentType === "application/pdf") {
    return true;
  }
  return /\.(avif|gif|heic|heif|jpe?g|pdf|png|webp)$/i.test(file.name);
};

const validateTipAttachment = (file: File): string | null => {
  if (!isAllowedTipAttachment(file)) {
    return `Soubor ${file.name} není podporovaný. Povolené jsou obrázky a PDF.`;
  }
  if (file.size <= 0) {
    return `Soubor ${file.name} je prázdný.`;
  }
  if (file.size > TIP_ATTACHMENT_MAX_SIZE_BYTES) {
    return `Soubor ${file.name} je příliš velký. Maximum je 20 MB na soubor.`;
  }
  return null;
};

const validateTipAttachments = (files: File[]): string | null => {
  if (files.length > TIP_ATTACHMENT_MAX_COUNT) {
    return `Můžeš přiložit maximálně ${TIP_ATTACHMENT_MAX_COUNT} souborů.`;
  }
  for (const file of files) {
    const validationError = validateTipAttachment(file);
    if (validationError) return validationError;
  }
  return null;
};

const isIcoOnlyQuery = (value: string): boolean => {
  const compactValue = value.replace(/\s+/g, "");
  return compactValue.length > 0 && /^\d+$/.test(compactValue);
};

const canSearchAresQuery = (value: string): boolean => {
  const query = value.trim();
  if (!query) return false;
  return isIcoOnlyQuery(query) ? normalizeIco(query).length === 8 : query.length >= 2;
};

const formatAresEntityAddress = (entity: AresSearchEntity): string => {
  const address = normalizeText(entity.sidlo?.textovaAdresa);
  if (address) return address;

  return [entity.sidlo?.psc, entity.sidlo?.nazevObce]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" ");
};

const formatAresEntityLabel = (entity: AresSearchEntity): string => {
  const name = normalizeText(entity.obchodniJmeno);
  const ico = normalizeIco(entity.ico ?? "");
  if (name && ico) return `${name} (${ico})`;
  return name || ico;
};

const productLabel = (product: TipProduct | null): string =>
  PRODUCT_OPTIONS.find((item) => item.id === product)?.label ?? "Nevybráno";

const fieldLine = (label: string, value: string | null | undefined): string | null => {
  const normalized = normalizeText(value);
  return normalized ? `${label}: ${normalized}` : null;
};

const fieldSnapshot = (
  label: string,
  value: string | null | undefined
): TipSnapshotField | null => {
  const normalized = normalizeText(value);
  return normalized ? { label, value: normalized } : null;
};

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete = "off",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5 sm:col-span-2">
      <span className={labelClass}>{label}</span>
      <textarea
        className={`${fieldClass} min-h-[108px] resize-y`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function AttachmentsField({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-white/18 bg-white/[0.04] px-4 py-4 transition hover:border-violet-300/45 hover:bg-white/[0.08] sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="flex items-center gap-2 text-sm font-semibold text-[#f8fafc]">
            <Camera className="h-4 w-4 text-violet-100/70" aria-hidden="true" />
            Přílohy
          </span>
          <p className="mt-1 text-xs text-violet-100/58">
            Obrázky nebo PDF, max 20 MB na soubor.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-violet-300/35 bg-violet-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500">
          Přidat přílohu
          <input
            type="file"
            multiple
            accept={TIP_ATTACHMENT_ACCEPT}
            className="sr-only"
            onChange={handleChange}
          />
        </label>
      </div>
      {files.length > 0 ? (
        <div className="space-y-2 pt-1">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-violet-50">{file.name}</p>
                <p className="text-xs text-violet-100/55">{formatFileSize(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.04] text-violet-100 transition hover:bg-white/[0.1]"
                aria-label={`Odebrat přílohu ${file.name}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="block text-xs text-violet-100/58">
          Zatím nejsou vybrané žádné přílohy.
        </span>
      )}
    </div>
  );
}

export function TipsterHomeView({
  user,
  profile,
}: {
  user: FirebaseUser;
  profile: Record<string, unknown>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState<TipProduct | null>(null);
  const [form, setForm] = useState<TipFormState>(EMPTY_FORM);
  const [tipAttachments, setTipAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aresLoading, setAresLoading] = useState(false);
  const [aresError, setAresError] = useState<string | null>(null);
  const [aresQuery, setAresQuery] = useState("");
  const [aresSuggestions, setAresSuggestions] = useState<AresSearchEntity[]>([]);
  const [aresSuggestLoading, setAresSuggestLoading] = useState(false);
  const [aresSuggestOpen, setAresSuggestOpen] = useState(false);
  const [aresSuggestError, setAresSuggestError] = useState<string | null>(null);
  const aresSearchRequestRef = useRef(0);
  const selectedAresQueryRef = useRef("");

  const recipientEmail =
    normalizeEmail(profile.tipRecipientEmail) || normalizeEmail(profile.managerEmail);
  const displayName =
    normalizeText(profile.fullName) ||
    normalizeText(profile.name) ||
    normalizeText(user.displayName) ||
    normalizeEmail(user.email) ||
    "Tipař";

  const updateField = <K extends keyof TipFormState>(key: K, value: TipFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setStatus(null);
  };

  const resetForm = () => {
    setStep(0);
    setProduct(null);
    setForm(EMPTY_FORM);
    setTipAttachments([]);
    setAresError(null);
    setAresQuery("");
    setAresSuggestions([]);
    setAresSuggestOpen(false);
    setAresSuggestLoading(false);
    setAresSuggestError(null);
    selectedAresQueryRef.current = "";
    setError(null);
  };

  const startTip = (selectedProduct?: TipProduct) => {
    resetForm();
    if (selectedProduct) {
      setProduct(selectedProduct);
      setStep(1);
    }
    setFormOpen(true);
    setStatus(null);
  };

  const addTipAttachments = (files: File[]) => {
    if (!files.length) return;

    setError(null);
    setStatus(null);
    const nextFiles = [...tipAttachments];
    for (const file of files) {
      const duplicate = nextFiles.some(
        (currentFile) =>
          currentFile.name === file.name &&
          currentFile.size === file.size &&
          currentFile.lastModified === file.lastModified
      );
      if (!duplicate) nextFiles.push(file);
    }

    const validationError = validateTipAttachments(nextFiles);
    if (validationError) {
      setError(validationError);
      return;
    }

    setTipAttachments(nextFiles);
  };

  const removeTipAttachment = (index: number) => {
    setTipAttachments((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index));
    setError(null);
    setStatus(null);
  };

  useEffect(() => {
    if (product !== "business") {
      aresSearchRequestRef.current += 1;
      setAresSuggestions([]);
      setAresSuggestOpen(false);
      setAresSuggestLoading(false);
      setAresSuggestError(null);
      return;
    }

    const query = aresQuery.trim();
    if (!canSearchAresQuery(query) || query === selectedAresQueryRef.current) {
      aresSearchRequestRef.current += 1;
      setAresSuggestions([]);
      setAresSuggestLoading(false);
      setAresSuggestError(null);
      return;
    }

    const requestId = aresSearchRequestRef.current + 1;
    aresSearchRequestRef.current = requestId;
    setAresSuggestLoading(true);
    setAresSuggestError(null);
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const icoOnly = isIcoOnlyQuery(query);
          const payload = (await aresSearchEntities(
            icoOnly
              ? { ico: normalizeIco(query), pocet: 6 }
              : { obchodniJmeno: query, pocet: 6 }
          )) as AresSearchResponse;

          if (aresSearchRequestRef.current !== requestId) return;
          setAresSuggestions(Array.isArray(payload.entities) ? payload.entities : []);
        } catch (suggestError) {
          if (aresSearchRequestRef.current !== requestId) return;
          setAresSuggestions([]);
          setAresSuggestError(
            suggestError instanceof Error
              ? suggestError.message
              : "ARES našeptávač se nepodařilo načíst."
          );
        } finally {
          if (aresSearchRequestRef.current === requestId) {
            setAresSuggestLoading(false);
          }
        }
      })();
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [aresQuery, product]);

  const validateCurrentDetails = (): string | null => {
    if (!product) return "Nejdřív vyber produkt.";

    if (product === "property") {
      if (!form.propertyFullName.trim()) return "Vyplň jméno a příjmení.";
      if (!form.propertyPhone.trim() && !form.propertyEmail.trim()) {
        return "Vyplň telefon nebo e-mail.";
      }
    }

    if (product === "vehicle") {
      if (!form.vehicleClientName.trim()) return "Vyplň jméno a příjmení nebo název firmy.";
      if (!form.vehiclePhone.trim() && !form.vehicleEmail.trim()) {
        return "Vyplň telefon nebo e-mail.";
      }
      if (!form.vehicleAnnualMileage.trim()) return "Vyber roční nájezd.";
    }

    if (product === "business") {
      if (normalizeIco(form.businessIco).length !== 8) {
        return "IČO musí mít 8 číslic.";
      }
      if (!form.businessPreferredCallAt.trim()) {
        return "Vyplň preferovaný datum a čas volání.";
      }
    }

    if (product === "other") {
      if (!form.otherDescription.trim()) return "Doplň krátký popis tipu.";
      if (!form.otherPhone.trim() && !form.otherEmail.trim()) {
        return "Vyplň telefon nebo e-mail.";
      }
    }

    return null;
  };

  const goNext = () => {
    if (step === 0 && !product) {
      setError("Vyber produkt tipu.");
      return;
    }
    if (step === 1) {
      const validationError = validateCurrentDetails();
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError(null);
    setStep((prev) => Math.min(prev + 1, 2));
  };

  const lookupBusiness = async (icoOverride?: string) => {
    const ico = normalizeIco(icoOverride ?? form.businessIco);
    if (ico.length !== 8) {
      setAresError("IČO musí mít 8 číslic.");
      return;
    }

    setAresLoading(true);
    setAresError(null);
    try {
      const payload = (await aresGetEntityDetail(ico)) as AresDetailResponse;
      const subject = payload.subject ?? {};
      const activity =
        payload.sections?.zivnostiRzp?.find((item) => normalizeText(item.predmet))
          ?.predmet ??
        subject.czNace2008?.[0] ??
        subject.czNace?.[0] ??
        "";
      const queryLabel = formatAresEntityLabel({
        ico,
        obchodniJmeno: subject.obchodniJmeno,
      });

      selectedAresQueryRef.current = queryLabel;
      setAresQuery(queryLabel);
      setAresSuggestions([]);
      setAresSuggestOpen(false);
      setAresSuggestError(null);
      setForm((prev) => ({
        ...prev,
        businessIco: ico,
        businessCompanyName:
          normalizeText(subject.obchodniJmeno) || prev.businessCompanyName,
        businessAddress: normalizeText(subject.sidlo) || prev.businessAddress,
        businessActivity:
          prev.businessActivity.trim() || normalizeText(activity),
      }));
    } catch (lookupError) {
      setAresError(
        lookupError instanceof Error
          ? lookupError.message
          : "ARES dohledání se nepodařilo."
      );
    } finally {
      setAresLoading(false);
    }
  };

  const handleBusinessSearchInput = (value: string) => {
    const query = value;
    const ico = normalizeIco(query);
    const queryIsIcoOnly = isIcoOnlyQuery(query);

    selectedAresQueryRef.current = "";
    setAresQuery(query);
    setAresError(null);
    setAresSuggestError(null);
    setAresSuggestOpen(true);
    setError(null);
    setStatus(null);

    setForm((prev) => {
      if (!query.trim()) {
        return {
          ...prev,
          businessIco: "",
          businessCompanyName: "",
          businessAddress: "",
        };
      }

      if (queryIsIcoOnly) {
        return {
          ...prev,
          businessIco: ico,
          businessCompanyName: ico === prev.businessIco ? prev.businessCompanyName : "",
          businessAddress: ico === prev.businessIco ? prev.businessAddress : "",
        };
      }

      return {
        ...prev,
        businessIco: "",
        businessCompanyName: query,
        businessAddress: "",
      };
    });
  };

  const selectAresEntity = (entity: AresSearchEntity) => {
    const ico = normalizeIco(entity.ico ?? "");
    const name = normalizeText(entity.obchodniJmeno);
    const address = formatAresEntityAddress(entity);
    const queryLabel = formatAresEntityLabel(entity);

    selectedAresQueryRef.current = queryLabel;
    setAresQuery(queryLabel);
    setAresSuggestions([]);
    setAresSuggestOpen(false);
    setAresSuggestError(null);
    setAresError(null);
    setError(null);
    setStatus(null);
    setForm((prev) => ({
      ...prev,
      businessIco: ico || prev.businessIco,
      businessCompanyName: name || prev.businessCompanyName,
      businessAddress: address || prev.businessAddress,
    }));

    if (ico.length === 8) {
      void lookupBusiness(ico);
    }
  };

  const handleBusinessAresLookup = async () => {
    const query = aresQuery.trim();
    const ico = normalizeIco(query || form.businessIco);

    if (isIcoOnlyQuery(query) || normalizeIco(form.businessIco).length === 8) {
      await lookupBusiness(ico || form.businessIco);
      return;
    }

    if (!canSearchAresQuery(query)) {
      setAresSuggestError("Zadej celé IČO nebo alespoň 2 znaky z názvu firmy.");
      setAresSuggestOpen(true);
      return;
    }

    setAresSuggestOpen(true);
  };

  const tipFields = useMemo<TipSnapshotField[]>(() => {
    if (product === "property") {
      return [
        fieldSnapshot("Jméno a příjmení", form.propertyFullName),
        fieldSnapshot("Rodné číslo", form.propertyBirthNumber),
        fieldSnapshot("Adresa pojištění", form.propertyInsuranceAddress),
        fieldSnapshot("Telefon", form.propertyPhone),
        fieldSnapshot("E-mail", form.propertyEmail),
        fieldSnapshot("Preferovaný čas volání", form.propertyPreferredCallTime),
        fieldSnapshot("Poznámka", form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "vehicle") {
      return [
        fieldSnapshot("Jméno a příjmení / název firmy", form.vehicleClientName),
        fieldSnapshot("Rodné číslo", form.vehicleBirthNumber),
        fieldSnapshot("IČO", form.vehicleCompanyId),
        fieldSnapshot("Telefon", form.vehiclePhone),
        fieldSnapshot("E-mail", form.vehicleEmail),
        fieldSnapshot("Preferovaný čas volání", form.vehiclePreferredCallTime),
        fieldSnapshot("SPZ", form.vehiclePlate),
        fieldSnapshot("Roční nájezd km", form.vehicleAnnualMileage),
        fieldSnapshot("Poznámka", form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "business") {
      return [
        fieldSnapshot("IČO", normalizeIco(form.businessIco)),
        fieldSnapshot("Název z ARES", form.businessCompanyName),
        fieldSnapshot("Adresa z ARES", form.businessAddress),
        fieldSnapshot("Obrat", form.businessTurnover),
        fieldSnapshot("Počet zaměstnanců", form.businessEmployees),
        fieldSnapshot("Hlavní podnikatelská činnost", form.businessActivity),
        fieldSnapshot("Preferovaný datum a čas volání", form.businessPreferredCallAt),
        fieldSnapshot("Poznámka", form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "other") {
      return [
        fieldSnapshot("Klient", form.otherClientName),
        fieldSnapshot("Telefon", form.otherPhone),
        fieldSnapshot("E-mail", form.otherEmail),
        fieldSnapshot("Preferovaný čas volání", form.otherPreferredCallTime),
        fieldSnapshot("Popis", form.otherDescription),
        fieldSnapshot("Poznámka", form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    return [];
  }, [form, product]);

  const messageLines = useMemo(() => {
    const lines = [
      "Nový tip z tipařského formuláře",
      "",
      `Produkt: ${productLabel(product)}`,
      `Tipař: ${displayName}`,
      `E-mail tipaře: ${normalizeEmail(user.email) || "neuveden"}`,
      "",
    ];

    if (product === "property") {
      lines.push(
        ...[
          fieldLine("Jméno a příjmení", form.propertyFullName),
          fieldLine("Rodné číslo", form.propertyBirthNumber),
          fieldLine("Adresa pojištění", form.propertyInsuranceAddress),
          fieldLine("Telefon", form.propertyPhone),
          fieldLine("E-mail", form.propertyEmail),
          fieldLine("Preferovaný čas volání", form.propertyPreferredCallTime),
          fieldLine("Přílohy", tipAttachments.map((file) => file.name).join(", ")),
          fieldLine("Poznámka", form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "vehicle") {
      lines.push(
        ...[
          fieldLine("Jméno a příjmení / název firmy", form.vehicleClientName),
          fieldLine("Rodné číslo", form.vehicleBirthNumber),
          fieldLine("IČO", form.vehicleCompanyId),
          fieldLine("Telefon", form.vehiclePhone),
          fieldLine("E-mail", form.vehicleEmail),
          fieldLine("Preferovaný čas volání", form.vehiclePreferredCallTime),
          fieldLine("SPZ", form.vehiclePlate),
          fieldLine("Roční nájezd km", form.vehicleAnnualMileage),
          fieldLine("Přílohy", tipAttachments.map((file) => file.name).join(", ")),
          fieldLine("Poznámka", form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "business") {
      lines.push(
        ...[
          fieldLine("IČO", normalizeIco(form.businessIco)),
          fieldLine("Název z ARES", form.businessCompanyName),
          fieldLine("Adresa z ARES", form.businessAddress),
          fieldLine("Obrat", form.businessTurnover),
          fieldLine("Počet zaměstnanců", form.businessEmployees),
          fieldLine("Hlavní podnikatelská činnost", form.businessActivity),
          fieldLine("Preferovaný datum a čas volání", form.businessPreferredCallAt),
          fieldLine("Přílohy", tipAttachments.map((file) => file.name).join(", ")),
          fieldLine("Poznámka", form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "other") {
      lines.push(
        ...[
          fieldLine("Klient", form.otherClientName),
          fieldLine("Telefon", form.otherPhone),
          fieldLine("E-mail", form.otherEmail),
          fieldLine("Preferovaný čas volání", form.otherPreferredCallTime),
          fieldLine("Popis", form.otherDescription),
          fieldLine("Přílohy", tipAttachments.map((file) => file.name).join(", ")),
          fieldLine("Poznámka", form.note),
        ].filter((line): line is string => !!line)
      );
    }

    return lines;
  }, [displayName, form, product, tipAttachments, user.email]);

  const submitTip = async () => {
    const validationError = validateCurrentDetails();
    if (validationError) {
      setError(validationError);
      setStep(1);
      return;
    }
    const attachmentValidationError = validateTipAttachments(tipAttachments);
    if (attachmentValidationError) {
      setError(attachmentValidationError);
      setStep(1);
      return;
    }
    if (!recipientEmail) {
      setError("Účet nemá nastaveného příjemce tipů. Nastav ho v adminu.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const payload = new FormData();
      payload.append("recipientEmail", recipientEmail);
      payload.append("subject", `Nový tip - ${productLabel(product)}`);
      payload.append("text", messageLines.join("\n"));
      payload.append(
        "metadataJson",
        JSON.stringify({
          tipsterTip: true,
          tipProduct: product,
          tipProductLabel: productLabel(product),
        })
      );
      payload.append("tipSnapshotJson", JSON.stringify({ fields: tipFields }));
      tipAttachments.forEach((file) => payload.append("files", file));

      await fetchAuthedJsonOrThrow<Record<string, unknown>>(user, "/api/mailbox/compose", {
        method: "POST",
        body: payload,
      });

      resetForm();
      setFormOpen(false);
      setStatus(`Tip byl odeslán na ${recipientEmail}.`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Tip se nepodařilo odeslat."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderDetails = (): ReactNode => {
    if (product === "property") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Jméno a příjmení" value={form.propertyFullName} onChange={(value) => updateField("propertyFullName", value)} />
          <TextField label="Rodné číslo" value={form.propertyBirthNumber} onChange={(value) => updateField("propertyBirthNumber", value)} />
          <TextField label="Adresa pojištění" value={form.propertyInsuranceAddress} onChange={(value) => updateField("propertyInsuranceAddress", value)} />
          <TextField label="Telefon" type="tel" value={form.propertyPhone} onChange={(value) => updateField("propertyPhone", value)} />
          <TextField label="E-mail" type="email" value={form.propertyEmail} onChange={(value) => updateField("propertyEmail", value)} />
          <TextField label="Preferovaný čas volání" value={form.propertyPreferredCallTime} onChange={(value) => updateField("propertyPreferredCallTime", value)} placeholder="Např. pracovní dny 14:00-16:00" />
          <AttachmentsField files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label="Poznámka" value={form.note} onChange={(value) => updateField("note", value)} placeholder="Doplňující informace k tipu." />
        </div>
      );
    }

    if (product === "vehicle") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Jméno a příjmení / název firmy" value={form.vehicleClientName} onChange={(value) => updateField("vehicleClientName", value)} />
          <TextField label="Rodné číslo" value={form.vehicleBirthNumber} onChange={(value) => updateField("vehicleBirthNumber", value)} />
          <TextField label="IČO" value={form.vehicleCompanyId} onChange={(value) => updateField("vehicleCompanyId", normalizeIco(value))} />
          <TextField label="Telefon" type="tel" value={form.vehiclePhone} onChange={(value) => updateField("vehiclePhone", value)} />
          <TextField label="E-mail" type="email" value={form.vehicleEmail} onChange={(value) => updateField("vehicleEmail", value)} />
          <TextField label="Preferovaný čas volání" value={form.vehiclePreferredCallTime} onChange={(value) => updateField("vehiclePreferredCallTime", value)} placeholder="Např. zítra dopoledne" />
          <TextField label="SPZ" value={form.vehiclePlate} onChange={(value) => updateField("vehiclePlate", value.toUpperCase())} />
          <label className="space-y-1.5">
            <span className={labelClass}>Roční nájezd km</span>
            <select
              className={fieldClass}
              value={form.vehicleAnnualMileage}
              onChange={(event) => updateField("vehicleAnnualMileage", event.target.value)}
            >
              <option value="">Vyber nájezd</option>
              {MILEAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <AttachmentsField files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label="Poznámka" value={form.note} onChange={(value) => updateField("note", value)} placeholder="Doplňující informace k vozidlu nebo klientovi." />
        </div>
      );
    }

    if (product === "business") {
      const showAresSuggestions =
        aresSuggestOpen &&
        (aresSuggestLoading ||
          !!aresSuggestError ||
          aresSuggestions.length > 0 ||
          canSearchAresQuery(aresQuery));

      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={labelClass}>IČO nebo název firmy</span>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  autoComplete="off"
                  className={fieldClass}
                  value={aresQuery}
                  onChange={(event) => handleBusinessSearchInput(event.target.value)}
                  onFocus={() => {
                    if (canSearchAresQuery(aresQuery)) {
                      setAresSuggestOpen(true);
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setAresSuggestOpen(false), 160);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAresSuggestOpen(false);
                    }
                  }}
                  placeholder="IČO nebo název firmy"
                />
                {showAresSuggestions ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-white/14 bg-[#130b28] p-1.5 shadow-[0_22px_54px_rgba(7,6,25,0.55)]">
                    {aresSuggestLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-violet-100/75">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Hledám v ARES...
                      </div>
                    ) : null}
                    {!aresSuggestLoading && aresSuggestError ? (
                      <div className="px-3 py-2.5 text-sm text-rose-100">
                        {aresSuggestError}
                      </div>
                    ) : null}
                    {!aresSuggestLoading &&
                    !aresSuggestError &&
                    aresSuggestions.length === 0 &&
                    canSearchAresQuery(aresQuery) ? (
                      <div className="px-3 py-2.5 text-sm text-violet-100/68">
                        ARES nenašel žádný subjekt.
                      </div>
                    ) : null}
                    {!aresSuggestLoading && !aresSuggestError
                      ? aresSuggestions.map((entity, index) => {
                          const ico = normalizeIco(entity.ico ?? "");
                          const name = normalizeText(entity.obchodniJmeno) || "Subjekt bez názvu";
                          const address = formatAresEntityAddress(entity);

                          return (
                            <button
                              key={`${ico || name}-${index}`}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectAresEntity(entity)}
                              className="block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
                            >
                              <span className="block text-sm font-semibold text-[#f8fafc]">
                                {name}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-violet-100/68">
                                {ico ? <span>IČO {ico}</span> : null}
                                {address ? <span>{address}</span> : null}
                              </span>
                            </button>
                          );
                        })
                      : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleBusinessAresLookup()}
                disabled={aresLoading || aresSuggestLoading}
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-white/[0.06] text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                title="Dohledat v ARES"
                aria-label="Dohledat v ARES"
              >
                {aresLoading || aresSuggestLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <span className="block text-xs text-violet-100/48">
              Piš IČO nebo název firmy, potom vyber subjekt z ARES.
            </span>
          </label>
          <TextField label="Obrat" value={form.businessTurnover} onChange={(value) => updateField("businessTurnover", value)} placeholder="Např. 3 000 000 Kč" />
          <TextField label="Počet zaměstnanců" type="number" value={form.businessEmployees} onChange={(value) => updateField("businessEmployees", value)} />
          <TextField label="Hlavní podnikatelská činnost" value={form.businessActivity} onChange={(value) => updateField("businessActivity", value)} />
          <TextField label="Preferovaný datum a čas volání" type="datetime-local" value={form.businessPreferredCallAt} onChange={(value) => updateField("businessPreferredCallAt", value)} />
          {form.businessCompanyName || form.businessAddress ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100 sm:col-span-2">
              <div className="font-semibold">{form.businessCompanyName || "ARES subjekt"}</div>
              {form.businessAddress ? (
                <div className="mt-1 text-emerald-100/78">{form.businessAddress}</div>
              ) : null}
            </div>
          ) : null}
          {aresError ? (
            <p className="rounded-2xl border border-rose-300/45 bg-rose-400/15 px-4 py-3 text-sm text-rose-100 sm:col-span-2">
              {aresError}
            </p>
          ) : null}
          <AttachmentsField files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label="Poznámka" value={form.note} onChange={(value) => updateField("note", value)} placeholder="Doplňující informace k podnikateli." />
        </div>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Klient" value={form.otherClientName} onChange={(value) => updateField("otherClientName", value)} />
        <TextField label="Telefon" type="tel" value={form.otherPhone} onChange={(value) => updateField("otherPhone", value)} />
        <TextField label="E-mail" type="email" value={form.otherEmail} onChange={(value) => updateField("otherEmail", value)} />
        <TextField label="Preferovaný čas volání" value={form.otherPreferredCallTime} onChange={(value) => updateField("otherPreferredCallTime", value)} />
        <TextareaField label="Popis tipu" value={form.otherDescription} onChange={(value) => updateField("otherDescription", value)} placeholder="Zatím obecné pole pro ostatní produkty." />
        <AttachmentsField files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
        <TextareaField label="Poznámka" value={form.note} onChange={(value) => updateField("note", value)} placeholder="Doplňující informace k tipu." />
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_90%_12%,rgba(168,85,247,0.16),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef4f8_48%,#f8fafc_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6 font-sans text-slate-900">
        <section className="relative overflow-hidden rounded-[36px] border border-white/70 bg-[#08111f] p-5 text-white shadow-[0_28px_80px_rgba(15,23,42,0.2)] sm:p-7 lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(45,212,191,0.28),transparent_34%),radial-gradient(circle_at_78%_14%,rgba(168,85,247,0.34),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_44%)]" />
          <div className="absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Tipařský účet
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-6xl">
                Tip na klienta, který se neztratí.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200/82">
                Přihlášen jako <span className="font-bold text-white">{displayName}</span>. Tip odejde příjemci{" "}
                <span className="font-bold text-emerald-100">{recipientEmail || "není nastaven"}</span>
                {" "}a v detailu pak uvidíš stav zpracování.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => startTip()}
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200/25 bg-[linear-gradient(135deg,#34d399_0%,#14b8a6_48%,#0ea5e9_100%)] px-5 py-3 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(20,184,166,0.32)] transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Přidat tip
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
                <Link
                  href="/tipy"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.15] bg-white/[0.08] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/[0.12]"
                >
                  Moje tipy
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-7 grid gap-2 sm:grid-cols-3">
                {[
                  ["20 MB", "max na přílohu"],
                  ["ARES", "rychlé firmy"],
                  ["4", "typy produktů"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                    <p className="text-2xl font-black tracking-tight text-white">{value}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-white/[0.12] bg-white/[0.09] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/80">
                    Rychlý start
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                    Vyber typ tipu
                  </h2>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-emerald-100">
                  <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {PRODUCT_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  const meta = PRODUCT_HOME_META[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => startTip(item.id)}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.11]"
                    >
                      <div className={`h-1.5 rounded-full bg-gradient-to-r ${meta.accent}`} />
                      <div className="mt-3 flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-white">{meta.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-300">{meta.description}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {status ? (
          <p className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {status}
          </p>
        ) : null}

        {!formOpen ? (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[30px] border border-slate-200/80 bg-white/[0.86] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Jak to probíhá
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    Tři kroky a tip je u poradce
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => startTip()}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  Začít
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {TIP_WORKFLOW_STEPS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950 shadow-sm">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          0{index + 1}
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-black text-slate-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="rounded-[30px] border border-slate-900/10 bg-[linear-gradient(145deg,#ffffff_0%,#ecfeff_100%)] p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-teal-700">
                Co si připravit
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Stačí minimum, podklady pomůžou
              </h2>
              <div className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                <div className="rounded-2xl border border-teal-100 bg-white/75 px-4 py-3">
                  Kontakt na klienta: telefon nebo e-mail.
                </div>
                <div className="rounded-2xl border border-teal-100 bg-white/75 px-4 py-3">
                  U podnikatele můžeš zadat IČO nebo název firmy přes ARES.
                </div>
                <div className="rounded-2xl border border-teal-100 bg-white/75 px-4 py-3">
                  Přílohy: fotky a PDF, maximálně 20 MB na soubor.
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {formOpen ? (
          <section className="relative overflow-hidden rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                Tipařský formulář
              </p>
              <h2 className="text-xl font-bold tracking-[-0.02em] text-[#f8fafc]">
                Základní údaje k tipu
              </h2>
            </div>

            <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {["Produkt", "Údaje", "Kontrola"].map((label, index) => {
                const active = step === index;
                const done = step > index;
                return (
                  <div key={label} className="flex flex-col items-center gap-1 text-center">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                        done
                          ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                          : active
                            ? "border-violet-200/70 bg-violet-400/30 text-[#f8fafc]"
                            : "border-white/20 bg-white/[0.03] text-violet-200/70"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        active || done ? "text-[#f4f0ff]" : "text-violet-200/60"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#8b5cf6_0%,#a855f7_55%,#c084fc_100%)] transition-[width] duration-300"
                style={{ width: `${((step + 1) / 3) * 100}%` }}
              />
            </div>
            </div>

            <div className="mt-5">
              {step === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {PRODUCT_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    const selected = product === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setProduct(item.id);
                          setError(null);
                        }}
                        className={`flex min-h-[92px] items-center gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                          selected
                            ? "border-violet-200/70 bg-violet-400/20 text-[#f8fafc] shadow-[0_10px_26px_rgba(139,92,246,0.28)]"
                            : "border-white/14 bg-white/[0.03] text-violet-100/90 hover:border-violet-300/40 hover:bg-white/[0.07]"
                        }`}
                      >
                        <span
                          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                            selected
                              ? "border-violet-200/70 bg-violet-300/35 text-[#f8fafc]"
                              : "border-white/20 bg-white/[0.03] text-violet-100/80"
                          }`}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold leading-tight text-[#f8fafc]">{item.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {step === 1 ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      {productLabel(product)}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#f8fafc]">
                      Údaje k tipu
                    </h2>
                  </div>
                  {renderDetails()}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      Kontrola
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#f8fafc]">
                      Souhrn před odesláním
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                    <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-violet-100/90">
                      {messageLines.join("\n")}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-4 rounded-2xl border border-rose-300/45 bg-rose-400/15 px-4 py-3 text-sm font-medium text-rose-100">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/12 pt-4">
              <button
                type="button"
                onClick={() => {
                  if (step === 0) {
                    resetForm();
                    setFormOpen(false);
                    return;
                  }
                  setError(null);
                  setStep((prev) => Math.max(prev - 1, 0));
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {step === 0 ? "Zavřít" : "Zpět"}
              </button>

              {step < 2 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110"
                >
                  Pokračovat
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitTip()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden="true" />
                  )}
                  Odeslat tip
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

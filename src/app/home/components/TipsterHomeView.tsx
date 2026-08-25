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
  Home as HomeIcon,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { useEffectiveUserEmail } from "@/app/lib/useAdminImpersonation";
import { aresGetEntityDetail, aresSearchEntities } from "@/app/lib/ares";
import { type AppLanguage } from "@/lib/appLanguage";

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

type UserLookupResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
  error?: string;
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
  icon: typeof HomeIcon;
}> = [
  {
    id: "property",
    icon: HomeIcon,
  },
  {
    id: "vehicle",
    icon: Car,
  },
  {
    id: "business",
    icon: Building2,
  },
  {
    id: "other",
    icon: Package,
  },
];

const PRODUCT_HOME_ACCENT: Record<TipProduct, string> = {
  property: "from-emerald-400 to-cyan-400",
  vehicle: "from-sky-400 to-blue-500",
  business: "from-amber-300 to-orange-500",
  other: "from-fuchsia-400 to-violet-500",
};

const MILEAGE_OPTIONS = [
  "0-5000 km",
  ...Array.from({ length: 19 }, (_, index) => `${6000 + index * 1000} km`),
  "nad 25000 km",
];

const TIP_ATTACHMENT_MAX_COUNT = 6;
const TIP_ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const TIP_ATTACHMENT_ACCEPT = "image/*,application/pdf";

const TIPSTER_COPY = {
  cs: {
    productLabels: {
      property: "Majetek a odpovědnost",
      vehicle: "Pojištění vozidel",
      business: "Podnikatelé",
      other: "Ostatní produkty",
    },
    productHomeMeta: {
      property: {
        title: "Majetek",
        description: "Byt, dům, odpovědnost nebo pojištění domácnosti.",
      },
      vehicle: {
        title: "Vozidla",
        description: "Auto, SPZ, nájezd a volitelně technický průkaz v příloze.",
      },
      business: {
        title: "Podnikatelé",
        description: "IČO nebo název firmy s ARES dohledáním a poznámkou.",
      },
      other: {
        title: "Ostatní",
        description: "Volný popis situace, kontakt a soubory k posouzení.",
      },
    },
    notSelected: "Nevybráno",
    recipientFallback: "Příjemce",
    displayNameFallback: "Tipař",
    recipientLoading: "načítám příjemce…",
    recipientMissing: "není nastaven",
    attachments: {
      title: "Přílohy",
      hint: "Obrázky nebo PDF, max 20 MB na soubor.",
      add: "Přidat přílohu",
      empty: "Zatím nejsou vybrané žádné přílohy.",
      removeAria: (name: string) => `Odebrat přílohu ${name}`,
      unsupported: (name: string) =>
        `Soubor ${name} není podporovaný. Povolené jsou obrázky a PDF.`,
      emptyFile: (name: string) => `Soubor ${name} je prázdný.`,
      tooLarge: (name: string) =>
        `Soubor ${name} je příliš velký. Maximum je 20 MB na soubor.`,
      maxFiles: (count: number) => `Můžeš přiložit maximálně ${count} souborů.`,
    },
    ares: {
      suggestFailed: "ARES našeptávač se nepodařilo načíst.",
      lookupFailed: "ARES dohledání se nepodařilo.",
      icoLength: "IČO musí mít 8 číslic.",
      queryTooShort: "Zadej celé IČO nebo alespoň 2 znaky z názvu firmy.",
      icoOrCompany: "IČO nebo název firmy",
      searchPlaceholder: "IČO nebo název firmy",
      searching: "Hledám v ARES...",
      noSubject: "ARES nenašel žádný subjekt.",
      subjectWithoutName: "Subjekt bez názvu",
      icoPrefix: "IČO",
      lookupTitle: "Dohledat v ARES",
      queryHelp: "Piš IČO nebo název firmy, potom vyber subjekt z ARES.",
      subjectFallback: "ARES subjekt",
    },
    validation: {
      selectProductFirst: "Nejdřív vyber produkt.",
      fillFullName: "Vyplň jméno a příjmení.",
      fillContact: "Vyplň telefon nebo e-mail.",
      fillVehicleName: "Vyplň jméno a příjmení nebo název firmy.",
      selectMileage: "Vyber roční nájezd.",
      fillPreferredCall: "Vyplň preferovaný datum a čas volání.",
      fillDescription: "Doplň krátký popis tipu.",
      chooseProduct: "Vyber produkt tipu.",
      missingRecipient: "Účet nemá nastaveného příjemce tipů. Nastav ho v adminu.",
      submitFailed: "Tip se nepodařilo odeslat.",
    },
    fields: {
      fullName: "Jméno a příjmení",
      birthNumber: "Rodné číslo",
      insuranceAddress: "Adresa pojištění",
      phone: "Telefon",
      email: "E-mail",
      preferredCall: "Preferovaný datum a čas volání",
      note: "Poznámka",
      vehicleClientName: "Jméno a příjmení / název firmy",
      spz: "SPZ",
      annualMileage: "Roční nájezd km",
      turnover: "Obrat",
      employees: "Počet zaměstnanců",
      activity: "Hlavní podnikatelská činnost",
      client: "Klient",
      description: "Popis",
      tipDescription: "Popis tipu",
      product: "Produkt",
      tipster: "Tipař",
      tipsterEmail: "E-mail tipaře",
      attachments: "Přílohy",
      aresName: "Název z ARES",
      aresAddress: "Adresa z ARES",
      notProvided: "neuveden",
    },
    placeholders: {
      preferredCall: "Např. zítra dopoledne nebo pracovní dny 14:00-16:00",
      noteTip: "Doplňující informace k tipu.",
      noteVehicle: "Doplňující informace k vozidlu nebo klientovi.",
      noteBusiness: "Doplňující informace k podnikateli.",
      otherDescription: "Zatím obecné pole pro ostatní produkty.",
      turnover: "Např. 3 000 000 Kč",
    },
    mileageSelect: "Vyber nájezd",
    message: {
      title: "Nový tip z tipařského formuláře",
      subjectPrefix: "Nový tip",
      sentTo: (name: string) => `Tip byl odeslán na ${name}.`,
    },
    hero: {
      kicker: "Tipařský účet",
      title: "Tip na klienta, který se neztratí.",
      signedPrefix: "Přihlášen jako",
      recipientPrefix: "Tip odejde příjemci",
      signedSuffix: "a v detailu pak uvidíš stav zpracování.",
      addTip: "Přidat tip",
      myTips: "Moje tipy",
      quickStart: "Rychlý start",
      chooseTipType: "Vyber typ tipu",
      formKicker: "Tipařský formulář",
      formTitle: "Základní údaje k tipu",
      steps: ["Produkt", "Údaje", "Kontrola"],
      detailsTitle: "Údaje k tipu",
      reviewKicker: "Kontrola",
      reviewTitle: "Souhrn před odesláním",
      close: "Zavřít",
      back: "Zpět",
      next: "Pokračovat",
      submit: "Odeslat tip",
    },
  },
} as const;

type TipsterCopy = (typeof TIPSTER_COPY)[AppLanguage];

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85";
const fieldClass =
  "w-full rounded-2xl border border-white/14 bg-white/[0.06] px-3 py-2.5 text-sm text-[#f8fafc] shadow-[0_8px_18px_rgba(7,6,25,0.18)] outline-none transition placeholder:text-violet-100/45 focus:border-violet-200/70 focus:ring-4 focus:ring-violet-300/10";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const nameFromEmail = (
  email: string,
  fallback: string = TIPSTER_COPY.cs.recipientFallback
): string => {
  const localPart = email.split("@")[0] ?? "";
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

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

const validateTipAttachment = (
  file: File,
  copy: TipsterCopy["attachments"]
): string | null => {
  if (!isAllowedTipAttachment(file)) {
    return copy.unsupported(file.name);
  }
  if (file.size <= 0) {
    return copy.emptyFile(file.name);
  }
  if (file.size > TIP_ATTACHMENT_MAX_SIZE_BYTES) {
    return copy.tooLarge(file.name);
  }
  return null;
};

const validateTipAttachments = (
  files: File[],
  copy: TipsterCopy["attachments"]
): string | null => {
  if (files.length > TIP_ATTACHMENT_MAX_COUNT) {
    return copy.maxFiles(TIP_ATTACHMENT_MAX_COUNT);
  }
  for (const file of files) {
    const validationError = validateTipAttachment(file, copy);
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

const productLabel = (product: TipProduct | null, copy: TipsterCopy): string =>
  product ? copy.productLabels[product] : copy.notSelected;

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
  copy,
  files,
  onAdd,
  onRemove,
}: {
  copy: TipsterCopy["attachments"];
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
            {copy.title}
          </span>
          <p className="mt-1 text-xs text-violet-100/58">
            {copy.hint}
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-violet-300/35 bg-violet-500/80 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500">
          {copy.add}
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
                aria-label={copy.removeAria(file.name)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="block text-xs text-violet-100/58">
          {copy.empty}
        </span>
      )}
    </div>
  );
}

export function TipsterHomeView({
  user,
  profile,
  language,
}: {
  user: FirebaseUser;
  profile: Record<string, unknown>;
  language: AppLanguage;
}) {
  const effectiveEmail = useEffectiveUserEmail(user.email);
  const copy = TIPSTER_COPY[language];
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
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [recipientNameLoading, setRecipientNameLoading] = useState(false);
  const aresSearchRequestRef = useRef(0);
  const selectedAresQueryRef = useRef("");

  const recipientEmail =
    normalizeEmail(profile.tipRecipientEmail) || normalizeEmail(profile.managerEmail);
  const displayName =
    normalizeText(profile.fullName) ||
    normalizeText(profile.name) ||
    normalizeText(user.displayName) ||
    effectiveEmail ||
    copy.displayNameFallback;
  const recipientDisplayName =
    recipientEmail
      ? recipientName || (recipientNameLoading ? copy.recipientLoading : nameFromEmail(recipientEmail, copy.recipientFallback))
      : copy.recipientMissing;

  useEffect(() => {
    let cancelled = false;
    const profileRecipientName =
      normalizeText(profile.tipRecipientName) ||
      normalizeText(profile.tipRecipientFullName) ||
      normalizeText(profile.recipientName);

    setRecipientName(profileRecipientName || null);
    if (!recipientEmail) {
      setRecipientNameLoading(false);
      return;
    }

    setRecipientNameLoading(true);
    void fetchAuthedJsonOrThrow<UserLookupResponse>(
      user,
      `/api/user/lookup?email=${encodeURIComponent(recipientEmail)}`,
      { method: "GET", cache: "no-store" }
    )
      .then((payload) => {
        if (cancelled) return;
        const lookupName = normalizeText(payload.name);
        setRecipientName(
          lookupName || profileRecipientName || nameFromEmail(recipientEmail, copy.recipientFallback)
        );
      })
      .catch(() => {
        if (cancelled) return;
        setRecipientName(profileRecipientName || nameFromEmail(recipientEmail, copy.recipientFallback));
      })
      .finally(() => {
        if (!cancelled) setRecipientNameLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy.recipientFallback, profile, recipientEmail, user]);

  const updateField = <K extends keyof TipFormState>(key: K, value: TipFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setStatus(null);
  };

  const clearAresState = () => {
    setAresError(null);
    setAresQuery("");
    setAresSuggestions([]);
    setAresSuggestOpen(false);
    setAresSuggestLoading(false);
    setAresSuggestError(null);
    selectedAresQueryRef.current = "";
  };

  const resetForm = () => {
    setStep(0);
    setProduct(null);
    setForm(EMPTY_FORM);
    setTipAttachments([]);
    clearAresState();
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

    const validationError = validateTipAttachments(nextFiles, copy.attachments);
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
    if (product !== "business" && product !== "vehicle") {
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
              : copy.ares.suggestFailed
          );
        } finally {
          if (aresSearchRequestRef.current === requestId) {
            setAresSuggestLoading(false);
          }
        }
      })();
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [aresQuery, copy.ares.suggestFailed, product]);

  const validateCurrentDetails = (): string | null => {
    if (!product) return copy.validation.selectProductFirst;

    if (product === "property") {
      if (!form.propertyFullName.trim()) return copy.validation.fillFullName;
      if (!form.propertyPhone.trim() && !form.propertyEmail.trim()) {
        return copy.validation.fillContact;
      }
    }

    if (product === "vehicle") {
      if (!form.vehicleClientName.trim()) return copy.validation.fillVehicleName;
      if (!form.vehiclePhone.trim() && !form.vehicleEmail.trim()) {
        return copy.validation.fillContact;
      }
      if (!form.vehicleAnnualMileage.trim()) return copy.validation.selectMileage;
    }

    if (product === "business") {
      if (normalizeIco(form.businessIco).length !== 8) {
        return copy.ares.icoLength;
      }
      if (!form.businessPreferredCallAt.trim()) {
        return copy.validation.fillPreferredCall;
      }
    }

    if (product === "other") {
      if (!form.otherDescription.trim()) return copy.validation.fillDescription;
      if (!form.otherPhone.trim() && !form.otherEmail.trim()) {
        return copy.validation.fillContact;
      }
    }

    return null;
  };

  const goNext = () => {
    if (step === 0 && !product) {
      setError(copy.validation.chooseProduct);
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
      setAresError(copy.ares.icoLength);
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
          : copy.ares.lookupFailed
      );
    } finally {
      setAresLoading(false);
    }
  };

  const lookupVehicle = async (icoOverride?: string) => {
    const ico = normalizeIco(icoOverride ?? form.vehicleCompanyId);
    if (ico.length !== 8) {
      setAresError(copy.ares.icoLength);
      return;
    }

    setAresLoading(true);
    setAresError(null);
    try {
      const payload = (await aresGetEntityDetail(ico)) as AresDetailResponse;
      const subject = payload.subject ?? {};
      const companyName = normalizeText(subject.obchodniJmeno);
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
        vehicleCompanyId: ico,
        vehicleClientName: companyName || prev.vehicleClientName,
      }));
    } catch (lookupError) {
      setAresError(
        lookupError instanceof Error
          ? lookupError.message
          : copy.ares.lookupFailed
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
      setAresSuggestError(copy.ares.queryTooShort);
      setAresSuggestOpen(true);
      return;
    }

    setAresSuggestOpen(true);
  };

  const handleVehicleSearchInput = (value: string) => {
    const query = value;
    const ico = normalizeIco(query);

    selectedAresQueryRef.current = "";
    setAresQuery(query);
    setAresError(null);
    setAresSuggestError(null);
    setAresSuggestOpen(true);
    setError(null);
    setStatus(null);

    setForm((prev) => ({
      ...prev,
      vehicleCompanyId: isIcoOnlyQuery(query) ? ico : "",
    }));
  };

  const selectVehicleAresEntity = (entity: AresSearchEntity) => {
    const ico = normalizeIco(entity.ico ?? "");
    const name = normalizeText(entity.obchodniJmeno);
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
      vehicleCompanyId: ico || prev.vehicleCompanyId,
      vehicleClientName: name || prev.vehicleClientName,
    }));

    if (ico.length === 8) {
      void lookupVehicle(ico);
    }
  };

  const handleVehicleAresLookup = async () => {
    const query = aresQuery.trim();
    const ico = normalizeIco(query || form.vehicleCompanyId);

    if (isIcoOnlyQuery(query) || normalizeIco(form.vehicleCompanyId).length === 8) {
      await lookupVehicle(ico || form.vehicleCompanyId);
      return;
    }

    if (!canSearchAresQuery(query)) {
      setAresSuggestError(copy.ares.queryTooShort);
      setAresSuggestOpen(true);
      return;
    }

    setAresSuggestOpen(true);
  };

  const tipFields = useMemo<TipSnapshotField[]>(() => {
    if (product === "property") {
      return [
        fieldSnapshot(copy.fields.fullName, form.propertyFullName),
        fieldSnapshot(copy.fields.birthNumber, form.propertyBirthNumber),
        fieldSnapshot(copy.fields.insuranceAddress, form.propertyInsuranceAddress),
        fieldSnapshot(copy.fields.phone, form.propertyPhone),
        fieldSnapshot(copy.fields.email, form.propertyEmail),
        fieldSnapshot(copy.fields.preferredCall, form.propertyPreferredCallTime),
        fieldSnapshot(copy.fields.note, form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "vehicle") {
      return [
        fieldSnapshot(copy.fields.vehicleClientName, form.vehicleClientName),
        fieldSnapshot(copy.fields.birthNumber, form.vehicleBirthNumber),
        fieldSnapshot(copy.ares.icoPrefix, form.vehicleCompanyId),
        fieldSnapshot(copy.fields.phone, form.vehiclePhone),
        fieldSnapshot(copy.fields.email, form.vehicleEmail),
        fieldSnapshot(copy.fields.preferredCall, form.vehiclePreferredCallTime),
        fieldSnapshot(copy.fields.spz, form.vehiclePlate),
        fieldSnapshot(copy.fields.annualMileage, form.vehicleAnnualMileage),
        fieldSnapshot(copy.fields.note, form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "business") {
      return [
        fieldSnapshot(copy.ares.icoPrefix, normalizeIco(form.businessIco)),
        fieldSnapshot(copy.fields.aresName, form.businessCompanyName),
        fieldSnapshot(copy.fields.aresAddress, form.businessAddress),
        fieldSnapshot(copy.fields.turnover, form.businessTurnover),
        fieldSnapshot(copy.fields.employees, form.businessEmployees),
        fieldSnapshot(copy.fields.activity, form.businessActivity),
        fieldSnapshot(copy.fields.preferredCall, form.businessPreferredCallAt),
        fieldSnapshot(copy.fields.note, form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    if (product === "other") {
      return [
        fieldSnapshot(copy.fields.client, form.otherClientName),
        fieldSnapshot(copy.fields.phone, form.otherPhone),
        fieldSnapshot(copy.fields.email, form.otherEmail),
        fieldSnapshot(copy.fields.preferredCall, form.otherPreferredCallTime),
        fieldSnapshot(copy.fields.description, form.otherDescription),
        fieldSnapshot(copy.fields.note, form.note),
      ].filter((field): field is TipSnapshotField => !!field);
    }

    return [];
  }, [copy, form, product]);

  const messageLines = useMemo(() => {
    const lines = [
      copy.message.title,
      "",
      `${copy.fields.product}: ${productLabel(product, copy)}`,
      `${copy.fields.tipster}: ${displayName}`,
      `${copy.fields.tipsterEmail}: ${effectiveEmail || copy.fields.notProvided}`,
      "",
    ];

    if (product === "property") {
      lines.push(
        ...[
          fieldLine(copy.fields.fullName, form.propertyFullName),
          fieldLine(copy.fields.birthNumber, form.propertyBirthNumber),
          fieldLine(copy.fields.insuranceAddress, form.propertyInsuranceAddress),
          fieldLine(copy.fields.phone, form.propertyPhone),
          fieldLine(copy.fields.email, form.propertyEmail),
          fieldLine(copy.fields.preferredCall, form.propertyPreferredCallTime),
          fieldLine(copy.fields.attachments, tipAttachments.map((file) => file.name).join(", ")),
          fieldLine(copy.fields.note, form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "vehicle") {
      lines.push(
        ...[
          fieldLine(copy.fields.vehicleClientName, form.vehicleClientName),
          fieldLine(copy.fields.birthNumber, form.vehicleBirthNumber),
          fieldLine(copy.ares.icoPrefix, form.vehicleCompanyId),
          fieldLine(copy.fields.phone, form.vehiclePhone),
          fieldLine(copy.fields.email, form.vehicleEmail),
          fieldLine(copy.fields.preferredCall, form.vehiclePreferredCallTime),
          fieldLine(copy.fields.spz, form.vehiclePlate),
          fieldLine(copy.fields.annualMileage, form.vehicleAnnualMileage),
          fieldLine(copy.fields.attachments, tipAttachments.map((file) => file.name).join(", ")),
          fieldLine(copy.fields.note, form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "business") {
      lines.push(
        ...[
          fieldLine(copy.ares.icoPrefix, normalizeIco(form.businessIco)),
          fieldLine(copy.fields.aresName, form.businessCompanyName),
          fieldLine(copy.fields.aresAddress, form.businessAddress),
          fieldLine(copy.fields.turnover, form.businessTurnover),
          fieldLine(copy.fields.employees, form.businessEmployees),
          fieldLine(copy.fields.activity, form.businessActivity),
          fieldLine(copy.fields.preferredCall, form.businessPreferredCallAt),
          fieldLine(copy.fields.attachments, tipAttachments.map((file) => file.name).join(", ")),
          fieldLine(copy.fields.note, form.note),
        ].filter((line): line is string => !!line)
      );
    }

    if (product === "other") {
      lines.push(
        ...[
          fieldLine(copy.fields.client, form.otherClientName),
          fieldLine(copy.fields.phone, form.otherPhone),
          fieldLine(copy.fields.email, form.otherEmail),
          fieldLine(copy.fields.preferredCall, form.otherPreferredCallTime),
          fieldLine(copy.fields.description, form.otherDescription),
          fieldLine(copy.fields.attachments, tipAttachments.map((file) => file.name).join(", ")),
          fieldLine(copy.fields.note, form.note),
        ].filter((line): line is string => !!line)
      );
    }

    return lines;
  }, [copy, displayName, effectiveEmail, form, product, tipAttachments]);

  const submitTip = async () => {
    const validationError = validateCurrentDetails();
    if (validationError) {
      setError(validationError);
      setStep(1);
      return;
    }
    const attachmentValidationError = validateTipAttachments(tipAttachments, copy.attachments);
    if (attachmentValidationError) {
      setError(attachmentValidationError);
      setStep(1);
      return;
    }
    if (!recipientEmail) {
      setError(copy.validation.missingRecipient);
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const payload = new FormData();
      payload.append("recipientEmail", recipientEmail);
      payload.append("subject", `${copy.message.subjectPrefix} - ${productLabel(product, copy)}`);
      payload.append("text", messageLines.join("\n"));
      payload.append(
        "metadataJson",
        JSON.stringify({
          tipsterTip: true,
          tipProduct: product,
          tipProductLabel: productLabel(product, copy),
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
      setStatus(copy.message.sentTo(recipientDisplayName));
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : copy.validation.submitFailed
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderDetails = (): ReactNode => {
    if (product === "property") {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={copy.fields.fullName} value={form.propertyFullName} onChange={(value) => updateField("propertyFullName", value)} />
          <TextField label={copy.fields.birthNumber} value={form.propertyBirthNumber} onChange={(value) => updateField("propertyBirthNumber", value)} />
          <TextField label={copy.fields.insuranceAddress} value={form.propertyInsuranceAddress} onChange={(value) => updateField("propertyInsuranceAddress", value)} />
          <TextField label={copy.fields.phone} type="tel" value={form.propertyPhone} onChange={(value) => updateField("propertyPhone", value)} />
          <TextField label={copy.fields.email} type="email" value={form.propertyEmail} onChange={(value) => updateField("propertyEmail", value)} />
          <TextField label={copy.fields.preferredCall} value={form.propertyPreferredCallTime} onChange={(value) => updateField("propertyPreferredCallTime", value)} placeholder={copy.placeholders.preferredCall} />
          <AttachmentsField copy={copy.attachments} files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label={copy.fields.note} value={form.note} onChange={(value) => updateField("note", value)} placeholder={copy.placeholders.noteTip} />
        </div>
      );
    }

    if (product === "vehicle") {
      const showAresSuggestions =
        aresSuggestOpen &&
        (aresSuggestLoading ||
          !!aresSuggestError ||
          aresSuggestions.length > 0 ||
          canSearchAresQuery(aresQuery));

      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={copy.fields.vehicleClientName} value={form.vehicleClientName} onChange={(value) => updateField("vehicleClientName", value)} />
          <TextField label={copy.fields.birthNumber} value={form.vehicleBirthNumber} onChange={(value) => updateField("vehicleBirthNumber", value)} />
          <label className="space-y-1.5">
            <span className={labelClass}>{copy.ares.icoOrCompany}</span>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  type="text"
                  autoComplete="off"
                  className={fieldClass}
                  value={aresQuery}
                  onChange={(event) => handleVehicleSearchInput(event.target.value)}
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
                  placeholder={copy.ares.searchPlaceholder}
                />
                {showAresSuggestions ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-white/14 bg-[#130b28] p-1.5 shadow-[0_22px_54px_rgba(7,6,25,0.55)]">
                    {aresSuggestLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-violet-100/75">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {copy.ares.searching}
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
                        {copy.ares.noSubject}
                      </div>
                    ) : null}
                    {!aresSuggestLoading && !aresSuggestError
                      ? aresSuggestions.map((entity, index) => {
                          const ico = normalizeIco(entity.ico ?? "");
                          const name = normalizeText(entity.obchodniJmeno) || copy.ares.subjectWithoutName;
                          const address = formatAresEntityAddress(entity);

                          return (
                            <button
                              key={`${ico || name}-${index}`}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectVehicleAresEntity(entity)}
                              className="block w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
                            >
                              <span className="block text-sm font-semibold text-[#f8fafc]">
                                {name}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-violet-100/68">
                                {ico ? <span>{copy.ares.icoPrefix} {ico}</span> : null}
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
                onClick={() => void handleVehicleAresLookup()}
                disabled={aresLoading || aresSuggestLoading}
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-white/[0.06] text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                title={copy.ares.lookupTitle}
                aria-label={copy.ares.lookupTitle}
              >
                {aresLoading || aresSuggestLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <span className="block text-xs text-violet-100/48">
              {copy.ares.queryHelp}
            </span>
          </label>
          <TextField label={copy.fields.phone} type="tel" value={form.vehiclePhone} onChange={(value) => updateField("vehiclePhone", value)} />
          <TextField label={copy.fields.email} type="email" value={form.vehicleEmail} onChange={(value) => updateField("vehicleEmail", value)} />
          <TextField label={copy.fields.preferredCall} value={form.vehiclePreferredCallTime} onChange={(value) => updateField("vehiclePreferredCallTime", value)} placeholder={copy.placeholders.preferredCall} />
          <TextField label={copy.fields.spz} value={form.vehiclePlate} onChange={(value) => updateField("vehiclePlate", value.toUpperCase())} />
          <label className="space-y-1.5">
            <span className={labelClass}>{copy.fields.annualMileage}</span>
            <select
              className={fieldClass}
              value={form.vehicleAnnualMileage}
              onChange={(event) => updateField("vehicleAnnualMileage", event.target.value)}
            >
              <option value="">{copy.mileageSelect}</option>
              {MILEAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {aresError ? (
            <p className="rounded-2xl border border-rose-300/45 bg-rose-400/15 px-4 py-3 text-sm text-rose-100 sm:col-span-2">
              {aresError}
            </p>
          ) : null}
          <AttachmentsField copy={copy.attachments} files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label={copy.fields.note} value={form.note} onChange={(value) => updateField("note", value)} placeholder={copy.placeholders.noteVehicle} />
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
            <span className={labelClass}>{copy.ares.icoOrCompany}</span>
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
                  placeholder={copy.ares.searchPlaceholder}
                />
                {showAresSuggestions ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-white/14 bg-[#130b28] p-1.5 shadow-[0_22px_54px_rgba(7,6,25,0.55)]">
                    {aresSuggestLoading ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-violet-100/75">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {copy.ares.searching}
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
                        {copy.ares.noSubject}
                      </div>
                    ) : null}
                    {!aresSuggestLoading && !aresSuggestError
                      ? aresSuggestions.map((entity, index) => {
                          const ico = normalizeIco(entity.ico ?? "");
                          const name = normalizeText(entity.obchodniJmeno) || copy.ares.subjectWithoutName;
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
                                {ico ? <span>{copy.ares.icoPrefix} {ico}</span> : null}
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
                title={copy.ares.lookupTitle}
                aria-label={copy.ares.lookupTitle}
              >
                {aresLoading || aresSuggestLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <span className="block text-xs text-violet-100/48">
              {copy.ares.queryHelp}
            </span>
          </label>
          <TextField label={copy.fields.turnover} value={form.businessTurnover} onChange={(value) => updateField("businessTurnover", value)} placeholder={copy.placeholders.turnover} />
          <TextField label={copy.fields.employees} type="number" value={form.businessEmployees} onChange={(value) => updateField("businessEmployees", value)} />
          <TextField label={copy.fields.activity} value={form.businessActivity} onChange={(value) => updateField("businessActivity", value)} />
          <TextField label={copy.fields.preferredCall} value={form.businessPreferredCallAt} onChange={(value) => updateField("businessPreferredCallAt", value)} placeholder={copy.placeholders.preferredCall} />
          {form.businessCompanyName || form.businessAddress ? (
            <div className="rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100 sm:col-span-2">
              <div className="font-semibold">{form.businessCompanyName || copy.ares.subjectFallback}</div>
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
          <AttachmentsField copy={copy.attachments} files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
          <TextareaField label={copy.fields.note} value={form.note} onChange={(value) => updateField("note", value)} placeholder={copy.placeholders.noteBusiness} />
        </div>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={copy.fields.client} value={form.otherClientName} onChange={(value) => updateField("otherClientName", value)} />
        <TextField label={copy.fields.phone} type="tel" value={form.otherPhone} onChange={(value) => updateField("otherPhone", value)} />
        <TextField label={copy.fields.email} type="email" value={form.otherEmail} onChange={(value) => updateField("otherEmail", value)} />
        <TextField label={copy.fields.preferredCall} value={form.otherPreferredCallTime} onChange={(value) => updateField("otherPreferredCallTime", value)} placeholder={copy.placeholders.preferredCall} />
        <TextareaField label={copy.fields.tipDescription} value={form.otherDescription} onChange={(value) => updateField("otherDescription", value)} placeholder={copy.placeholders.otherDescription} />
        <AttachmentsField copy={copy.attachments} files={tipAttachments} onAdd={addTipAttachments} onRemove={removeTipAttachment} />
        <TextareaField label={copy.fields.note} value={form.note} onChange={(value) => updateField("note", value)} placeholder={copy.placeholders.noteTip} />
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_8%_0%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_90%_12%,rgba(168,85,247,0.16),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef4f8_48%,#f8fafc_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6 font-sans text-slate-900">
        <section className="tipster-hero-dark relative overflow-hidden rounded-[36px] border border-white/70 bg-[#08111f] p-5 text-[#f8fafc] shadow-[0_28px_80px_rgba(15,23,42,0.2)] sm:p-7 lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(45,212,191,0.28),transparent_34%),radial-gradient(circle_at_78%_14%,rgba(168,85,247,0.34),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_44%)]" />
          <div className="absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative grid gap-7 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="tipster-hero-kicker inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.hero.kicker}
              </div>
              <h1 className="tipster-hero-title mt-5 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.05em] text-[#f8fafc] sm:text-6xl">
                {copy.hero.title}
              </h1>
              <p className="tipster-hero-copy mt-5 max-w-2xl text-base leading-7 text-slate-100">
                {copy.hero.signedPrefix} <span className="tipster-hero-strong font-bold text-[#f8fafc]">{displayName}</span>. {copy.hero.recipientPrefix}{" "}
                <span className="tipster-hero-accent font-bold text-emerald-50">{recipientDisplayName}</span>
                {" "}{copy.hero.signedSuffix}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => startTip()}
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200/25 bg-[linear-gradient(135deg,#34d399_0%,#14b8a6_48%,#0ea5e9_100%)] px-5 py-3 text-sm font-black text-slate-950 shadow-[0_18px_38px_rgba(20,184,166,0.32)] transition hover:-translate-y-0.5 hover:brightness-110"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {copy.hero.addTip}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
                <Link
                  href="/tipy"
                  className="tipster-hero-secondary-button inline-flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/[0.12] px-5 py-3 text-sm font-bold text-slate-50 transition hover:bg-white/[0.18]"
                >
                  {copy.hero.myTips}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/[0.12] bg-white/[0.09] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="tipster-hero-kicker text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100/80">
                    {copy.hero.quickStart}
                  </p>
                  <h2 className="tipster-hero-panel-title mt-1 text-2xl font-black tracking-tight text-[#f8fafc]">
                    {copy.hero.chooseTipType}
                  </h2>
                </div>
                <span className="tipster-hero-card-icon inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-emerald-100">
                  <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {PRODUCT_OPTIONS.map((item) => {
                  const Icon = item.icon;
                  const accent = PRODUCT_HOME_ACCENT[item.id];
                  const translatedMeta = copy.productHomeMeta[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => startTip(item.id)}
                      className="group overflow-hidden rounded-2xl border border-white/20 bg-white/[0.12] p-3 text-left transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.16]"
                    >
                      <div className={`h-1.5 rounded-full bg-gradient-to-r ${accent}`} />
                      <div className="mt-3 flex items-start gap-3">
                        <span className="tipster-hero-card-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-slate-50">
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="tipster-hero-card-title block text-sm font-black text-[#f8fafc]">{translatedMeta.title}</span>
                          <span className="tipster-hero-card-description mt-1 block text-xs leading-5 text-slate-100">{translatedMeta.description}</span>
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

        {formOpen ? (
          <section className="relative overflow-hidden rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_80%_0%,rgba(167,139,250,0.24),transparent_34%),linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.7),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                {copy.hero.formKicker}
              </p>
              <h2 className="text-xl font-bold tracking-[-0.02em] text-[#f8fafc]">
                {copy.hero.formTitle}
              </h2>
            </div>

            <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {copy.hero.steps.map((label, index) => {
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
                          if (product !== item.id) {
                            clearAresState();
                          }
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
                          <span className="block text-sm font-semibold leading-tight text-[#f8fafc]">{copy.productLabels[item.id]}</span>
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
                      {productLabel(product, copy)}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#f8fafc]">
                      {copy.hero.detailsTitle}
                    </h2>
                  </div>
                  {renderDetails()}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                      {copy.hero.reviewKicker}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#f8fafc]">
                      {copy.hero.reviewTitle}
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
                {step === 0 ? copy.hero.close : copy.hero.back}
              </button>

              {step < 2 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(124,58,237,0.35)] transition hover:brightness-110"
                >
                  {copy.hero.next}
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
                  {copy.hero.submit}
                </button>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

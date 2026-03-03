"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Bebas_Neue,
  DM_Sans,
  Manrope,
  Montserrat,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Space_Grotesk,
} from "next/font/google";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Briefcase,
  Download,
  Hash,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Trash2,
  Type,
  User,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../plan-produkce/SplitTitle";
import { auth } from "@/app/firebase-auth";
import { db } from "@/app/firebase";

const modernSans = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const modernDisplay = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const modernSerif = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const modernPoster = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const modernPoppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const modernOutfit = Outfit({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const modernMontserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const modernJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const modernDmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
});

let html2pdfPromise: Promise<any> | null = null;

async function getHtml2Pdf() {
  if (!html2pdfPromise) {
    html2pdfPromise = import("html2pdf.js").then((mod: unknown) => {
      const m = mod as { default?: unknown } & Record<string, unknown>;
      return m.default ?? m;
    });
  }
  return html2pdfPromise;
}

function stripUnsupportedColorFunctions(input: string): string {
  return input.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
}

function copyComputedStyle(source: HTMLElement, target: HTMLElement) {
  const computed = window.getComputedStyle(source);
  const styleText = Array.from(computed)
    .map((prop) => `${prop}: ${computed.getPropertyValue(prop)};`)
    .join(" ");
  target.setAttribute("style", styleText);
}

function buildExportClone(sourceRoot: HTMLElement): HTMLElement {
  const cloneRoot = sourceRoot.cloneNode(true) as HTMLElement;
  const sourceNodes = [
    sourceRoot,
    ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*")),
  ];
  const targetNodes = [
    cloneRoot,
    ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*")),
  ];

  sourceNodes.forEach((sourceNode, idx) => {
    const targetNode = targetNodes[idx];
    if (!targetNode) return;
    copyComputedStyle(sourceNode, targetNode);
  });

  const sourceInputs = sourceRoot.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");
  const targetInputs = cloneRoot.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input, textarea, select");

  sourceInputs.forEach((sourceInput, idx) => {
    const targetInput = targetInputs[idx];
    if (!targetInput) return;
    if (
      targetInput instanceof HTMLInputElement ||
      targetInput instanceof HTMLTextAreaElement
    ) {
      targetInput.value = sourceInput.value;
    }
    if (
      sourceInput instanceof HTMLInputElement &&
      targetInput instanceof HTMLInputElement
    ) {
      targetInput.checked = sourceInput.checked;
    }
    if (
      sourceInput instanceof HTMLSelectElement &&
      targetInput instanceof HTMLSelectElement
    ) {
      targetInput.value = sourceInput.value;
    }
  });

  return cloneRoot;
}

function replaceFormFieldsForExport(root: HTMLElement) {
  const controls = Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    )
  );

  controls.forEach((control) => {
    const value =
      control instanceof HTMLSelectElement
        ? control.options[control.selectedIndex]?.text ?? ""
        : control.value ?? "";

    const span = document.createElement("span");
    span.textContent = value;
    span.setAttribute("style", control.getAttribute("style") ?? "");
    if (control.className) span.className = control.className;
    span.style.display = "inline-block";
    span.style.whiteSpace = "nowrap";
    span.style.overflow = "hidden";
    span.style.textOverflow = "clip";
    span.style.border = "none";
    span.style.background = "transparent";
    span.style.outline = "none";
    span.style.pointerEvents = "none";
    span.style.verticalAlign = "middle";
    span.style.lineHeight = "1.25";
    span.style.height = "auto";

    control.replaceWith(span);
  });
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

const DEFAULT_EDITOR_HTML = `
  <h1 style="font-size:28px;font-weight:700;margin:0 0 14px 0;">Název dokumentu</h1>
  <p style="margin:0 0 12px 0;">Sem napiš svůj text. Můžeš používat tučné písmo, odrážky i číslované seznamy.</p>
  <ul style="margin:0 0 12px 18px;">
    <li>První bod</li>
    <li>Druhý bod</li>
    <li>Třetí bod</li>
  </ul>
  <p style="margin:0;">Tip: výsledný dokument stáhneš kliknutím na tlačítko „Stáhnout PDF“.</p>
`;

function ToolbarButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-300/70 hover:text-white"
    >
      {label}
    </button>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainTextToEditorHtml(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function stripFooterDuplicateContactLines(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const cleaned = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;

    const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(trimmed);
    const hasPhone = /(?:\+?\d[\d\s-]{7,}\d)/.test(trimmed);
    const hasContactLabel = /^kontakt\s*:/i.test(trimmed);
    const looksLikeContactSummary =
      trimmed.includes("|") && (hasEmail || hasPhone || /e-?mail|mobil|telefon/i.test(trimmed));

    if (hasContactLabel) return false;
    if (looksLikeContactSummary) return false;
    return true;
  });

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ensureClosingSignature(input: string, signatureName: string): string {
  const normalized = stripFooterDuplicateContactLines(input);
  const safeName = signatureName.trim() || "Jméno poradce";
  const closing = `S přáním hezkého dne,\n${safeName}\nBohemika a.s.`;
  const hasGreeting = /s přáním hezkého dne[,!]?/i.test(normalized);
  const hasCompany = /bohemika\s*a\.s\./i.test(normalized);

  if (hasGreeting && hasCompany) {
    return normalized;
  }
  return normalized ? `${normalized}\n\n${closing}` : closing;
}

type FooterProfile = {
  fullName: string;
  jobTitle: string;
  companyId: string;
  phone: string;
  email: string;
  officeAddress: string;
};

type PlacedImage = {
  id: string;
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ImageInteraction = {
  imageId: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
  stageWidth: number;
  stageHeight: number;
};

type FontOption = {
  key: string;
  label: string;
  css: string;
  commandValue: string;
};

type TextAlignMode = "left" | "center" | "right" | "justify";

type InlineStyleState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
};

type EyeDropperLike = {
  open: () => Promise<{ sRGBHex: string }>;
};

type WindowWithEyeDropper = Window & {
  EyeDropper?: new () => EyeDropperLike;
};

type AiDocType = "dopis" | "email" | "shrnutí";
type AiTone = "formální" | "přátelský" | "obchodní";
type AiLength = "krátký" | "střední" | "dlouhý";
type AiAddressing = "vykání" | "tykání";
type PdfQualityPreset = "high" | "medium" | "low";

const FONT_OPTIONS: FontOption[] = [
  {
    key: "manrope",
    label: "Manrope",
    css: `${modernSans.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernSans.style.fontFamily,
  },
  {
    key: "space",
    label: "Space Grotesk",
    css: `${modernDisplay.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernDisplay.style.fontFamily,
  },
  {
    key: "playfair",
    label: "Playfair Display",
    css: `${modernSerif.style.fontFamily}, Georgia, serif`,
    commandValue: modernSerif.style.fontFamily,
  },
  {
    key: "bebas",
    label: "Bebas Neue",
    css: `${modernPoster.style.fontFamily}, 'Arial Narrow', sans-serif`,
    commandValue: modernPoster.style.fontFamily,
  },
  {
    key: "poppins",
    label: "Poppins",
    css: `${modernPoppins.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernPoppins.style.fontFamily,
  },
  {
    key: "outfit",
    label: "Outfit",
    css: `${modernOutfit.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernOutfit.style.fontFamily,
  },
  {
    key: "montserrat",
    label: "Montserrat",
    css: `${modernMontserrat.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernMontserrat.style.fontFamily,
  },
  {
    key: "jakarta",
    label: "Plus Jakarta Sans",
    css: `${modernJakarta.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernJakarta.style.fontFamily,
  },
  {
    key: "dm-sans",
    label: "DM Sans",
    css: `${modernDmSans.style.fontFamily}, Arial, Helvetica, sans-serif`,
    commandValue: modernDmSans.style.fontFamily,
  },
  {
    key: "inter",
    label: "Inter",
    css: "Inter, Arial, Helvetica, sans-serif",
    commandValue: "Inter",
  },
  {
    key: "georgia",
    label: "Georgia",
    css: "Georgia, 'Times New Roman', serif",
    commandValue: "Georgia",
  },
  {
    key: "arial",
    label: "Arial",
    css: "Arial, Helvetica, sans-serif",
    commandValue: "Arial",
  },
  {
    key: "times",
    label: "Times New Roman",
    css: "'Times New Roman', Times, serif",
    commandValue: "Times New Roman",
  },
  {
    key: "verdana",
    label: "Verdana",
    css: "Verdana, Geneva, sans-serif",
    commandValue: "Verdana",
  },
  {
    key: "tahoma",
    label: "Tahoma",
    css: "Tahoma, Geneva, sans-serif",
    commandValue: "Tahoma",
  },
  {
    key: "trebuchet",
    label: "Trebuchet MS",
    css: "'Trebuchet MS', Arial, sans-serif",
    commandValue: "Trebuchet MS",
  },
  {
    key: "garamond",
    label: "Garamond",
    css: "Garamond, 'Times New Roman', serif",
    commandValue: "Garamond",
  },
  {
    key: "palatino",
    label: "Palatino Linotype",
    css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
    commandValue: "Palatino Linotype",
  },
  {
    key: "book-antiqua",
    label: "Book Antiqua",
    css: "'Book Antiqua', Palatino, serif",
    commandValue: "Book Antiqua",
  },
  {
    key: "courier",
    label: "Courier New",
    css: "'Courier New', Courier, monospace",
    commandValue: "Courier New",
  },
  {
    key: "lucida",
    label: "Lucida Console",
    css: "'Lucida Console', Monaco, monospace",
    commandValue: "Lucida Console",
  },
];

const DEFAULT_FONT_KEY = FONT_OPTIONS[0]?.key ?? "manrope";
const AI_ASSISTANT_ENDPOINT =
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/aiAssistant";
const PDF_QUALITY_PRESETS: Record<
  PdfQualityPreset,
  {
    label: string;
    helperText: string;
    renderScale: number;
    imageQuality: number;
    imageCompression: "FAST" | "MEDIUM" | "SLOW";
  }
> = {
  high: {
    label: "Vysoká",
    helperText: "Nejostřejší výstup, větší velikost souboru.",
    renderScale: 3.2,
    imageQuality: 0.92,
    imageCompression: "SLOW",
  },
  medium: {
    label: "Střední",
    helperText: "Doporučeno: dobrý poměr kvalita/velikost.",
    renderScale: 2.5,
    imageQuality: 0.82,
    imageCompression: "MEDIUM",
  },
  low: {
    label: "Nízká",
    helperText: "Nejmenší soubor, nižší ostrost detailů.",
    renderScale: 1.8,
    imageQuality: 0.68,
    imageCompression: "FAST",
  },
};
const PDF_QUALITY_ORDER: PdfQualityPreset[] = ["high", "medium", "low"];
const DEFAULT_PDF_QUALITY_PRESET: PdfQualityPreset = "medium";

const TEXT_COLOR_PALETTE = [
  "#111827",
  "#374151",
  "#6b7280",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#65a30d",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#be185d",
  "#f43f5e",
  "#f59e0b",
  "#ffffff",
];

const EMPTY_FOOTER_PROFILE: FooterProfile = {
  fullName: "",
  jobTitle: "",
  companyId: "",
  phone: "",
  email: "",
  officeAddress: "",
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const waitNextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("Soubor se nepodařilo načíst."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Soubor se nepodařilo načíst."));
    reader.readAsDataURL(file);
  });

const getImageNaturalSize = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 1;
      const height = img.naturalHeight || img.height || 1;
      resolve({ width, height });
    };
    img.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
    img.src = src;
  });

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const footerStorageKey = (email?: string | null) =>
  `tvorba.footerProfile:${normalizeEmail(email) || "anon"}`;

function readLocalFooterProfile(email?: string | null): FooterProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(footerStorageKey(email));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<FooterProfile>;
    return {
      fullName: data.fullName ?? "",
      jobTitle: data.jobTitle ?? "",
      companyId: data.companyId ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      officeAddress: data.officeAddress ?? "",
    };
  } catch {
    return null;
  }
}

function writeLocalFooterProfile(email: string | null, profile: FooterProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(footerStorageKey(email), JSON.stringify(profile));
  // Pro nepřihlášený stav držíme i anonymní draft.
  if (!email) {
    window.localStorage.setItem(footerStorageKey("anon"), JSON.stringify(profile));
  }
}

export default function TvorbaPage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedEditorRangeRef = useRef<Range | null>(null);
  const editorStageRef = useRef<HTMLDivElement | null>(null);
  const headerTitleRef = useRef<HTMLDivElement | null>(null);
  const imageUploadRef = useRef<HTMLInputElement | null>(null);
  const textColorInputRef = useRef<HTMLInputElement | null>(null);
  const fontMenuRef = useRef<HTMLDivElement | null>(null);
  const textPaletteRef = useRef<HTMLDivElement | null>(null);
  const imageInteractionRef = useRef<ImageInteraction | null>(null);

  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [fontSizePx, setFontSizePx] = useState(15);
  const [fontFamilyKey, setFontFamilyKey] = useState(DEFAULT_FONT_KEY);
  const [textColor, setTextColor] = useState("#1f2937");
  const [headerDocTitle, setHeaderDocTitle] = useState("Podpisem to pro nás nekončí");
  const [placedImages, setPlacedImages] = useState<PlacedImage[]>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [footerSettingsOpen, setFooterSettingsOpen] = useState(false);
  const [pdfSettingsOpen, setPdfSettingsOpen] = useState(false);
  const [pdfPasswordEnabled, setPdfPasswordEnabled] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfQualityPreset, setPdfQualityPreset] =
    useState<PdfQualityPreset>(DEFAULT_PDF_QUALITY_PRESET);
  const [pdfSaveStatus, setPdfSaveStatus] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDocType, setAiDocType] = useState<AiDocType>("dopis");
  const [aiTone, setAiTone] = useState<AiTone>("formální");
  const [aiLength, setAiLength] = useState<AiLength>("střední");
  const [aiAddressing, setAiAddressing] = useState<AiAddressing>("vykání");
  const [aiClientName, setAiClientName] = useState("");
  const [aiContractNumber, setAiContractNumber] = useState("");
  const [aiProductName, setAiProductName] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [aiUseCurrentContext, setAiUseCurrentContext] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [textPaletteOpen, setTextPaletteOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [textAlignMode, setTextAlignMode] = useState<TextAlignMode>("left");
  const [inlineStyleState, setInlineStyleState] = useState<InlineStyleState>({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
  });
  const selectedFontOption =
    FONT_OPTIONS.find((option) => option.key === fontFamilyKey) ?? FONT_OPTIONS[0];
  const selectedPdfQuality = PDF_QUALITY_PRESETS[pdfQualityPreset];

  const collectFooterProfile = (): FooterProfile => ({
    fullName: fullName.trim(),
    jobTitle: jobTitle.trim(),
    companyId: companyId.trim(),
    phone: phone.trim(),
    email: email.trim(),
    officeAddress: officeAddress.trim(),
  });

  const applyFooterProfile = (profile: Partial<FooterProfile>, fallbackEmail?: string) => {
    setFullName(profile.fullName ?? "");
    setJobTitle(profile.jobTitle ?? "");
    setCompanyId(profile.companyId ?? "");
    setPhone(profile.phone ?? "");
    setEmail(profile.email ?? fallbackEmail ?? "");
    setOfficeAddress(profile.officeAddress ?? "");
  };

  const persistFooterDraft = async (syncCloud = false) => {
    const nextProfile = collectFooterProfile();
    writeLocalFooterProfile(userEmail, nextProfile);
    if (syncCloud && userEmail) {
      try {
        await setDoc(
          doc(db, "users", userEmail),
          {
            tvorbaFooterProfile: {
              ...nextProfile,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      } catch (error) {
        console.warn("Nepodařilo se synchronizovat draft patičky do cloudu:", error);
      }
    }
  };

  const handleSavePdfSettings = () => {
    setPdfSaveStatus(null);
    const normalizedPdfPassword = pdfPassword.trim();
    const qualityLabel = PDF_QUALITY_PRESETS[pdfQualityPreset].label;

    try {
      if (pdfPasswordEnabled && !normalizedPdfPassword) {
        setErrorText("Nejdřív zadej heslo pro zaheslování PDF.");
        setPdfSaveStatus(null);
        return;
      }
      if (pdfPasswordEnabled) {
        setPdfSaveStatus(`Heslo je připravené pro jeden export. Kvalita: ${qualityLabel}.`);
      } else {
        setPdfSaveStatus(`Nastavená kvalita PDF: ${qualityLabel}.`);
      }
      setErrorText(null);
    } catch (error) {
      console.error("Nepodařilo se uložit nastavení PDF:", error);
      setPdfSaveStatus(null);
      setErrorText("Nastavení PDF se nepodařilo potvrdit.");
    } finally {
      window.setTimeout(() => setPdfSaveStatus(null), 2400);
    }
  };

  const buildAiPrompt = () => {
    const lengthHint =
      aiLength === "krátký"
        ? "max 120 slov"
        : aiLength === "střední"
          ? "cca 150-220 slov"
          : "cca 250-400 slov";

    const clientName = aiClientName.trim();
    const contractNumber = aiContractNumber.trim();
    const productName = aiProductName.trim();
    const goal = aiGoal.trim();
    const signatureIdentity = fullName.trim();

    const editorContextRaw = editorRef.current?.innerText ?? "";
    const editorContext = editorContextRaw.replace(/\s+/g, " ").trim().slice(0, 1200);
    const signatureName = fullName.trim() || "Jméno poradce";

    const personalization: string[] = [
      `Oslovení klienta: ${aiAddressing}.`,
      clientName
        ? `Jméno klienta: ${clientName}.`
        : "Jméno klienta není zadané, použij obecné oslovení.",
      contractNumber ? `Číslo smlouvy: ${contractNumber}.` : "",
      productName ? `Produkt: ${productName}.` : "",
      goal ? `Cíl textu: ${goal}.` : "",
      signatureIdentity
        ? `Podpisové jméno autora: ${signatureIdentity}.`
        : "",
      aiUseCurrentContext && editorContext
        ? `Kontext z aktuálního rozpracovaného dokumentu: ${editorContext}`
        : "",
    ].filter(Boolean);

    return [
      "Vytvoř text dokumentu v češtině pro interní firemní použití.",
      `Typ výstupu: ${aiDocType}.`,
      `Tón: ${aiTone}.`,
      `Délka: ${lengthHint}.`,
      "Piš bez markdownu, bez uvozovek, v hotových odstavcích přímo použitelných do dokumentu.",
      "Nepiš technické poznámky ani vysvětlování.",
      "NEPIŠ do těla textu kontakt (telefon, e-mail, řádek Kontakt:, ani kontaktní podpis). Kontakty jsou v patičce dokumentu.",
      `Závěr napiš ve formátu: "S přáním hezkého dne," + nový řádek + "${signatureName}" + nový řádek + "Bohemika a.s."`,
      "",
      "Personalizace:",
      ...personalization,
      "",
      "Zadání uživatele:",
      aiPrompt.trim(),
    ].join("\n");
  };

  const handleGenerateAiText = async () => {
    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) {
      setAiError("Napiš zadání pro AI asistenta.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch(AI_ASSISTANT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildAiPrompt(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      const reply = String(payload.reply ?? "").trim();
      if (!response.ok) {
        throw new Error(reply || payload.error || "AI asistent neodpověděl.");
      }
      if (!reply) {
        throw new Error("AI asistent nevrátil text.");
      }

      const signatureName = fullName.trim() || "Jméno poradce";
      setAiResult(ensureClosingSignature(reply, signatureName));
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError &&
        /failed to fetch|networkerror|network error/i.test(error.message);
      if (isNetworkError) {
        setAiError(
          "Nepodařilo se spojit s AI službou. Zkontroluj připojení nebo dostupnost endpointu."
        );
      } else {
        console.error("Chyba AI asistenta:", error);
        setAiError(
          error instanceof Error ? error.message : "AI asistent není teď dostupný."
        );
      }
    } finally {
      setAiLoading(false);
    }
  };

  const insertAiResultIntoEditor = () => {
    if (!aiResult.trim()) return;
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const html = plainTextToEditorHtml(aiResult);
    const inserted = document.execCommand("insertHTML", false, html);

    if (!inserted && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const fragment = range.createContextualFragment(html);
      range.deleteContents();
      range.insertNode(fragment);
      selection.removeAllRanges();
    }
    syncFormattingState();
  };

  const replaceEditorWithAiResult = () => {
    if (!aiResult.trim()) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = plainTextToEditorHtml(aiResult);
    focusEditor();
    syncFormattingState();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.innerHTML.trim()) {
      editor.innerHTML = DEFAULT_EDITOR_HTML;
    }
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.fontSize = `${fontSizePx}px`;
    editor.style.fontFamily = selectedFontOption.css;
    editor.style.color = textColor;
  }, [fontSizePx, selectedFontOption.css, textColor]);

  useEffect(() => {
    const titleNode = headerTitleRef.current;
    if (!titleNode) return;
    if (titleNode.textContent !== headerDocTitle) {
      titleNode.textContent = headerDocTitle;
    }
  }, [headerDocTitle]);

  useEffect(() => {
    if (!textPaletteOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (textPaletteRef.current?.contains(target)) return;
      setTextPaletteOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [textPaletteOpen]);

  useEffect(() => {
    if (!fontMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (fontMenuRef.current?.contains(target)) return;
      setFontMenuOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [fontMenuOpen]);

  useEffect(() => {
    if (!pdfSettingsOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [pdfSettingsOpen]);

  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, (user) => {
      const loadUserProfile = async () => {
        const authEmail = user?.email ?? "";
        if (!authEmail) {
          if (!cancelled) {
            setUserEmail(null);
            const localProfile = readLocalFooterProfile(null);
            if (localProfile) {
              applyFooterProfile(localProfile);
            }
          }
          return;
        }

        const normalized = normalizeEmail(authEmail);
        if (!normalized) return;

        if (!cancelled) {
          setUserEmail(normalized);
          setEmail((prev) => prev || authEmail);
          setFullName((prev) => prev || nameFromEmail(authEmail));
          const localProfile = readLocalFooterProfile(normalized);
          if (localProfile) {
            applyFooterProfile(localProfile, authEmail);
          }
        }

        try {
          const ref = doc(db, "users", normalized);
          let snap = await getDoc(ref);
          if (!snap.exists() && authEmail !== normalized) {
            const rawRef = doc(db, "users", authEmail);
            const rawSnap = await getDoc(rawRef);
            if (rawSnap.exists()) {
              snap = rawSnap;
              try {
                await setDoc(ref, rawSnap.data(), { merge: true });
              } catch (error) {
                console.warn("Nepodařilo se migrovat user profil na lowercase email:", error);
              }
            }
          }
          if (!snap.exists() || cancelled) return;

          const data = snap.data() as { tvorbaFooterProfile?: Partial<FooterProfile> };
          const profile = data.tvorbaFooterProfile;
          if (!profile) return;

          const merged: FooterProfile = {
            fullName: profile.fullName ?? nameFromEmail(authEmail),
            jobTitle: profile.jobTitle ?? "",
            companyId: profile.companyId ?? "",
            phone: profile.phone ?? "",
            email: profile.email ?? authEmail,
            officeAddress: profile.officeAddress ?? "",
          };
          applyFooterProfile(merged, authEmail);
          writeLocalFooterProfile(normalized, merged);
        } catch (error) {
          console.error("Nepodařilo se načíst uloženou patičku:", error);
        }
      };

      void loadUserProfile();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const interaction = imageInteractionRef.current;
      if (!interaction) return;

      const deltaX = event.clientX - interaction.startClientX;
      const deltaY = event.clientY - interaction.startClientY;

      setPlacedImages((prev) =>
        prev.map((image) => {
          if (image.id !== interaction.imageId) return image;

          if (interaction.mode === "move") {
            const nextX = clampNumber(
              interaction.originX + deltaX,
              0,
              Math.max(0, interaction.stageWidth - interaction.originWidth)
            );
            const nextY = clampNumber(
              interaction.originY + deltaY,
              0,
              Math.max(0, interaction.stageHeight - interaction.originHeight)
            );
            return { ...image, x: nextX, y: nextY };
          }

          const minWidth = 40;
          const minHeight = 40;
          const maxWidth = Math.max(minWidth, interaction.stageWidth - interaction.originX);
          const maxHeight = Math.max(minHeight, interaction.stageHeight - interaction.originY);
          const nextWidth = clampNumber(interaction.originWidth + deltaX, minWidth, maxWidth);
          const nextHeight = clampNumber(interaction.originHeight + deltaY, minHeight, maxHeight);

          return { ...image, width: nextWidth, height: nextHeight };
        })
      );
    };

    const handleMouseUp = () => {
      if (!imageInteractionRef.current) return;
      imageInteractionRef.current = null;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeImageId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setPlacedImages((prev) => prev.filter((image) => image.id !== activeImageId));
      setActiveImageId(null);
      imageInteractionRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageId]);

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
  };

  const storeEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedEditorRangeRef.current = range.cloneRange();
  };

  const restoreStoredEditorSelection = (): Selection | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    const storedRange = savedEditorRangeRef.current;
    if (!storedRange) return null;
    if (!storedRange.commonAncestorContainer.isConnected) return null;
    if (!editor.contains(storedRange.commonAncestorContainer)) return null;
    selection.removeAllRanges();
    selection.addRange(storedRange.cloneRange());
    return selection;
  };

  const ensureSelectionInEditor = (): Selection | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection) return null;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedEditorRangeRef.current = range.cloneRange();
        return selection;
      }
    }
    const restoredSelection = restoreStoredEditorSelection();
    if (restoredSelection && restoredSelection.rangeCount > 0) {
      return restoredSelection;
    }
    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(editor);
    fallbackRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallbackRange);
    savedEditorRangeRef.current = fallbackRange.cloneRange();
    return selection;
  };

  const normalizeExecCommandFontSizing = (px: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll("font[size]"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });

    const sizedSpans = Array.from(editor.querySelectorAll<HTMLElement>("span[style*='font-size']"));
    sizedSpans.forEach((span) => {
      const raw = span.style.fontSize.trim().toLowerCase();
      if (!raw) return;
      if (/^\d+(\.\d+)?px$/.test(raw)) return;
      span.style.fontSize = `${px}px`;
    });
  };

  const normalizeExecCommandFontFamilies = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll<HTMLFontElement>("font"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      const face = node.getAttribute("face")?.trim();
      const inlineFamily = node.style.fontFamily.trim();
      if (face) {
        span.style.fontFamily = face;
      } else if (inlineFamily) {
        span.style.fontFamily = inlineFamily;
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });
  };

  const normalizeExecCommandTextColors = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const fontNodes = Array.from(editor.querySelectorAll<HTMLFontElement>("font[color]"));
    fontNodes.forEach((node) => {
      const span = document.createElement("span");
      const color = node.getAttribute("color")?.trim();
      if (color) {
        span.style.color = color;
      }
      while (node.firstChild) {
        span.appendChild(node.firstChild);
      }
      node.replaceWith(span);
    });
  };

  const wrapSelectedTextWithStyles = (styles: Record<string, string>) => {
    const selection = ensureSelectionInEditor();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return false;

    const span = document.createElement("span");
    Object.entries(styles).forEach(([property, value]) => {
      span.style.setProperty(property, value);
    });

    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    savedEditorRangeRef.current = nextRange.cloneRange();
    return true;
  };

  const applyFontFamily = (option: FontOption) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    if (hasSelection) {
      wrapSelectedTextWithStyles({ "font-family": option.css });
    } else {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontName", false, option.commandValue);
      normalizeExecCommandFontFamilies();
    }
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.fontFamily = option.css;
    }
    setErrorText(null);
    syncFormattingState();
  };

  const handleSelectFont = (option: FontOption) => {
    setFontFamilyKey(option.key);
    applyFontFamily(option);
    setFontMenuOpen(false);
  };

  const applyFontSize = (px: number) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, "7");
    normalizeExecCommandFontSizing(px);
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.fontSize = `${px}px`;
    }
  };

  const applyTextColor = (color: string) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection) return;
    const hasSelection = selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    normalizeExecCommandTextColors();
    if (!hasSelection && editorRef.current) {
      editorRef.current.style.color = color;
    }
  };

  const applyAndStoreTextColor = (color: string, closePalette = false) => {
    setTextColor(color);
    applyTextColor(color);
    if (closePalette) {
      setTextPaletteOpen(false);
    }
    setErrorText(null);
  };

  const handlePickColorBySample = async () => {
    if (typeof window === "undefined") return;
    const EyeDropperCtor = (window as WindowWithEyeDropper).EyeDropper;
    if (!EyeDropperCtor) {
      setErrorText("Pipeta není v tomto prohlížeči dostupná.");
      return;
    }

    try {
      const eyedropper = new EyeDropperCtor();
      const picked = await eyedropper.open();
      if (!picked?.sRGBHex) return;
      applyAndStoreTextColor(picked.sRGBHex, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Nepodařilo se načíst barvu pipetou:", error);
      setErrorText("Nepodařilo se načíst barvu pipetou.");
    }
  };

  const applyFormatBlock = (blockTag: "H2" | "P") => {
    focusEditor();
    ensureSelectionInEditor();
    const asTag = blockTag.toLowerCase();
    const asNode = `<${blockTag.toLowerCase()}>`;
    const ok = document.execCommand("formatBlock", false, asTag);
    if (!ok) {
      document.execCommand("formatBlock", false, asNode);
    }
  };

  const applyList = (ordered: boolean) => {
    focusEditor();
    const selection = ensureSelectionInEditor();
    if (!selection || selection.rangeCount === 0) return;

    const command = ordered ? "insertOrderedList" : "insertUnorderedList";
    const ok = document.execCommand(command, false);
    if (ok) return;

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const list = document.createElement(ordered ? "ol" : "ul");
    selectedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        list.appendChild(li);
      });

    range.deleteContents();
    range.insertNode(list);
    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(list);
    after.collapse(false);
    selection.addRange(after);
  };

  const applyCommand = (command: string, value?: string) => {
    focusEditor();
    ensureSelectionInEditor();
    document.execCommand(command, false, value);
  };

  const syncTextAlignMode = () => {
    try {
      if (document.queryCommandState("justifyCenter")) {
        setTextAlignMode("center");
        return;
      }
      if (document.queryCommandState("justifyRight")) {
        setTextAlignMode("right");
        return;
      }
      if (document.queryCommandState("justifyFull")) {
        setTextAlignMode("justify");
        return;
      }
      setTextAlignMode("left");
    } catch {
      // Ignored: some browsers can throw for queryCommandState in edge cases.
    }
  };

  const syncInlineStyleState = () => {
    try {
      setInlineStyleState({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
      });
    } catch {
      // Ignored: some browsers can throw for queryCommandState in edge cases.
    }
  };

  const applyTextAlign = (mode: TextAlignMode) => {
    const commandByMode: Record<TextAlignMode, string> = {
      left: "justifyLeft",
      center: "justifyCenter",
      right: "justifyRight",
      justify: "justifyFull",
    };
    applyCommand(commandByMode[mode]);
    setTextAlignMode(mode);
  };

  const applyInlineStyle = (command: "bold" | "italic" | "underline" | "strikeThrough") => {
    applyCommand(command);
    window.requestAnimationFrame(() => {
      syncInlineStyleState();
    });
  };

  const syncFormattingState = () => {
    storeEditorSelection();
    syncTextAlignMode();
    syncInlineStyleState();
  };

  const startImageInteraction = (
    event: ReactMouseEvent<HTMLElement>,
    imageId: string,
    mode: "move" | "resize"
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const stage = editorStageRef.current;
    if (!stage) return;
    const image = placedImages.find((item) => item.id === imageId);
    if (!image) return;

    const stageRect = stage.getBoundingClientRect();
    imageInteractionRef.current = {
      imageId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: image.x,
      originY: image.y,
      originWidth: image.width,
      originHeight: image.height,
      stageWidth: Math.max(1, stageRect.width),
      stageHeight: Math.max(1, stageRect.height),
    };
    setActiveImageId(imageId);
    document.body.style.userSelect = "none";
  };

  const removeActiveImage = () => {
    if (!activeImageId) return;
    setPlacedImages((prev) => prev.filter((image) => image.id !== activeImageId));
    setActiveImageId(null);
    imageInteractionRef.current = null;
  };

  const handleInsertImageClick = () => {
    imageUploadRef.current?.click();
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorText("Vybraný soubor není obrázek.");
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      const { width: naturalWidth, height: naturalHeight } = await getImageNaturalSize(src);
      const stageRect = editorStageRef.current?.getBoundingClientRect();
      const stageWidth = Math.max(300, stageRect?.width ?? 640);
      const stageHeight = Math.max(300, stageRect?.height ?? 730);

      const maxWidth = Math.min(260, Math.max(120, stageWidth - 24));
      const startWidth = clampNumber(naturalWidth, 120, maxWidth);
      const ratio = naturalHeight / Math.max(1, naturalWidth);
      const startHeight = clampNumber(startWidth * ratio, 90, Math.max(120, stageHeight - 20));

      const imageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `img-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setPlacedImages((prev) => {
        const offset = (prev.length % 5) * 14;
        const nextX = clampNumber(16 + offset, 0, Math.max(0, stageWidth - startWidth));
        const nextY = clampNumber(16 + offset, 0, Math.max(0, stageHeight - startHeight));
        return [
          ...prev,
          {
            id: imageId,
            src,
            alt: file.name || "Vložený obrázek",
            x: nextX,
            y: nextY,
            width: startWidth,
            height: startHeight,
          },
        ];
      });
      setActiveImageId(imageId);
      setErrorText(null);
    } catch (error) {
      console.error("Nepodařilo se vložit obrázek:", error);
      setErrorText("Obrázek se nepodařilo načíst.");
    }
  };

  const handleDownloadPdf = async () => {
    if (!pageRef.current) return;
    const normalizedPdfPassword = pdfPassword.trim();
    if (pdfPasswordEnabled && !normalizedPdfPassword) {
      setErrorText("Pro zaheslování PDF zadej heslo v Nastavení PDF.");
      setPdfSettingsOpen(true);
      return;
    }
    setDownloading(true);
    setErrorText(null);
    let cleanup: (() => void) | null = null;

    try {
      imageInteractionRef.current = null;
      document.body.style.userSelect = "";
      setActiveImageId(null);
      await waitNextFrame();
      await waitNextFrame();

      const html2pdf = await getHtml2Pdf();
      const now = new Date();
      const filename = `tvorba_${now.toISOString().slice(0, 10)}.pdf`;
      const qualityConfig = PDF_QUALITY_PRESETS[pdfQualityPreset];
      const source = pageRef.current;
      const rect = source.getBoundingClientRect();

      const wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.left = "-10000px";
      wrapper.style.top = "0";
      wrapper.style.width = `${Math.ceil(rect.width)}px`;
      wrapper.style.height = `${Math.ceil(rect.height)}px`;
      wrapper.style.overflow = "hidden";
      wrapper.style.pointerEvents = "none";

      const exportNode = buildExportClone(source);
      replaceFormFieldsForExport(exportNode);
      exportNode
        .querySelectorAll<HTMLElement>("[data-export-ignore='1']")
        .forEach((node) => node.remove());
      const exportEditables = Array.from(
        exportNode.querySelectorAll<HTMLElement>("[contenteditable]")
      );
      exportEditables.forEach((editable) => {
        editable.removeAttribute("contenteditable");
        editable.removeAttribute("spellcheck");
        editable.style.setProperty("caret-color", "transparent", "important");
      });

      const exportEditorFrame = exportNode.querySelector<HTMLElement>(
        "[data-editor-frame='1']"
      );
      if (exportEditorFrame) {
        exportEditorFrame.style.setProperty("border", "0", "important");
        exportEditorFrame.style.setProperty("border-top", "0", "important");
        exportEditorFrame.style.setProperty("border-right", "0", "important");
        exportEditorFrame.style.setProperty("border-bottom", "0", "important");
        exportEditorFrame.style.setProperty("border-left", "0", "important");
        exportEditorFrame.style.setProperty("background", "transparent", "important");
        exportEditorFrame.style.setProperty("border-radius", "0", "important");
        exportEditorFrame.style.setProperty("box-shadow", "none", "important");
        exportEditorFrame.style.setProperty("outline", "none", "important");
      }
      const exportHeaderTitleWrap = exportNode.querySelector<HTMLElement>(
        "[data-header-title-wrap='1']"
      );
      if (exportHeaderTitleWrap) {
        exportHeaderTitleWrap.style.setProperty("max-width", "66mm", "important");
        exportHeaderTitleWrap.style.setProperty("overflow", "visible", "important");
      }
      const exportHeaderTitle = exportNode.querySelector<HTMLElement>("[data-header-title='1']");
      if (exportHeaderTitle) {
        exportHeaderTitle.style.setProperty("white-space", "normal", "important");
        exportHeaderTitle.style.setProperty("overflow", "visible", "important");
        exportHeaderTitle.style.setProperty("text-overflow", "clip", "important");
        exportHeaderTitle.style.setProperty("overflow-wrap", "anywhere", "important");
        exportHeaderTitle.style.setProperty("display", "block", "important");
        exportHeaderTitle.style.setProperty("line-height", "1.45", "important");
        exportHeaderTitle.style.setProperty("min-height", "8mm", "important");
        exportHeaderTitle.style.setProperty("padding-bottom", "1mm", "important");
        exportHeaderTitle.style.setProperty("width", "58mm", "important");
      }
      const exportFooterGrid = exportNode.querySelector<HTMLElement>("[data-footer-grid='1']");
      if (exportFooterGrid) {
        exportFooterGrid.style.setProperty(
          "grid-template-columns",
          "56mm 56mm 62mm",
          "important"
        );
        exportFooterGrid.style.setProperty("column-gap", "4mm", "important");
        exportFooterGrid.style.setProperty("font-size", "10.5px", "important");
        exportFooterGrid.style.setProperty("line-height", "1.2", "important");
      }
      exportNode.querySelectorAll<HTMLElement>("[data-footer-value='1']").forEach((el) => {
        el.style.setProperty("white-space", "nowrap", "important");
        el.style.setProperty("overflow-wrap", "normal", "important");
        el.style.setProperty("word-break", "keep-all", "important");
      });
      exportNode.querySelectorAll<HTMLElement>("*").forEach((el) => {
        const styleText = el.getAttribute("style") ?? "";
        if (!/dashed/i.test(styleText)) return;
        el.style.setProperty("border", "0", "important");
      });
      exportNode.querySelectorAll<HTMLElement>("[data-image-item='1']").forEach((el) => {
        el.style.setProperty("box-shadow", "none", "important");
        el.style.setProperty("outline", "none", "important");
      });
      exportNode.style.width = "210mm";
      exportNode.style.height = "297mm";
      exportNode.style.minHeight = "297mm";
      exportNode.style.maxHeight = "297mm";
      exportNode.style.overflow = "hidden";
      exportNode.style.boxShadow = "none";
      exportNode.style.margin = "0";
      wrapper.appendChild(exportNode);
      document.body.appendChild(wrapper);
      cleanup = () => wrapper.remove();

      const opt: any = {
        image: { type: "jpeg", quality: qualityConfig.imageQuality },
        html2canvas: {
          scale: qualityConfig.renderScale,
          backgroundColor: "#ffffff",
          useCORS: true,
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
          windowWidth: Math.ceil(rect.width),
          windowHeight: Math.ceil(rect.height),
          onclone: (doc: Document) => {
            doc.querySelectorAll("link[rel='stylesheet']").forEach((n) => n.remove());
            doc.querySelectorAll("style").forEach((node) => {
              const original = node.textContent ?? "";
              node.textContent = stripUnsupportedColorFunctions(original);
            });
            doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
              const inline = el.getAttribute("style");
              if (!inline) return;
              if (/(?:oklch|lab)\(/i.test(inline)) {
                el.setAttribute("style", stripUnsupportedColorFunctions(inline));
              }
            });
          },
        },
      };

      const worker = (html2pdf() as any).from(exportNode).set(opt).toCanvas();
      const canvas = (await worker.get("canvas")) as HTMLCanvasElement;
      const jspdfMod = await import("jspdf");
      const PdfCtor = (jspdfMod as { jsPDF?: any }).jsPDF;
      const pdfOptions: Record<string, unknown> = {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true,
        precision: 10,
      };
      if (pdfPasswordEnabled && normalizedPdfPassword) {
        pdfOptions.encryption = {
          userPassword: normalizedPdfPassword,
          ownerPassword: normalizedPdfPassword,
          userPermissions: ["print", "modify", "copy", "annot-forms"],
        };
      }
      const pdf = new PdfCtor(pdfOptions);
      const image = canvas.toDataURL("image/jpeg", qualityConfig.imageQuality);
      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const canvasWidth = Math.max(1, canvas.width);
      const canvasHeight = Math.max(1, canvas.height);
      const canvasAspect = canvasWidth / canvasHeight;
      const pageAspect = pageWidthMm / pageHeightMm;

      let renderWidthMm = pageWidthMm;
      let renderHeightMm = pageHeightMm;
      if (canvasAspect > pageAspect) {
        renderHeightMm = pageWidthMm / canvasAspect;
      } else {
        renderWidthMm = pageHeightMm * canvasAspect;
      }

      const offsetX = (pageWidthMm - renderWidthMm) / 2;
      const offsetY = (pageHeightMm - renderHeightMm) / 2;
      pdf.addImage(
        image,
        "JPEG",
        offsetX,
        offsetY,
        renderWidthMm,
        renderHeightMm,
        undefined,
        qualityConfig.imageCompression
      );
      pdf.save(filename);
      if (pdfPasswordEnabled) {
        setPdfPassword("");
        setPdfPasswordEnabled(false);
        setPdfSaveStatus("Jednorázové heslo bylo použito a smazáno.");
        window.setTimeout(() => setPdfSaveStatus(null), 2600);
      }
      cleanup();
      cleanup = null;
    } catch (error) {
      console.error("Nepodařilo se stáhnout PDF:", error);
      setErrorText("PDF se nepodařilo vygenerovat. Zkus to prosím znovu.");
    } finally {
      setDownloading(false);
      if (cleanup) cleanup();
    }
  };

  const handleSaveFooterProfile = async () => {
    setSavingFooter(true);
    setSaveStatus(null);

    try {
      const nextProfile = collectFooterProfile();

      const hasAnyValue = Object.values(nextProfile).some((v) => v.length > 0);
      const profileToSave = hasAnyValue ? nextProfile : EMPTY_FOOTER_PROFILE;
      writeLocalFooterProfile(userEmail, profileToSave);

      if (userEmail) {
        await setDoc(
          doc(db, "users", userEmail),
          {
            tvorbaFooterProfile: {
              ...profileToSave,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      }

      setSaveStatus(
        userEmail
          ? "Údaje patičky byly uloženy k uživateli."
          : "Údaje byly uloženy lokálně (pro cloud se přihlas)."
      );
    } catch (error) {
      console.error("Nepodařilo se uložit údaje patičky:", error);
      setSaveStatus("Cloud uložení se nepovedlo, ale lokální draft je uložen.");
    } finally {
      setSavingFooter(false);
      window.setTimeout(() => setSaveStatus(null), 2400);
    }
  };

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-[1360px] space-y-6">
        <header className="space-y-2">
          <SplitTitle text="Tvorba" />
          <Link
            href="/pomucky"
            className="inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[332px_1fr]">
          <aside className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-slate-950/90 via-slate-900/82 to-slate-900/72 p-4 backdrop-blur-2xl shadow-[0_22px_60px_rgba(0,0,0,0.5)] space-y-4">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-blue-300" />
                <h2 className="text-sm font-semibold text-white">Editor obsahu</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton label="Nadpis" onClick={() => applyFormatBlock("H2")} />
                <ToolbarButton label="Odrážky" onClick={() => applyList(false)} />
              </div>
              <div className="inline-flex overflow-hidden rounded-xl border border-slate-500/70 bg-slate-600/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyInlineStyle("bold")}
                  className={`inline-flex h-10 w-14 items-center justify-center text-3xl font-semibold transition ${
                    inlineStyleState.bold
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Tučně"
                  title="Tučně"
                >
                  <span className="text-[34px] leading-none">B</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyInlineStyle("italic")}
                  className={`inline-flex h-10 w-14 items-center justify-center border-l border-white/15 text-3xl transition ${
                    inlineStyleState.italic
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Kurzíva"
                  title="Kurzíva"
                >
                  <span className="text-[34px] italic leading-none">I</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyInlineStyle("underline")}
                  className={`inline-flex h-10 w-14 items-center justify-center border-l border-white/15 text-3xl transition ${
                    inlineStyleState.underline
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Podtržení"
                  title="Podtržení"
                >
                  <span className="text-[34px] underline leading-none">U</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyInlineStyle("strikeThrough")}
                  className={`inline-flex h-10 w-14 items-center justify-center border-l border-white/15 text-3xl transition ${
                    inlineStyleState.strikeThrough
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Přeškrtnutí"
                  title="Přeškrtnutí"
                >
                  <span className="text-[34px] line-through leading-none">S</span>
                </button>
              </div>
              <div className="inline-flex overflow-hidden rounded-xl border border-slate-500/70 bg-slate-600/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyTextAlign("left")}
                  className={`inline-flex h-10 w-16 items-center justify-center transition ${
                    textAlignMode === "left"
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Zarovnat vlevo"
                  title="Zarovnat vlevo"
                >
                  <AlignLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyTextAlign("center")}
                  className={`inline-flex h-10 w-16 items-center justify-center border-l border-white/15 transition ${
                    textAlignMode === "center"
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Zarovnat na střed"
                  title="Zarovnat na střed"
                >
                  <AlignCenter className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyTextAlign("right")}
                  className={`inline-flex h-10 w-16 items-center justify-center border-l border-white/15 transition ${
                    textAlignMode === "right"
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Zarovnat vpravo"
                  title="Zarovnat vpravo"
                >
                  <AlignRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyTextAlign("justify")}
                  className={`inline-flex h-10 w-16 items-center justify-center border-l border-white/15 transition ${
                    textAlignMode === "justify"
                      ? "bg-blue-500/85 text-white"
                      : "bg-transparent text-slate-100 hover:bg-white/10"
                  }`}
                  aria-label="Zarovnat do bloku"
                  title="Zarovnat do bloku"
                >
                  <AlignJustify className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="w-[84px] text-xs font-semibold text-slate-300">Font</label>
                  <div ref={fontMenuRef} className="relative flex-1">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setFontMenuOpen((prev) => !prev)}
                      className="inline-flex w-full items-center justify-between rounded-xl border border-slate-500/70 bg-slate-800/85 px-2.5 py-1.5 text-xs font-semibold text-slate-100 outline-none transition hover:border-blue-300/70"
                      style={{ fontFamily: selectedFontOption.css }}
                      aria-label="Vybrat font"
                    >
                      <span>{selectedFontOption.label}</span>
                      <span className="ml-2 text-[10px] text-slate-300">{fontMenuOpen ? "▲" : "▼"}</span>
                    </button>
                    {fontMenuOpen && (
                      <div className="absolute left-0 top-9 z-30 min-w-[224px] overflow-hidden rounded-xl border border-slate-500/70 bg-slate-950/95 shadow-[0_16px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                        {FONT_OPTIONS.map((option) => {
                          const isSelected = option.key === fontFamilyKey;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelectFont(option)}
                              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[18px] leading-none transition ${
                                isSelected
                                  ? "bg-blue-500/30 text-white"
                                  : "text-slate-100 hover:bg-white/10"
                              }`}
                              style={{ fontFamily: option.css }}
                            >
                              <span>{option.label}</span>
                              {isSelected && <span className="text-xs font-semibold text-blue-200">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-[84px] text-xs font-semibold text-slate-300">Velikost textu</label>
                  <select
                    value={fontSizePx}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 15;
                      setFontSizePx(next);
                      applyFontSize(next);
                    }}
                    className="w-[94px] rounded-xl border border-slate-500/70 bg-slate-800/85 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-blue-300/70"
                  >
                    {[12, 14, 15, 16, 18, 20, 24, 28, 32].map((size) => (
                      <option key={size} value={size} className="text-slate-900">
                        {size}px
                      </option>
                    ))}
                  </select>

                  <div ref={textPaletteRef} className="relative">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setTextPaletteOpen((prev) => !prev)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-500/70 bg-slate-800/85 transition hover:border-blue-300/70"
                      aria-label="Barva textu"
                      title="Barva textu"
                    >
                      <span
                        className="h-4 w-4 rounded-sm border border-white/50"
                        style={{ backgroundColor: textColor }}
                      />
                    </button>

                    <input
                      ref={textColorInputRef}
                      type="color"
                      value={textColor}
                      onChange={(e) => applyAndStoreTextColor(e.target.value, true)}
                      className="sr-only"
                      aria-label="Vlastní barva textu"
                    />

                    {textPaletteOpen && (
                      <div className="absolute right-0 top-10 z-30 w-[226px] rounded-xl border border-slate-500/70 bg-slate-950/95 p-2 shadow-[0_16px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                        <div className="grid grid-cols-8 gap-1.5">
                          {TEXT_COLOR_PALETTE.map((color) => {
                            const isSelected = textColor.toLowerCase() === color.toLowerCase();
                            return (
                              <button
                                key={color}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyAndStoreTextColor(color, true)}
                                className="h-6 w-6 rounded-md border transition"
                                style={{
                                  backgroundColor: color,
                                  borderColor: isSelected ? "#3b82f6" : "rgba(148,163,184,0.45)",
                                  boxShadow: isSelected ? "0 0 0 1px rgba(59,130,246,0.85)" : "none",
                                }}
                                aria-label={`Nastavit barvu ${color}`}
                                title={color}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => textColorInputRef.current?.click()}
                            className="rounded-lg border border-slate-500/70 bg-slate-800/85 px-2 py-1 text-[11px] font-semibold text-slate-100 transition hover:border-blue-300/70 hover:text-white"
                          >
                            Vlastní
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => void handlePickColorBySample()}
                            className="rounded-lg border border-blue-300/55 bg-blue-500/20 px-2 py-1 text-[11px] font-semibold text-blue-100 transition hover:bg-blue-500/30"
                          >
                            Pipeta
                          </button>
                          <span className="ml-auto rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">
                            {textColor.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleInsertImageClick}
                  className="inline-flex items-center gap-2 rounded-xl border border-blue-300/55 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-blue-500/30"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Vložit obrázek
                </button>
                <button
                  type="button"
                  onClick={removeActiveImage}
                  disabled={!activeImageId}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Smazat vybraný
                </button>
              </div>
              <input
                ref={imageUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleImageFileChange(e)}
              />
            </section>

            <section className="space-y-2">
              <button
                type="button"
                role="switch"
                aria-checked={aiPanelOpen}
                onClick={() => {
                  setAiPanelOpen((prev) => !prev);
                  setTextPaletteOpen(false);
                  setFontMenuOpen(false);
                }}
                className="inline-flex w-full items-center justify-between rounded-xl border border-blue-400/35 bg-slate-900/55 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:border-blue-300/65 hover:bg-slate-900/70"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-300" />
                  AI asistent
                </span>
                <span
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                    aiPanelOpen
                      ? "border-blue-300/70 bg-blue-500/75 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
                      : "border-white/25 bg-slate-700/80"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      aiPanelOpen ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </span>
              </button>

              {aiPanelOpen && (
                <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-slate-950/50 p-3">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => {
                      setAiPrompt(e.target.value);
                      setAiError(null);
                    }}
                    placeholder="Co chceš napsat? Např. klientský dopis o doplnění podkladů."
                    rows={4}
                    className="w-full resize-y rounded-xl border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={aiDocType}
                      onChange={(e) => setAiDocType(e.target.value as AiDocType)}
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-blue-300/70"
                    >
                      <option value="dopis" className="text-slate-900">
                        Dopis
                      </option>
                      <option value="email" className="text-slate-900">
                        E-mail
                      </option>
                      <option value="shrnutí" className="text-slate-900">
                        Shrnutí
                      </option>
                    </select>

                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value as AiTone)}
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-blue-300/70"
                    >
                      <option value="formální" className="text-slate-900">
                        Formální
                      </option>
                      <option value="obchodní" className="text-slate-900">
                        Obchodní
                      </option>
                      <option value="přátelský" className="text-slate-900">
                        Přátelský
                      </option>
                    </select>

                    <select
                      value={aiLength}
                      onChange={(e) => setAiLength(e.target.value as AiLength)}
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2 py-1.5 text-xs font-semibold text-slate-100 outline-none focus:border-blue-300/70"
                    >
                      <option value="krátký" className="text-slate-900">
                        Krátký
                      </option>
                      <option value="střední" className="text-slate-900">
                        Střední
                      </option>
                      <option value="dlouhý" className="text-slate-900">
                        Dlouhý
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={aiClientName}
                      onChange={(e) => setAiClientName(e.target.value)}
                      placeholder="Jméno klienta"
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                    />
                    <input
                      value={aiContractNumber}
                      onChange={(e) => setAiContractNumber(e.target.value)}
                      placeholder="Číslo smlouvy"
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                    />
                    <input
                      value={aiProductName}
                      onChange={(e) => setAiProductName(e.target.value)}
                      placeholder="Produkt"
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                    />
                    <input
                      value={aiGoal}
                      onChange={(e) => setAiGoal(e.target.value)}
                      placeholder="Cíl textu"
                      className="rounded-xl border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-blue-500/25 bg-slate-950/65 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-slate-300">Oslovení</label>
                      <select
                        value={aiAddressing}
                        onChange={(e) => setAiAddressing(e.target.value as AiAddressing)}
                        className="w-[120px] rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1 text-xs font-semibold text-slate-100 outline-none focus:border-blue-300/70"
                      >
                        <option value="vykání" className="text-slate-900">
                          Vykání
                        </option>
                        <option value="tykání" className="text-slate-900">
                          Tykání
                        </option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] text-slate-200">
                      <span>Zahrnout aktuální text z editoru jako kontext</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={aiUseCurrentContext}
                        onClick={() => setAiUseCurrentContext((prev) => !prev)}
                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                          aiUseCurrentContext
                            ? "border-blue-300/70 bg-blue-500/75 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
                            : "border-white/25 bg-slate-700/80"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            aiUseCurrentContext ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGenerateAiText()}
                    disabled={aiLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300/60 bg-blue-500/25 px-4 py-2 text-sm font-semibold text-blue-50 transition hover:bg-blue-500/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {aiLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {aiLoading ? "AI generuje…" : "Generovat text"}
                  </button>

                  {aiError && <p className="text-xs text-rose-300">{aiError}</p>}

                  {aiResult && (
                    <div className="space-y-2 rounded-xl border border-blue-500/20 bg-slate-900/65 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-200/85">
                        Návrh AI
                      </p>
                      <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-100 whitespace-pre-wrap">
                        {aiResult}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={insertAiResultIntoEditor}
                          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-blue-300/70 hover:text-white"
                        >
                          Vložit do kurzoru
                        </button>
                        <button
                          type="button"
                          onClick={replaceEditorWithAiResult}
                          className="rounded-lg border border-blue-300/60 bg-blue-500/20 px-2.5 py-1.5 text-xs font-semibold text-blue-50 transition hover:bg-blue-500/30"
                        >
                          Nahradit celý text
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setPdfSettingsOpen(true);
                  setTextPaletteOpen(false);
                  setFontMenuOpen(false);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-blue-300/70 hover:text-white"
              >
                Nastavení PDF
              </button>
              <p className="text-xs text-slate-300">Kvalita: {selectedPdfQuality.label}</p>
              {pdfPasswordEnabled && (
                <p className="text-xs text-blue-300">PDF bude zaheslované.</p>
              )}
            </section>

            <section className="space-y-2">
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                disabled={downloading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300/70 bg-blue-500/25 px-4 py-2.5 text-sm font-semibold text-blue-50 shadow-[0_10px_28px_rgba(59,130,246,0.28)] transition hover:bg-blue-500/35 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Generuji PDF…" : "Stáhnout PDF"}
              </button>
              {errorText && <p className="text-xs text-rose-300">{errorText}</p>}
            </section>
          </aside>

          <section className="rounded-3xl border border-white/15 bg-gradient-to-br from-black/75 via-black/65 to-black/55 p-4 md:p-6 backdrop-blur-2xl shadow-[0_22px_60px_rgba(0,0,0,0.55)] overflow-auto">
            <div className="mx-auto w-fit rounded-2xl border border-white/15 bg-slate-900/70 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div
                ref={pageRef}
                className="relative w-[210mm] min-h-[297mm] overflow-hidden bg-white text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
              >
                <header className="relative h-[42mm] border-b border-slate-200 px-[14mm] py-[1mm] flex items-center">
                  <Image
                    src="/icons/nadpislogo.jpg"
                    alt="Bohemika logo"
                    width={3840}
                    height={2457}
                    className="h-[46mm] w-auto object-contain"
                    priority
                  />
                  <div data-header-title-wrap="1" className="absolute right-[14mm] top-[8mm] text-right">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      Bohemika a.s.
                    </p>
                    <div
                      ref={headerTitleRef}
                      data-header-title="1"
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setHeaderDocTitle((e.currentTarget.textContent ?? "").trim())}
                      className="w-[56mm] bg-transparent p-0 text-right text-sm font-semibold leading-[1.35] text-slate-800 outline-none"
                      aria-label="Nadpis dokumentu v hlavičce"
                    >
                      {headerDocTitle}
                    </div>
                  </div>
                </header>

                <main className="px-[14mm] pt-[8mm] pb-[44mm]">
                  <div
                    ref={editorStageRef}
                    className="relative min-h-[193mm]"
                    onMouseDown={() => setActiveImageId(null)}
                  >
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      data-editor-frame="1"
                      style={{
                        fontSize: `${fontSizePx}px`,
                        fontFamily: selectedFontOption.css,
                        color: textColor,
                      }}
                      onKeyUp={syncFormattingState}
                      onMouseUp={syncFormattingState}
                      onMouseDown={() => setActiveImageId(null)}
                      className="min-h-[193mm] rounded-xl border border-dashed border-slate-300 bg-white/80 px-3 py-3 leading-relaxed text-slate-800 outline-none [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5"
                    />
                    <div className="pointer-events-none absolute inset-0" data-image-layer="1">
                      {placedImages.map((image) => {
                        const isActive = activeImageId === image.id;
                        return (
                          <div
                            key={image.id}
                            data-image-item="1"
                            onMouseDown={(event) => startImageInteraction(event, image.id, "move")}
                            className="pointer-events-auto absolute relative overflow-visible bg-transparent"
                            style={{
                              left: `${image.x}px`,
                              top: `${image.y}px`,
                              width: `${image.width}px`,
                              height: `${image.height}px`,
                              cursor: "move",
                            }}
                          >
                            <Image
                              src={image.src}
                              alt={image.alt}
                              fill
                              unoptimized
                              sizes="320px"
                              draggable={false}
                              className="pointer-events-none select-none object-contain"
                            />

                            {isActive && (
                              <>
                                <button
                                  type="button"
                                  data-export-ignore="1"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    removeActiveImage();
                                  }}
                                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/50 bg-slate-950/70 text-[11px] font-semibold text-white shadow-md"
                                  aria-label="Smazat obrázek"
                                >
                                  ×
                                </button>

                                <button
                                  type="button"
                                  data-export-ignore="1"
                                  onMouseDown={(event) => startImageInteraction(event, image.id, "resize")}
                                  className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize rounded-tl-md border border-white/50 bg-blue-500/80"
                                  aria-label="Změnit velikost obrázku"
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </main>

                <footer className="absolute inset-x-0 bottom-0 h-[26mm] border-t border-slate-200 bg-slate-50/95 px-[12mm] py-[4mm]">
                  <div className="flex h-full items-center justify-center">
                    <div
                      data-footer-grid="1"
                      className="grid grid-cols-[56mm_56mm_62mm] gap-x-[4mm] text-left text-[10.5px] leading-[1.2] text-slate-700"
                    >
                      <div className="space-y-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <User className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {fullName || "—"}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <Briefcase className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {jobTitle || "—"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <Phone className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {phone || "—"}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <Mail className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {email || "—"}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <Hash className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {companyId ? `IČ: ${companyId}` : "IČ: —"}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="inline-flex w-4 items-center justify-center text-slate-500">
                            <MapPin className="h-3.5 w-3.5" />
                          </span>
                          <span data-footer-value="1" className="whitespace-nowrap">
                            {officeAddress || "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </footer>
              </div>
            </div>
          </section>
        </div>

        {pdfSettingsOpen && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.2),rgba(2,6,23,0.9)_55%)] p-4 backdrop-blur-md"
            onMouseDown={() => setPdfSettingsOpen(false)}
          >
            <div
              className="w-full max-w-[560px] max-h-[92vh] overflow-y-auto rounded-2xl border border-blue-400/35 bg-gradient-to-br from-slate-950/96 via-[#050c24]/95 to-slate-950/96 p-4 shadow-[0_26px_76px_rgba(0,0,0,0.7)] ring-1 ring-blue-300/15"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Nastavení PDF</h2>
                  <p className="mt-1 text-xs text-slate-300/90">
                    Bezpečnost exportu a správa údajů v patičce.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPdfSettingsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-slate-200 transition hover:border-blue-300/70 hover:bg-blue-500/20 hover:text-white"
                  aria-label="Zavřít nastavení PDF"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-blue-400/25 bg-gradient-to-br from-slate-900/86 to-slate-950/80 p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.2)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-300/35 bg-blue-500/20 text-blue-100">
                        <Lock className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-100">Zaheslovat PDF</p>
                        <p className="text-xs text-slate-300/90">
                          Jednorázové heslo pro příští export PDF.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pdfPasswordEnabled}
                      onClick={() => {
                        setPdfSaveStatus(null);
                        setPdfPasswordEnabled((prev) => {
                          const next = !prev;
                          if (!next) setPdfPassword("");
                          return next;
                        });
                      }}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                        pdfPasswordEnabled
                          ? "border-blue-300/70 bg-blue-500/75 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]"
                          : "border-white/25 bg-slate-700/80"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          pdfPasswordEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  {pdfPasswordEnabled && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                      <input
                        type="password"
                        value={pdfPassword}
                        onChange={(event) => {
                          setPdfPassword(event.target.value);
                          setPdfSaveStatus(null);
                        }}
                        placeholder="Zadej heslo pro otevření PDF"
                        className="w-full rounded-xl border border-blue-300/35 bg-slate-900/75 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/75"
                      />
                      <p className="text-xs text-slate-300/95">
                        Heslo se použije jen jednou a po stažení PDF se automaticky smaže.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-sm font-semibold text-slate-100">Kvalita exportu PDF</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PDF_QUALITY_ORDER.map((quality) => {
                        const cfg = PDF_QUALITY_PRESETS[quality];
                        const isSelected = pdfQualityPreset === quality;
                        return (
                          <button
                            key={quality}
                            type="button"
                            onClick={() => {
                              setPdfQualityPreset(quality);
                              setPdfSaveStatus(null);
                            }}
                            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? "border-blue-300/80 bg-blue-500/30 text-white"
                                : "border-white/20 bg-white/10 text-slate-200 hover:border-blue-300/60"
                            }`}
                          >
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-300/95">{selectedPdfQuality.helperText}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={handleSavePdfSettings}
                      className="inline-flex items-center justify-center rounded-xl border border-blue-300/60 bg-blue-500/25 px-3 py-1.5 text-xs font-semibold text-blue-50 transition hover:bg-blue-500/35"
                    >
                      {pdfPasswordEnabled ? "Potvrdit heslo pro 1 export" : "Potvrdit nastavení"}
                    </button>
                    {pdfSaveStatus && (
                      <p className="text-xs font-medium text-blue-200">{pdfSaveStatus}</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFooterSettingsOpen((prev) => !prev)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-gradient-to-r from-slate-800/75 to-slate-700/65 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-blue-300/70 hover:text-white"
                >
                  {footerSettingsOpen ? "Nastavení patičky (skrýt)" : "Nastavení patičky"}
                </button>

                {footerSettingsOpen && (
                  <div className="space-y-3 rounded-2xl border border-blue-500/25 bg-slate-900/60 p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.2)]">
                    <h3 className="text-sm font-semibold text-white">Patička dokumentu</h3>
                    <div className="space-y-2">
                      <input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="Jméno a příjmení"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                      <input
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="Pozice"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                      <input
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="IČ"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="Mobil"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="E-mail"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                      <input
                        value={officeAddress}
                        onChange={(e) => setOfficeAddress(e.target.value)}
                        onBlur={() => void persistFooterDraft(true)}
                        placeholder="Adresa kanceláře"
                        className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-blue-300/70"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveFooterProfile()}
                      disabled={savingFooter}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-300/55 bg-blue-500/22 px-4 py-2.5 text-sm font-semibold text-blue-50 transition hover:bg-blue-500/32 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingFooter ? "Ukládám…" : "Uložit údaje patičky"}
                    </button>
                    {saveStatus && <p className="text-xs text-blue-300">{saveStatus}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

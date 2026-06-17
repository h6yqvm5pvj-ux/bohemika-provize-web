export const TOOL_DOCUMENT_SECTION_CPP_LIFE = "cpp-life" as const;
export const TOOL_DOCUMENT_SECTION_KOOPERATIVA_LIFE = "kooperativa-life" as const;
export const TOOL_DOCUMENT_SECTION_MAXIMA_LIFE = "maxima-life" as const;
export const TOOL_DOCUMENT_SECTION_ALLIANZ_LIFE = "allianz-life" as const;
export const TOOL_DOCUMENT_SECTION_PILLOW_LIFE = "pillow-life" as const;
export const TOOL_DOCUMENT_SECTION_CPP_PROPERTY = "cpp-property" as const;
export const TOOL_DOCUMENT_SECTION_KOOPERATIVA_PROPERTY = "kooperativa-property" as const;
export const TOOL_DOCUMENT_SECTION_MAXIMA_PROPERTY = "maxima-property" as const;
export const TOOL_DOCUMENT_SECTION_ALLIANZ_PROPERTY = "allianz-property" as const;
export const TOOL_DOCUMENT_SECTION_PILLOW_PROPERTY = "pillow-property" as const;

export const TOOL_DOCUMENT_SECTIONS = [
  TOOL_DOCUMENT_SECTION_CPP_LIFE,
  TOOL_DOCUMENT_SECTION_KOOPERATIVA_LIFE,
  TOOL_DOCUMENT_SECTION_MAXIMA_LIFE,
  TOOL_DOCUMENT_SECTION_ALLIANZ_LIFE,
  TOOL_DOCUMENT_SECTION_PILLOW_LIFE,
  TOOL_DOCUMENT_SECTION_CPP_PROPERTY,
  TOOL_DOCUMENT_SECTION_KOOPERATIVA_PROPERTY,
  TOOL_DOCUMENT_SECTION_MAXIMA_PROPERTY,
  TOOL_DOCUMENT_SECTION_ALLIANZ_PROPERTY,
  TOOL_DOCUMENT_SECTION_PILLOW_PROPERTY,
] as const;

export type ToolDocumentSection = (typeof TOOL_DOCUMENT_SECTIONS)[number];
export type ToolDocumentTab = string;

export type ToolDocumentInsurerKey = "cpp" | "kooperativa" | "maxima" | "allianz" | "pillow";

export type ToolDocumentInsurer = {
  key: ToolDocumentInsurerKey;
  slug: string;
  title: string;
  shortLabel: string;
  logo: string;
  section: ToolDocumentSection;
  description: string;
};

export type LifeToolDocumentInsurer = ToolDocumentInsurer;
export type PropertyToolDocumentInsurer = ToolDocumentInsurer;

const DOCUMENT_INSURER_BASE = {
  cpp: {
    key: "cpp",
    slug: "cpp",
    title: "ČPP",
    shortLabel: "ČPP",
    logo: "/icons/cpp.png",
  },
  kooperativa: {
    key: "kooperativa",
    slug: "kooperativa",
    title: "Kooperativa",
    shortLabel: "Kooperativa",
    logo: "/icons/koop-v2.png",
  },
  maxima: {
    key: "maxima",
    slug: "maxima",
    title: "MAXIMA",
    shortLabel: "MAXIMA",
    logo: "/icons/maxima.png",
  },
  allianz: {
    key: "allianz",
    slug: "allianz",
    title: "Allianz",
    shortLabel: "Allianz",
    logo: "/icons/allianz.png",
  },
  pillow: {
    key: "pillow",
    slug: "pillow",
    title: "Pillow",
    shortLabel: "Pillow",
    logo: "/icons/pillow.png",
  },
} as const satisfies Record<
  ToolDocumentInsurerKey,
  { key: ToolDocumentInsurerKey; slug: string; title: string; shortLabel: string; logo: string }
>;

export const LIFE_TOOL_DOCUMENT_INSURERS = [
  {
    ...DOCUMENT_INSURER_BASE.cpp,
    section: TOOL_DOCUMENT_SECTION_CPP_LIFE,
    description: "Dokumenty a materiály pro životní pojištění ČPP.",
  },
  {
    ...DOCUMENT_INSURER_BASE.kooperativa,
    section: TOOL_DOCUMENT_SECTION_KOOPERATIVA_LIFE,
    description: "Dokumenty a materiály pro životní pojištění Kooperativa.",
  },
  {
    ...DOCUMENT_INSURER_BASE.maxima,
    section: TOOL_DOCUMENT_SECTION_MAXIMA_LIFE,
    description: "Dokumenty a materiály pro životní pojištění MAXIMA.",
  },
  {
    ...DOCUMENT_INSURER_BASE.allianz,
    section: TOOL_DOCUMENT_SECTION_ALLIANZ_LIFE,
    description: "Dokumenty a materiály pro životní pojištění Allianz.",
  },
  {
    ...DOCUMENT_INSURER_BASE.pillow,
    section: TOOL_DOCUMENT_SECTION_PILLOW_LIFE,
    description: "Dokumenty a materiály pro životní pojištění Pillow.",
  },
] as const satisfies readonly LifeToolDocumentInsurer[];

export const PROPERTY_TOOL_DOCUMENT_INSURERS = [
  {
    ...DOCUMENT_INSURER_BASE.cpp,
    section: TOOL_DOCUMENT_SECTION_CPP_PROPERTY,
    description: "Dokumenty a materiály pro majetkové pojištění ČPP.",
  },
  {
    ...DOCUMENT_INSURER_BASE.kooperativa,
    section: TOOL_DOCUMENT_SECTION_KOOPERATIVA_PROPERTY,
    description: "Dokumenty a materiály pro majetkové pojištění Kooperativa.",
  },
  {
    ...DOCUMENT_INSURER_BASE.maxima,
    section: TOOL_DOCUMENT_SECTION_MAXIMA_PROPERTY,
    description: "Dokumenty a materiály pro majetkové pojištění MAXIMA.",
  },
  {
    ...DOCUMENT_INSURER_BASE.allianz,
    section: TOOL_DOCUMENT_SECTION_ALLIANZ_PROPERTY,
    description: "Dokumenty a materiály pro majetkové pojištění Allianz.",
  },
  {
    ...DOCUMENT_INSURER_BASE.pillow,
    section: TOOL_DOCUMENT_SECTION_PILLOW_PROPERTY,
    description: "Dokumenty a materiály pro majetkové pojištění Pillow.",
  },
] as const satisfies readonly PropertyToolDocumentInsurer[];

export type ToolDocumentTabInfo = {
  id: ToolDocumentTab;
  label: string;
  emoji: string;
};

export const DEFAULT_TOOL_DOCUMENT_EMOJI = "📄";

export const DEFAULT_TOOL_DOCUMENT_TABS = [
  { id: "prehled", label: "Přehled dokumentů", emoji: "📄" },
  { id: "vypoved", label: "Výpověď smlouvy", emoji: "📝" },
] as const satisfies readonly ToolDocumentTabInfo[];

export type ToolDocumentRecord = {
  id: string;
  section: ToolDocumentSection;
  tab: ToolDocumentTab;
  tabLabel: string;
  emoji: string;
  title: string;
  description: string;
  body: string[];
  fileName: string;
  contentType: string;
  isImage: boolean;
  fileSize: number | null;
  isDefault: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
  isInvalid?: boolean;
  invalidAt?: string | null;
  invalidByEmail?: string | null;
};

export type ToolDocumentsListResponse = {
  ok: true;
  canManage: boolean;
  documents: ToolDocumentRecord[];
};

export const CPP_STORNO_RULES = [
  "Storno dohodou může být akceptováno s datem účinnosti až 1 měsíc zpětně, doporučuji ponechat pravidlo vždy k výročnímu dni počátku pojištění.",
  "Storno dohodu lze již zasílat i na smlouvy životního pojištění.",
  "Žádost může být bez uvedení důvodu.",
  "Žádost musí být na formuláři ŽP DOKUMENTY Žádanky Výpověď_dohodou_062023, naleznete ji pod tlačítkem Stáhnout.",
  "Neřeší se pojistné události (počet pojistných událostí na dané pojistné smlouvě nemá vliv na povolení storna dohodou).",
  "Pokud bylo storno dohodou k určitému datu již jednou zamítnuto, pak jej už k tomuto datu provést nelze. Řešením je dodat nové storno dohodu k jinému datu (např. o 1 den dříve nebo později).",
  "Storno dohodou zasílejte vždy nejdříve na můj mail jindrich.hajek@bohemika.eu a až týden po zaslání dokument nahrajte k pojistné smlouvě do SUSu.",
  "Pokud storno dohodou nahrajete nejdříve do SUSu k pojistné smlouvě a na můj mail ho zašlete až poté, nebo ho vůbec na můj mail nepošlete, bude zpracováno jako standardní žádost, nikoliv jako storno dohodou.",
] as const;

export const CPP_PROPERTY_DOMEX_RULES = [
  "Podmínky pro přidělení slevy: Dodržení daného minimálního celkového pojistného před slevami.",
  "Podmínky pro přidělení slevy: Povolení marketingu (i toho ostatního).",
  "Podmínky pro přidělení slevy: Nastavení automatické valorizace (neplatí u PS, kde je pojištění bytu na cenu obvyklou).",
  "Podmínky pro přidělení slevy: V případě přesjednání smluv ČPP musí být navíc i navýšení skutečně placeného ročního pojistného po slevě nejméně o 2 000 Kč.",
  "Minimální pojistné před slevami: 12 000 Kč pro slevu ve výši 50 %.",
  "Minimální pojistné před slevami: 9 000 Kč pro slevu ve výši 45 %.",
  "Minimální pojistné před slevami: 8 000 Kč pro slevu ve výši 40 %.",
  "Minimální pojistné před slevami: 7 000 Kč pro slevu ve výši 35 %.",
  "Minimální pojistné před slevami: 5 000 Kč pro slevu ve výši 30 %.",
  "V případě náhrady smlouvy nutnost navýšení alespoň o 2 000 Kč oproti původní smlouvě.",
  "Jak o slevu požádat: Stáhni PDF návrhu smlouvy (nesmí být zaškrtnuta žádná sleva).",
  "Jak o slevu požádat: Odešli ji mailem na marcela.hofmanova@bohemika.eu.",
] as const;

export const CPP_PROPERTY_BYTEX_RULES = [
  "Podmínky pro přidělení slevy: Dodržení daného minimálního celkového pojistného před slevami.",
  "Podmínky pro přidělení slevy: Povolení marketingu (i toho ostatního). V případě sjednání na IČ není podmíněno.",
  "Podmínky pro přidělení slevy: V případě přesjednání smluv ČPP musí být navíc i navýšení skutečně placeného ročního pojistného po slevě nejméně o 2 000 Kč.",
  "Minimální pojistné před slevami: 10 000 Kč pro slevu ve výši 50 %.",
  "Minimální pojistné před slevami: 9 000 Kč pro slevu ve výši 45 %.",
  "Minimální pojistné před slevami: 8 000 Kč pro slevu ve výši 40 %.",
  "Minimální pojistné před slevami: 7 000 Kč pro slevu ve výši 35 %.",
  "V případě náhrady smlouvy nutnost navýšení alespoň o 2 000 Kč oproti původní smlouvě.",
  "Jak o slevu požádat: Stáhni PDF návrhu smlouvy (nesmí být zaškrtnuta žádná sleva).",
  "Jak o slevu požádat: Odešli ji mailem na marcela.hofmanova@bohemika.eu.",
] as const;

export const DEFAULT_CPP_LIFE_DOCUMENTS: ToolDocumentRecord[] = [
  {
    id: "max-denni-cpp",
    section: TOOL_DOCUMENT_SECTION_CPP_LIFE,
    tab: "prehled",
    tabLabel: "Přehled dokumentů",
    emoji: "📄",
    title: "MAXIMÁLNÍ POJISTNÉ ČÁSTKY DENNÍHO ODŠKODNÉHO",
    description: "Otevřít náhled JPEG a stáhnout.",
    body: [],
    fileName: "maxdenni.jpg",
    contentType: "image/jpeg",
    isImage: true,
    fileSize: null,
    isDefault: true,
    publishedAt: null,
    updatedAt: null,
    updatedByEmail: null,
  },
  {
    id: "cpp-storno-dohodou",
    section: TOOL_DOCUMENT_SECTION_CPP_LIFE,
    tab: "vypoved",
    tabLabel: "Výpověď smlouvy",
    emoji: "📝",
    title: "STORNO Dohodou",
    description: "Otevřít detail pravidel",
    body: [...CPP_STORNO_RULES],
    fileName: "zpneonstornodohodou.pdf",
    contentType: "application/pdf",
    isImage: false,
    fileSize: null,
    isDefault: true,
    publishedAt: null,
    updatedAt: null,
    updatedByEmail: null,
  },
  {
    id: "cpp-vypoved-zp",
    section: TOOL_DOCUMENT_SECTION_CPP_LIFE,
    tab: "vypoved",
    tabLabel: "Výpověď smlouvy",
    emoji: "📝",
    title: "Výpověď smlouvy",
    description: "Otevřít formulář ke stažení",
    body: [],
    fileName: "Výpověď_PS_ŽP_062023.pdf",
    contentType: "application/pdf",
    isImage: false,
    fileSize: null,
    isDefault: true,
    publishedAt: null,
    updatedAt: null,
    updatedByEmail: null,
  },
];

export const DEFAULT_CPP_PROPERTY_DOCUMENTS: ToolDocumentRecord[] = [
  {
    id: "cpp-domex-prima-sleva",
    section: TOOL_DOCUMENT_SECTION_CPP_PROPERTY,
    tab: "prehled",
    tabLabel: "Přehled dokumentů",
    emoji: "🏠",
    title: "Přímá sleva DOMEX",
    description:
      "Podklady a interní postup pro práci s přímou slevou DOMEX u majetkového pojištění.",
    body: [...CPP_PROPERTY_DOMEX_RULES],
    fileName: "",
    contentType: "",
    isImage: false,
    fileSize: null,
    isDefault: true,
    publishedAt: null,
    updatedAt: null,
    updatedByEmail: null,
  },
  {
    id: "cpp-bytex-prima-sleva",
    section: TOOL_DOCUMENT_SECTION_CPP_PROPERTY,
    tab: "prehled",
    tabLabel: "Přehled dokumentů",
    emoji: "🏢",
    title: "Přímá sleva BYTEX",
    description:
      "Podklady a interní postup pro práci s přímou slevou BYTEX u majetkového pojištění.",
    body: [...CPP_PROPERTY_BYTEX_RULES],
    fileName: "",
    contentType: "",
    isImage: false,
    fileSize: null,
    isDefault: true,
    publishedAt: null,
    updatedAt: null,
    updatedByEmail: null,
  },
];

export const DEFAULT_TOOL_DOCUMENTS = [
  ...DEFAULT_CPP_LIFE_DOCUMENTS,
  ...DEFAULT_CPP_PROPERTY_DOCUMENTS,
];

export const isToolDocumentSection = (value: unknown): value is ToolDocumentSection =>
  TOOL_DOCUMENT_SECTIONS.includes(value as ToolDocumentSection);

export const defaultToolDocumentsForSection = (
  section: ToolDocumentSection
): ToolDocumentRecord[] => DEFAULT_TOOL_DOCUMENTS.filter((doc) => doc.section === section);

export const getLifeToolDocumentInsurerBySlug = (
  slug: string | null | undefined
): LifeToolDocumentInsurer =>
  LIFE_TOOL_DOCUMENT_INSURERS.find((item) => item.slug === slug) ??
  LIFE_TOOL_DOCUMENT_INSURERS[0];

export const getPropertyToolDocumentInsurerBySlug = (
  slug: string | null | undefined
): PropertyToolDocumentInsurer =>
  PROPERTY_TOOL_DOCUMENT_INSURERS.find((item) => item.slug === slug) ??
  PROPERTY_TOOL_DOCUMENT_INSURERS[0];

export const getToolDocumentSectionHref = (
  section: ToolDocumentSection
): string | null => {
  const life = LIFE_TOOL_DOCUMENT_INSURERS.find((item) => item.section === section);
  if (life) return `/pomucky/dokumenty/zivotni-pojisteni/${life.slug}`;

  const property = PROPERTY_TOOL_DOCUMENT_INSURERS.find((item) => item.section === section);
  if (property) return `/pomucky/dokumenty/majetek/${property.slug}`;

  return null;
};

export const normalizeToolDocumentTabId = (value: unknown): ToolDocumentTab =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    : "";

export const isToolDocumentTab = (value: unknown): value is ToolDocumentTab =>
  typeof value === "string" && /^[a-z0-9._-]{1,48}$/.test(value.trim());

export const getDefaultToolDocumentTab = (tab: ToolDocumentTab): ToolDocumentTabInfo | null =>
  DEFAULT_TOOL_DOCUMENT_TABS.find((item) => item.id === tab) ?? null;

export const normalizeToolDocumentTabLabel = (
  value: unknown,
  fallback = "Nová sekce"
): string => {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (label || fallback).slice(0, 80);
};

export const normalizeToolDocumentEmoji = (
  value: unknown,
  fallback = DEFAULT_TOOL_DOCUMENT_EMOJI
): string => {
  const emoji = typeof value === "string" ? value.trim() : "";
  return Array.from(emoji || fallback).slice(0, 4).join("");
};

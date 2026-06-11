import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  PRODUCT_CAPABILITIES,
  type CapabilityEntry,
} from "@/app/pomucky/zaznam/productCapabilities";
import { resolveLifeComparisonSourcePayload } from "@/lib/server/lifeComparisonSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const TOP_PREMIUM_OPENAI_MODEL =
  process.env.TOP_PREMIUM_OPENAI_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5-mini";
const ENABLE_TOP_PREMIUM_WEB_SEARCH =
  (process.env.TOP_PREMIUM_ENABLE_WEB_SEARCH?.trim() || "1") !== "0";
const TOP_PREMIUM_WEB_SEARCH_CONTEXT_SIZE =
  process.env.TOP_PREMIUM_WEB_SEARCH_CONTEXT_SIZE?.trim() || "low";

const TOP_PREMIUM_CHAT_RATE_LIMIT = 30;
const TOP_PREMIUM_CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const AI_PROMPT_MAX_LEN = 8_000;
const AI_HISTORY_ITEM_MAX_LEN = 1_500;
const AI_HISTORY_MAX_ITEMS = 16;
const MAX_UPSTREAM_MESSAGE_LEN = 2_000;
const AI_TIMEOUT_MS = 30_000;
const AI_WEB_TIMEOUT_MS = 45_000;
const OPENAI_MAX_OUTPUT_TOKENS = 1_300;
const OPENAI_WEB_MAX_OUTPUT_TOKENS = 1_900;
const OPENAI_RETRY_MAX_OUTPUT_TOKENS = 2_600;
const OPENAI_WEB_RETRY_MAX_OUTPUT_TOKENS = 3_200;
const MAX_SOURCES_IN_REPLY = 1;
const MAX_REPLY_BULLETS = 5;
const RAG_MAX_CHUNKS = 6;
const RAG_MAX_CHUNK_BODY_LEN = 820;
const RAG_COMPARISON_CHUNK_LIMIT = 420;
const RAG_COMPARISON_VALUE_PREVIEW = 4;
const EXTERNAL_SOURCE_HINT_MAX_ITEMS = 3;

const TOP_PREMIUM_SYSTEM_PROMPT = [
  "Jsi Bohemka Asistent, interní AI pomocník pro finanční poradce v ČR.",
  "Specializace: pojištění, investice a investiční zlato.",
  "Odpovídej stručně v bodech (typicky 3 až 5 bodů).",
  "Jeden bod má být krátký, ideálně jedna věta.",
  "Používej přiměřeně emoji pro orientaci (např. ✅ ⚠️ 👉), ale nepřeháněj to.",
  "Když uživatel naváže další otázkou, drž kontext předchozí konverzace.",
  "Odpovídej vždy česky, věcně a prakticky. Když to pomůže, použij stručné body.",
  "Při popisu interního postupu nevymýšlej obecná menu ani kroky, které nejsou potvrzené.",
  "Pro ukládání smlouvy v interní app používej kontext: Kalkulačka -> Přidat smlouvu -> Sepsáno.",
  "V hlavním textu nikdy nevypisuj URL adresy ani markdown odkazy typu [text](url).",
  "V hlavním textu nevytvářej vlastní sekci Zdroje/Sources.",
  "Když je zapnutý web režim, můžeš dohledat aktuální externí informace a přidej zdroje.",
  "Nemáš přístup k interním smlouvám, databázi smluv ani detailům klientských smluv.",
  "Pokud uživatel žádá vyhledat, ověřit nebo vypsat konkrétní smlouvy, vždy to odmítni a nabídni obecné doporučení bez práce se smlouvami.",
  "Nikdy netvrď, že jsi smlouvy viděl nebo že je umíš načíst.",
].join("\n");

const ADD_CONTRACT_KNOWLEDGE_REPLY = [
  "✅ Jasný interní postup je přes Kalkulačku:",
  "",
  "1) 👉 Otevři Kalkulačka a nahoře přepni na režim „Přidat smlouvu“.",
  "2) 📦 Vyber produkt.",
  "3) 📄 Pokud je dostupný import, nahraj PDF smlouvy (nebo přetáhni soubor).",
  "4) ⚙️ Z PDF se doplní dostupná data automaticky (typicky číslo smlouvy, klient, datum sjednání, datum počátku, částka, frekvence podle produktu).",
  "5) ✍️ Ručně doplň/zkontroluj povinná pole: částka, jméno klienta, číslo smlouvy, datum sjednání, datum počátku (a případně další produktová pole).",
  "6) 🔎 Zkontroluj hlášky na duplicitu čísla smlouvy a případná upozornění u dat.",
  "7) ✅ Klikni na tlačítko „Sepsáno“.",
  "",
  "⚠️ Tohle je správný flow v aktuální webové aplikaci, ne přes samostatné menu „Smlouvy -> Nová smlouva“.",
].join("\n");

const DOMEX_DISCOUNT_KNOWLEDGE_REPLY = [
  "✅ Pro slevu DOMEX používej primárně interní návod:",
  "Pomůcky -> Dokumenty -> Majetek -> Přímá sleva DOMEX.",
  "",
  "Podmínky pro přidělení slevy:",
  "1) Dodržení minimálního celkového pojistného před slevami.",
  "2) Povolení marketingu (i toho ostatního).",
  "3) Nastavení automatické valorizace (neplatí u PS, kde je pojištění bytu na cenu obvyklou).",
  "4) U přesjednání smluv ČPP navýšení skutečně placeného ročního pojistného po slevě min. o 2 000 Kč.",
  "",
  "Minimální pojistné před slevami (DOMEX):",
  "- 12 000 Kč -> sleva 50 %",
  "- 9 000 Kč -> sleva 45 %",
  "- 8 000 Kč -> sleva 40 %",
  "- 7 000 Kč -> sleva 35 %",
  "- 5 000 Kč -> sleva 30 %",
  "",
  "Postup žádosti:",
  "- Stáhni PDF návrhu smlouvy (nesmí být zaškrtnuta žádná sleva).",
  "- Odešli ji mailem na marcela.hofmanova@bohemika.eu.",
].join("\n");

type WebsiteFeature = {
  id: string;
  title: string;
  path: string;
  summary: string;
  keywords: string[];
  howTo?: string[];
};

const WEBSITE_FEATURES: WebsiteFeature[] = [
  {
    id: "kalkulacka",
    title: "Kalkulačka",
    path: "/kalkulacka",
    summary:
      "Výpočet provizí, režim Přidat smlouvu, import PDF smlouvy, doplnění dat a uložení přes tlačítko Sepsáno.",
    keywords: [
      "kalkulacka",
      "provize",
      "sepsano",
      "pridat smlouvu",
      "nahrat pdf",
      "pdf smlouvy",
      "frekvence",
      "pojistne",
    ],
  },
  {
    id: "smlouvy",
    title: "Smlouvy",
    path: "/smlouvy",
    summary: "Přehled a detail již uložených smluv, filtrace a další práce se záznamy.",
    keywords: ["smlouvy", "detail smlouvy", "prehled smluv", "zmena pojistneho", "filtr smluv"],
  },
  {
    id: "pomucky",
    title: "Pomůcky",
    path: "/pomucky",
    summary: "Rozcestník interních nástrojů (AI asistent, dokumenty, srovnávače, zlato, kalkulačky).",
    keywords: ["pomucky", "nastroje", "tooly", "argumenty", "dokumenty"],
  },
  {
    id: "ai-asistent",
    title: "AI Asistent",
    path: "/pomucky/ai-asistent",
    summary:
      "Bohemka Asistent pro interní dotazy k pojištění, investicím a investičnímu zlatu (bez přístupu ke smlouvám).",
    keywords: ["ai asistent", "bohemka asistent", "chat", "asistent", "top premium chat"],
  },
  {
    id: "srovnavac-zivotniho",
    title: "Srovnávač životního pojištění",
    path: "/pomucky/srovnavac-zivotniho-pojisteni",
    summary: "Porovnání produktových podmínek životního pojištění a asistovaný chat ke srovnání.",
    keywords: ["srovnavac", "zivotni pojisteni", "invalidita", "vyluky", "produkty"],
  },
  {
    id: "zlato",
    title: "Zlato",
    path: "/pomucky/zlato",
    summary: "Data, přehled a výpočty pro investiční zlato.",
    keywords: ["zlato", "investicni zlato", "spot", "unce", "gold"],
  },
  {
    id: "investicni-kalkulacka",
    title: "Investiční kalkulačka",
    path: "/pomucky/investicni-kalkulacka",
    summary: "Výpočet hodnoty investice při pravidelných vkladech.",
    keywords: ["investicni kalkulacka", "vklady", "zhodnoceni", "investice"],
  },
  {
    id: "zaznam",
    title: "Záznam z jednání",
    path: "/pomucky/zaznam",
    summary: "Pomůcka pro strukturované vyplnění záznamu z jednání.",
    keywords: ["zaznam z jednani", "zaznam", "jednani"],
  },
  {
    id: "proklepka",
    title: "Proklepka vozidla",
    path: "/pomucky/proklepka-vozidla",
    summary: "Kontrola informací o vozidle (nájezd, historie, data o vozidle).",
    keywords: ["proklepka", "vozidlo", "vin", "historie vozidla"],
  },
  {
    id: "naceneni-skla",
    title: "Nacenění čelního skla",
    path: "/pomucky/naceneni-celniho-skla",
    summary: "Odhad ceny výměny čelního skla a doporučeného limitu pojištění.",
    keywords: ["celni sklo", "naceneni skla", "sklo", "limit skla"],
  },
  {
    id: "posta",
    title: "Pošta",
    path: "/posta",
    summary: "Interní poštovní rozhraní.",
    keywords: ["posta", "mail", "email"],
  },
  {
    id: "nastaveni",
    title: "Nastavení",
    path: "/nastaveni",
    summary: "Uživatelské a systémové nastavení aplikace.",
    keywords: ["nastaveni", "profil", "timeline", "uzivatel"],
  },
  {
    id: "intranet",
    title: "Intranet",
    path: "/intranet",
    summary: "Interní nástěnka a týmový obsah.",
    keywords: ["intranet", "nastenka", "prispevky", "tym"],
  },
  {
    id: "muj-tym",
    title: "Můj tým",
    path: "/muj-tym",
    summary: "Přehled týmových informací.",
    keywords: ["muj tym", "tym", "podrizeni", "manazer"],
  },
  {
    id: "cashflow",
    title: "Cashflow",
    path: "/cashflow",
    summary: "Přehled cashflow a finančních metrik.",
    keywords: ["cashflow", "tok penez", "finance"],
  },
  {
    id: "argumenty",
    title: "Argumenty",
    path: "/pomucky/argumenty",
    summary: "Přehled argumentace proti nejčastějším námitkám klientů.",
    keywords: ["argumenty", "namitky", "prodejni argumentace"],
  },
  {
    id: "skolici-materialy",
    title: "Školící materiály",
    path: "/pomucky/skolici-materialy",
    summary: "Onboarding a produktové školení na jednom místě.",
    keywords: ["skoleni", "materialy", "onboarding", "vzdelavani"],
  },
  {
    id: "dokumenty",
    title: "Dokumenty",
    path: "/pomucky/dokumenty",
    summary: "Interní šablony a podklady, včetně členění podle oblastí.",
    keywords: ["dokumenty", "sablony", "podklady", "materialy"],
  },
  {
    id: "dokumenty-zivotni",
    title: "Dokumenty - Životní pojištění",
    path: "/pomucky/dokumenty/zivotni-pojisteni",
    summary: "Produktové dokumenty pro životní pojištění.",
    keywords: ["dokumenty zivotni", "zivotni pojisteni dokumenty", "cpp zivotni"],
  },
  {
    id: "dokumenty-majetek",
    title: "Dokumenty - Majetek",
    path: "/pomucky/dokumenty/majetek",
    summary: "Dokumenty a pravidla pro majetkové pojištění.",
    keywords: ["dokumenty majetek", "domex", "bytex", "majetek dokumenty"],
  },
  {
    id: "tvorba-pdf",
    title: "Tvorba PDF",
    path: "/pomucky/tvorba",
    summary: "Editor dokumentu s exportem do PDF a AI podporou textu.",
    keywords: ["tvorba pdf", "editor", "dopis", "pdf export"],
  },
  {
    id: "statistika",
    title: "Statistika",
    path: "/pomucky/statistika",
    summary: "Denní statistika oslovení, schůzek a produkce.",
    keywords: ["statistika", "denni statistika", "schuzky", "produkce"],
  },
  {
    id: "export-produkce",
    title: "Export produkce",
    path: "/pomucky/export-produkce",
    summary: "Export produkce do PDF a sdílení e-mailem.",
    keywords: ["export produkce", "pdf produkce", "odeslat mailem"],
    howTo: [
      "Otevři Export produkce.",
      "Nastav filtr období a rozsah dat.",
      "Zkontroluj souhrn a spusť export do PDF.",
      "Případně použij odeslání e-mailem ze stejné stránky.",
    ],
  },
  {
    id: "plan-produkce",
    title: "Plán produkce",
    path: "/pomucky/plan-produkce",
    summary: "Plánování cílové produkce a orientační odměny.",
    keywords: ["plan produkce", "cil produkce", "odmena", "planovani"],
  },
  {
    id: "projekce-vykonu",
    title: "Projekce výkonu",
    path: "/pomucky/projekce-vykonu",
    summary: "Vizualizace budoucí výplaty a výkonu.",
    keywords: ["projekce vykonu", "budouci vyplata", "vykon"],
  },
  {
    id: "nastaveni-zivotniho-pojisteni",
    title: "Jak nastavit Smrt, Invaliditu a Pracovní neschopnost ?",
    path: "/pomucky/nastaveni-zivotniho-pojisteni",
    summary:
      "Stepper pro nastavení smrti, pracovní neschopnosti a invalidity podle příjmu, závazků a dluhů.",
    keywords: [
      "nastaveni zivotniho pojisteni",
      "smrt",
      "pracovni neschopnost",
      "neschopenka",
      "pn",
      "invalidita",
      "1. stupen",
      "2. stupen",
      "3. stupen",
      "pojistna castka",
    ],
  },
  {
    id: "srovnavac-trvale-nasledky",
    title: "Srovnávač trvalých následků",
    path: "/pomucky/srovnavac-trvalych-nasledku",
    summary: "Porovnání podmínek trvalých následků úrazu.",
    keywords: ["trvale nasledky", "srovnavac trvalych nasledku", "uraz"],
  },
  {
    id: "karta-klienta",
    title: "Karta klienta",
    path: "/pomucky/karta-klienta",
    summary: "Přehled klientské karty a souvisejících informací.",
    keywords: ["karta klienta", "klientska karta", "klient"],
  },
  {
    id: "data-o-vozidle",
    title: "Data o vozidle",
    path: "/pomucky/data-o-vozidle",
    summary: "Datový přehled o vozidle s návazností na nacenění.",
    keywords: ["data o vozidle", "vin data", "vozidlo data"],
  },
  {
    id: "naceneni-vozidla",
    title: "Nacenění vozidla",
    path: "/pomucky/naceneni-vozidla",
    summary: "Odhad tržní hodnoty vozidla pro nastavení pojištění.",
    keywords: ["naceneni vozidla", "trzni hodnota", "havarijni pojisteni"],
  },
  {
    id: "struktura",
    title: "Struktura",
    path: "/pomucky/struktura",
    summary: "Interní přehled organizační struktury.",
    keywords: ["struktura", "organizacni struktura", "tymova struktura"],
  },
  {
    id: "zprava-tymu",
    title: "Zpráva týmu",
    path: "/pomucky/zprava-tymu",
    summary: "Nástroj pro odesílání zpráv / push notifikací týmu.",
    keywords: ["zprava tymu", "push zprava", "tymova zprava"],
  },
  {
    id: "cashflow-page",
    title: "Cashflow detail",
    path: "/cashflow",
    summary: "Detailní plán příjmů a výdajů v čase.",
    keywords: ["cashflow plan", "mesicni cashflow", "toky"],
  },
  {
    id: "muj-tym-sin-slavy",
    title: "Můj tým - Síň slávy",
    path: "/muj-tym/sin-slavy",
    summary: "Týmové žebříčky a výkonnostní přehledy.",
    keywords: ["sin slavy", "zebricky", "tymove vysledky"],
  },
  {
    id: "posta-page",
    title: "Pošta",
    path: "/posta",
    summary: "Přehled interní pošty a komunikace.",
    keywords: ["posta", "interni posta", "mailbox"],
  },
  {
    id: "admin-zadosti",
    title: "Admin - Žádosti",
    path: "/admin/zadosti",
    summary: "Administrace uživatelských žádostí.",
    keywords: ["admin zadosti", "schvalovani zadosti", "administrace"],
  },
  {
    id: "home",
    title: "Domů",
    path: "/",
    summary: "Dashboard s rychlými akcemi, přehledy a klíčovými metrikami.",
    keywords: ["domu", "dashboard", "prehled", "rychle akce"],
  },
];

type TopPremiumChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type TopPremiumChatPayload = {
  prompt: string;
  history: TopPremiumChatHistoryMessage[];
};

type TopPremiumWebSource = {
  title: string;
  url: string;
};

type RagChunkSourceType = "feature" | "capability" | "comparison" | "policy";

type RagChunk = {
  id: string;
  title: string;
  body: string;
  sourceType: RagChunkSourceType;
  sourcePath: string;
  sourceLabel: string;
  keywords: string[];
};

type PreparedRagChunk = RagChunk & {
  normalizedText: string;
  tokens: string[];
};

type ExternalSourceHint = {
  id: string;
  title: string;
  url: string;
  summary: string;
  keywords: string[];
};

type ComparisonProduct = {
  id: string;
  insurer: string;
  name: string;
  version: string;
};

type ComparisonItem = {
  id: string;
  question: string;
  values: Record<string, string>;
};

type ComparisonSection = {
  title: string;
  items: ComparisonItem[];
};

type ComparisonPayload = {
  products: ComparisonProduct[];
  sections: ComparisonSection[];
};

type SensitiveBlockRule = {
  category: string;
  pattern: RegExp;
};

type RankedWebsiteFeature = WebsiteFeature & { score: number };

type CapabilitySource = (typeof PRODUCT_CAPABILITIES)[keyof typeof PRODUCT_CAPABILITIES];

const CAPABILITY_LABELS: Record<CapabilityEntry["key"], string> = {
  death: "Smrt",
  terminal: "Terminální onemocnění",
  waiverInvalidity: "Zproštění placení při invaliditě",
  waiverJobLoss: "Zproštění placení při ztrátě zaměstnání",
  invalidity: "Invalidita",
  criticalIllness: "Závažná onemocnění",
  seriousIllness: "Vážná onemocnění",
  diabetes: "Diabetes",
  vaccination: "Očkování",
  deathAccident: "Smrt úrazem",
  permanentInjury: "Trvalé následky úrazu",
  dailyAllowance: "Denní odškodné",
  bodilyInjury: "Tělesné poškození úrazem",
  sickLeave: "Pracovní neschopnost",
  hospitalization: "Hospitalizace",
  healthSocial: "Zdravotně sociální služby",
  childOperation: "Dětské operace",
  childrenAccident: "Úraz dětí",
  assistedReproduction: "Asistovaná reprodukce",
  careDependence: "Závislost na péči",
  fullCare: "Plná péče",
  specialAid: "Speciální pomůcky",
  travel: "Cestovní pojištění",
  liability: "Odpovědnost",
  employeeLiability: "Odpovědnost zaměstnance",
};

let RAG_CORPUS_CACHE: PreparedRagChunk[] | null = null;

const WEB_SEARCH_PATTERNS = [
  /\binternet\b/,
  /\bweb\b/,
  /\bonline\b/,
  /\bove[řr]\b/,
  /\bdohledej\b/,
  /\bzdroj(e|u)?\b/,
  /\baktualn/i,
  /\bnejnovejs/i,
  /\bdnes\b/,
  /\b202[6-9]\b/,
  /\bz[aá]kon\b/,
  /\blegislativ/i,
  /\bcnb\b/,
  /\bda[nň]\b/,
  /\binflac/i,
  /\búrok/i,
  /\burok/i,
  /\bsazb/i,
] as const;

const EXTERNAL_SOURCE_HINTS: ExternalSourceHint[] = [
  {
    id: "cpp",
    title: "ČPP (Česká podnikatelská pojišťovna)",
    url: "https://www.cpp.cz/",
    summary:
      "Oficiální web ČPP pro produktové informace, dokumenty, pojistné podmínky a aktuální podklady.",
    keywords: [
      "cpp",
      "čpp",
      "ceska podnikatelska pojistovna",
      "ceska podnikatelska pojistovna as",
      "pojisteni cpp",
      "cpp pojisteni",
    ],
  },
  {
    id: "kooperativa",
    title: "Kooperativa pojišťovna",
    url: "https://www.koop.cz/",
    summary:
      "Oficiální web Kooperativy pro produktové informace, dokumenty, pojistné podmínky a aktuální podklady.",
    keywords: [
      "kooperativa",
      "koop",
      "koop.cz",
      "kooperativa pojistovna",
      "pojisteni kooperativa",
      "kooperativa pojisteni",
    ],
  },
];

const HARD_BLOCK_SENSITIVE_RULES: SensitiveBlockRule[] = [
  {
    category: "e-mail",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    category: "telefon",
    pattern: /\b(?:\+420[\s-]?)?(?:\d{3}[\s-]?){2}\d{3}\b/g,
  },
  {
    category: "rodné číslo",
    pattern: /\b\d{2}(?:0[1-9]|1[0-2]|5[1-9]|6[0-2])(?:0[1-9]|[12]\d|3[01])\/\d{3,4}\b/g,
  },
  {
    category: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi,
  },
  {
    category: "bankovní účet",
    pattern: /\b\d{1,6}-\d{2,10}\/\d{4}\b/g,
  },
];

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

function readIncompleteReason(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  const details =
    row.incomplete_details && typeof row.incomplete_details === "object"
      ? (row.incomplete_details as Record<string, unknown>)
      : null;
  const reason = details && typeof details.reason === "string" ? details.reason.trim() : "";
  return reason;
}

function parsePayload(raw: unknown): TopPremiumChatPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!prompt) return null;

  const historyRaw = Array.isArray(row.history) ? row.history : [];
  const history = historyRaw
    .map((entry): TopPremiumChatHistoryMessage | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      const role = item.role === "assistant" ? "assistant" : item.role === "user" ? "user" : null;
      const content = typeof item.content === "string" ? item.content.trim() : "";
      if (!role || !content) return null;
      return {
        role,
        content: content.slice(0, AI_HISTORY_ITEM_MAX_LEN),
      };
    })
    .filter((item): item is TopPremiumChatHistoryMessage => Boolean(item))
    .slice(-AI_HISTORY_MAX_ITEMS);

  return {
    prompt: prompt.slice(0, AI_PROMPT_MAX_LEN),
    history,
  };
}

function normalizeForPolicy(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeForRag(value: string): string[] {
  return normalizeForPolicy(value)
    .split(/[^a-z0-9/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toRagBody(value: string): string {
  return compactWhitespace(value).slice(0, RAG_MAX_CHUNK_BODY_LEN);
}

function formatCapabilityEntry(entry: CapabilityEntry): string {
  const label = CAPABILITY_LABELS[entry.key];
  const parts: string[] = [label];

  if (entry.permanentInjury) {
    const progress = entry.permanentInjury.progressions.join(", ");
    const thresholds = entry.permanentInjury.thresholds.join(", ");
    parts.push(`progrese: ${progress}`, `od: ${thresholds}`);
  }

  if (entry.dailyAllowance) {
    parts.push(
      `denní odškodné od: ${entry.dailyAllowance.starts.join(", ")}`,
      `progrese: ${entry.dailyAllowance.progressions.join(", ")}`
    );
  }

  if (entry.sickLeave?.options?.length) {
    const first = entry.sickLeave.options[0];
    parts.push(`pracovní neschopnost od ${first.start}`);
  }

  if (entry.hospitalization) {
    parts.push(
      `hospitalizace úraz ${entry.hospitalization.accident ? "ano" : "ne"}`,
      `nemoc ${entry.hospitalization.illness ? "ano" : "ne"}`
    );
  }

  if (entry.liabilityLimits?.length) {
    parts.push(`limity odpovědnosti: ${entry.liabilityLimits.slice(0, 4).join(", ")} Kč`);
  }

  return parts.join(" | ");
}

function buildFeatureRagChunks(): RagChunk[] {
  return WEBSITE_FEATURES.map((feature) => ({
    id: `feature:${feature.id}`,
    title: feature.title,
    body: toRagBody(`${feature.summary} Cesta: ${feature.path}.`),
    sourceType: "feature",
    sourcePath: feature.path,
    sourceLabel: "Interní web",
    keywords: feature.keywords,
  }));
}

function buildCapabilityRagChunks(): RagChunk[] {
  const sources = Object.values(PRODUCT_CAPABILITIES) as CapabilitySource[];

  return sources.map((source, index) => {
    const covered = source.entries.map((entry) => CAPABILITY_LABELS[entry.key]).join(", ");
    const detailPreview = source.entries.slice(0, 10).map((entry) => formatCapabilityEntry(entry));
    const detailText =
      detailPreview.length > 0
        ? ` Detaily: ${detailPreview.join(" || ")}`
        : "";

    return {
      id: `capability:${index}`,
      title: source.name,
      body: toRagBody(`Produkt ${source.name}. Krytá rizika: ${covered}.${detailText}`),
      sourceType: "capability",
      sourcePath: "/pomucky/zaznam",
      sourceLabel: "Produktové schopnosti",
      keywords: [source.name, ...source.entries.map((entry) => CAPABILITY_LABELS[entry.key])],
    };
  });
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseComparisonPayload(raw: unknown): ComparisonPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const productsRaw = Array.isArray(row.products) ? row.products : [];
  const sectionsRaw = Array.isArray(row.sections) ? row.sections : [];

  const products: ComparisonProduct[] = productsRaw
    .map((entry): ComparisonProduct | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as Record<string, unknown>;
      const id = toText(item.id);
      const insurer = toText(item.insurer);
      const name = toText(item.name);
      const version = toText(item.version);
      if (!id || !insurer || !name) return null;
      return { id, insurer, name, version };
    })
    .filter((item): item is ComparisonProduct => Boolean(item));

  const sections: ComparisonSection[] = sectionsRaw
    .map((sectionEntry): ComparisonSection | null => {
      if (!sectionEntry || typeof sectionEntry !== "object" || Array.isArray(sectionEntry)) return null;
      const section = sectionEntry as Record<string, unknown>;
      const title = toText(section.title);
      const itemsRaw = Array.isArray(section.items) ? section.items : [];
      if (!title || itemsRaw.length === 0) return null;

      const items: ComparisonItem[] = itemsRaw
        .map((itemEntry): ComparisonItem | null => {
          if (!itemEntry || typeof itemEntry !== "object" || Array.isArray(itemEntry)) return null;
          const item = itemEntry as Record<string, unknown>;
          const id = toText(item.id);
          const question = toText(item.question);
          const valuesRaw = item.values && typeof item.values === "object"
            ? (item.values as Record<string, unknown>)
            : null;
          if (!id || !question || !valuesRaw) return null;

          const values: Record<string, string> = {};
          Object.entries(valuesRaw).forEach(([key, value]) => {
            const text = toText(value);
            if (!text) return;
            values[key] = text;
          });

          if (Object.keys(values).length === 0) return null;
          return { id, question, values };
        })
        .filter((item): item is ComparisonItem => Boolean(item));

      if (items.length === 0) return null;
      return { title, items };
    })
    .filter((item): item is ComparisonSection => Boolean(item));

  if (products.length === 0 || sections.length === 0) return null;
  return { products, sections };
}

function shortProductLabel(product: ComparisonProduct): string {
  return `${product.insurer} ${product.name}`.trim();
}

function buildComparisonRagChunks(): RagChunk[] {
  const payload = parseComparisonPayload(resolveLifeComparisonSourcePayload());
  if (!payload) return [];

  const productById = new Map(payload.products.map((product) => [product.id, product]));
  const chunks: RagChunk[] = [];

  for (const section of payload.sections) {
    for (const item of section.items) {
      const valuePreview = Object.entries(item.values)
        .map(([productId, value]) => ({
          product: productById.get(productId),
          value: compactWhitespace(value),
        }))
        .filter((entry) => entry.product && entry.value.length > 0)
        .slice(0, RAG_COMPARISON_VALUE_PREVIEW)
        .map((entry) => `${shortProductLabel(entry.product!)}: ${entry.value}`);

      if (valuePreview.length === 0) continue;

      chunks.push({
        id: `comparison:${section.title}:${item.id}`,
        title: `${section.title} • ${item.question}`,
        body: toRagBody(
          `Sekce: ${section.title}. Otázka: ${item.question}. Přehled hodnot: ${valuePreview.join(
            " | "
          )}`
        ),
        sourceType: "comparison",
        sourcePath: "/pomucky/srovnavac-zivotniho-pojisteni",
        sourceLabel: "Srovnávač životního pojištění",
        keywords: [section.title, item.question],
      });

      if (chunks.length >= RAG_COMPARISON_CHUNK_LIMIT) {
        return chunks;
      }
    }
  }

  return chunks;
}

function buildRagCorpus(): PreparedRagChunk[] {
  if (RAG_CORPUS_CACHE) return RAG_CORPUS_CACHE;

  const policyChunks: RagChunk[] = [
    {
      id: "policy:add-contract-flow",
      title: "Postup přidání smlouvy",
      body: toRagBody(ADD_CONTRACT_KNOWLEDGE_REPLY),
      sourceType: "policy",
      sourcePath: "/kalkulacka",
      sourceLabel: "Interní proces",
      keywords: ["kalkulacka", "pridat smlouvu", "sepsano", "pdf smlouvy"],
    },
  ];

  const rawChunks = [
    ...buildFeatureRagChunks(),
    ...buildCapabilityRagChunks(),
    ...buildComparisonRagChunks(),
    ...policyChunks,
  ];

  RAG_CORPUS_CACHE = rawChunks.map((chunk) => {
    const normalizedText = normalizeForPolicy(
      [chunk.title, chunk.body, chunk.sourceLabel, ...chunk.keywords].join(" ")
    );
    return {
      ...chunk,
      normalizedText,
      tokens: tokenizeForRag(normalizedText),
    };
  });

  return RAG_CORPUS_CACHE;
}

function scoreRagChunk(
  chunk: PreparedRagChunk,
  queryTokens: string[],
  queryNormalized: string
): number {
  let score = 0;
  const tokenSet = new Set(chunk.tokens);

  for (const token of queryTokens) {
    if (tokenSet.has(token)) {
      score += token.length >= 8 ? 3 : 2;
    } else if (chunk.normalizedText.includes(token)) {
      score += token.length >= 8 ? 2 : 1;
    }
  }

  if (queryNormalized.includes(chunk.sourcePath.replaceAll("/", " ").trim())) score += 2;

  if (chunk.sourceType === "feature" && /\b(kde|kam|najdu|sekce|menu)\b/.test(queryNormalized)) {
    score += 1;
  }

  if (chunk.sourceType === "comparison" && /\b(srovn|pojist|rizik|invalid|vyluk)\b/.test(queryNormalized)) {
    score += 2;
  }

  return score;
}

function selectRagChunks(prompt: string, history: TopPremiumChatHistoryMessage[]): PreparedRagChunk[] {
  const historyText = history.map((item) => item.content).join(" ");
  const queryNormalized = normalizeForPolicy(`${historyText} ${prompt}`);
  const queryTokens = tokenizeForRag(queryNormalized);
  const corpus = buildRagCorpus();

  return corpus
    .map((chunk) => ({
      chunk,
      score: scoreRagChunk(chunk, queryTokens, queryNormalized),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, RAG_MAX_CHUNKS)
    .map((row) => row.chunk);
}

function buildRagContextBlock(prompt: string, history: TopPremiumChatHistoryMessage[]): string {
  const selected = selectRagChunks(prompt, history);
  if (selected.length === 0) {
    return "RAG kontext: pro tento dotaz nebyly nalezeny interní podklady.";
  }

  const lines = selected.map((chunk, index) => {
    return `${index + 1}) [${chunk.sourceLabel}] ${chunk.title} (${chunk.sourcePath}) — ${chunk.body}`;
  });

  return ["RAG kontext (interní podklady, bez smluv):", ...lines].join("\n");
}

function scoreExternalSourceHint(haystack: string, source: ExternalSourceHint): number {
  let score = 0;

  for (const keyword of source.keywords) {
    const normalizedKeyword = normalizeForPolicy(keyword);
    if (!normalizedKeyword) continue;
    if (haystack.includes(normalizedKeyword)) {
      score += normalizedKeyword.includes(" ") ? 3 : 2;
    }
  }

  const sourceTitle = normalizeForPolicy(source.title);
  if (sourceTitle && haystack.includes(sourceTitle)) score += 4;

  return score;
}

function selectExternalSourceHints(
  prompt: string,
  history: TopPremiumChatHistoryMessage[]
): ExternalSourceHint[] {
  const historyText = history.map((item) => item.content).join(" ");
  const haystack = normalizeForPolicy(`${historyText} ${prompt}`);

  return EXTERNAL_SOURCE_HINTS.map((source) => ({
    source,
    score: scoreExternalSourceHint(haystack, source),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, EXTERNAL_SOURCE_HINT_MAX_ITEMS)
    .map((row) => row.source);
}

function buildExternalSourceContextBlock(
  prompt: string,
  history: TopPremiumChatHistoryMessage[]
): string {
  const selected = selectExternalSourceHints(prompt, history);
  if (selected.length === 0) return "";

  const lines = selected.map(
    (source, index) => `${index + 1}) ${source.title}: ${source.url} — ${source.summary}`
  );

  return [
    "Preferované externí zdroje (pokud je potřeba dohledat aktuální info):",
    ...lines,
    "Při relevantním dotazu preferuj tyto oficiální zdroje před obecnými agregátory.",
  ].join("\n");
}

function detectHardBlockedSensitiveInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  for (const rule of HARD_BLOCK_SENSITIVE_RULES) {
    if (rule.pattern.test(raw)) {
      rule.pattern.lastIndex = 0;
      return rule.category;
    }
    rule.pattern.lastIndex = 0;
  }

  const normalized = normalizeForPolicy(raw);
  const containsContractKeyword =
    /\b(cislo smlouvy|smlouva|pojistka|pojistna smlouva|contract|policy)\b/.test(normalized);
  const containsContractIdentifier =
    /\b(?:\d{8,}|[a-z0-9-]*\d[a-z0-9-]{7,})\b/.test(normalized);

  if (containsContractKeyword && containsContractIdentifier) {
    return "číslo smlouvy";
  }

  return null;
}

function redactSensitiveText(value: string): string {
  if (!value) return "";
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?\d[\d\s-]{8,}\d)\b/g, "[PHONE]")
    .replace(/\b\d{2}[\/ ]?\d{2}[\/ ]?\d{3,4}\b/g, "[PERSONAL_ID]")
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, "[IBAN]")
    .replace(/\b\d{2,6}-?\d{2,10}\/\d{4}\b/g, "[BANK_ACCOUNT]")
    .replace(/\b\d{8,}\b/g, "[ID]");
}

function sanitizeHistoryForUpstream(
  history: TopPremiumChatHistoryMessage[]
): TopPremiumChatHistoryMessage[] {
  return history.map((item) => ({
    role: item.role,
    content: redactSensitiveText(item.content).slice(0, MAX_UPSTREAM_MESSAGE_LEN),
  }));
}

function shouldUseWebSearch(prompt: string, history: TopPremiumChatHistoryMessage[]): boolean {
  if (!ENABLE_TOP_PREMIUM_WEB_SEARCH) return false;
  const historyText = history.map((item) => item.content).join(" ");
  const haystack = normalizeForPolicy(`${historyText} ${prompt}`);
  return WEB_SEARCH_PATTERNS.some((pattern) => pattern.test(haystack));
}

function readOpenAiOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>;
  const outputText = row.output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText.trim();

  const output = Array.isArray(row.output) ? row.output : [];
  const textParts: string[] = [];

  output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const message = item as Record<string, unknown>;
    const content = Array.isArray(message.content) ? message.content : [];

    content.forEach((contentItem) => {
      if (!contentItem || typeof contentItem !== "object") return;
      const contentRow = contentItem as Record<string, unknown>;
      const directText = contentRow.text ?? contentRow.value;
      if (typeof directText === "string" && directText.trim()) {
        textParts.push(directText.trim());
        return;
      }

      if (directText && typeof directText === "object") {
        const textObject = directText as Record<string, unknown>;
        const objectText = textObject.value ?? textObject.text;
        if (typeof objectText === "string" && objectText.trim()) {
          textParts.push(objectText.trim());
          return;
        }
      }
    });
  });

  return textParts.join("\n").trim();
}

function sourceFromRecord(record: Record<string, unknown>): TopPremiumWebSource | null {
  const urlCandidate = record.url ?? record.uri ?? record.link;
  if (typeof urlCandidate !== "string") return null;

  const normalizedUrl = normalizeSourceUrl(urlCandidate);
  if (!normalizedUrl) return null;

  const titleCandidate = record.title ?? record.name ?? record.source;
  const title =
    typeof titleCandidate === "string" && titleCandidate.trim() ? titleCandidate.trim() : "";

  return { title, url: normalizedUrl };
}

function mergeSources(...sourceGroups: Array<TopPremiumWebSource[] | undefined>): TopPremiumWebSource[] {
  const seen = new Set<string>();
  const output: TopPremiumWebSource[] = [];

  sourceGroups.flatMap((group) => group ?? []).forEach((source) => {
    const url = normalizeSourceUrl(source.url);
    if (!url) return;

    const key = url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    output.push({
      title: source.title.trim(),
      url,
    });
  });

  const preferred = output
    .filter((source) => source.title && !looksLikeUrl(source.title))
    .concat(output.filter((source) => !source.title || looksLikeUrl(source.title)));

  return preferred.slice(0, 6);
}

function normalizeSourceUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!/^https?:$/.test(parsed.protocol)) return null;

    parsed.hash = "";

    const dropParams = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
      "igshid",
      "ref",
    ]);

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (dropParams.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }

    const cleanedPath = parsed.pathname.replace(/\/{2,}/g, "/");
    parsed.pathname = cleanedPath === "/" ? "/" : cleanedPath.replace(/\/$/, "");

    return parsed.toString();
  } catch {
    return null;
  }
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed);
}

function shortSourceTitle(source: TopPremiumWebSource): string {
  const trimmed = source.title.trim();
  if (trimmed && !looksLikeUrl(trimmed)) return trimmed.replace(/\s+/g, " ").slice(0, 64);

  try {
    const parsed = new URL(source.url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function formatSourceLine(source: TopPremiumWebSource): string {
  const shortTitle = shortSourceTitle(source);
  if (shortTitle) {
    return `- ${shortTitle}`;
  }
  return "- externí zdroj";
}

function stripSourceSectionFromReply(reply: string): string {
  if (!reply) return "";
  const normalized = reply.replace(/\r\n/g, "\n");
  const marker = normalized.search(/\n{1,3}(zdroje|sources)\s*:/i);
  if (marker === -1) return normalized.trim();
  return normalized.slice(0, marker).trim();
}

function stripInlineLinksAndUrls(reply: string): string {
  if (!reply) return "";
  return reply
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBulletLine(line: string): boolean {
  return /^\s*(?:[-*•]|\d+[.)])\s+/.test(line);
}

function normalizeBulletText(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
}

function toConciseBulletReply(reply: string): string {
  const cleanLines = reply
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (cleanLines.length === 0) return "";

  const bulletLines = cleanLines.filter(isBulletLine).map(normalizeBulletText);
  if (bulletLines.length > 0) {
    return bulletLines.slice(0, MAX_REPLY_BULLETS).map((line) => `- ${line}`).join("\n");
  }

  if (reply.length < 220) return reply;

  const sentences = cleanLines
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) return reply;

  return sentences
    .slice(0, MAX_REPLY_BULLETS)
    .map((sentence) => (sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence))
    .map((sentence) => `- ${sentence}`)
    .join("\n");
}

function formatReplyForUi(reply: string): string {
  const withoutSourceSection = stripSourceSectionFromReply(reply);
  const withoutLinks = stripInlineLinksAndUrls(withoutSourceSection);
  return toConciseBulletReply(withoutLinks);
}

function readOpenAiWebSources(payload: unknown): TopPremiumWebSource[] {
  const candidates: TopPremiumWebSource[] = [];

  const visit = (value: unknown, depth: number) => {
    if (depth > 7 || candidates.length >= 20) return;
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const source = sourceFromRecord(row);
    if (source) candidates.push(source);

    Object.values(row).forEach((child) => visit(child, depth + 1));
  };

  visit(payload, 0);
  return mergeSources(candidates);
}

function asksForContractLookup(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  const lookupPatterns = [
    /\b(vyhledej|najdi|zobraz|ukaz|vytahni|nacti|posli|dej)\b[^.!?\n]{0,90}\b(smlouv|pojistk|contract)\b/i,
    /\b(smlouv|pojistk|contract)\b[^.!?\n]{0,70}\b(cislo|id|detail|detaily|seznam|list|databaz|db)\b/i,
    /\b(moje|nase|konkretni|klient)\b[^.!?\n]{0,90}\b(smlouv|pojistk|contract)\b/i,
  ];
  return lookupPatterns.some((pattern) => pattern.test(normalized));
}

function asksHowToAddContract(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  const addContractPatterns = [
    /\b(jak|postup|navod|kde)\b[^.!?\n]{0,60}\b(pridat|zadat|ulozit|sepsat|zalozit)\b[^.!?\n]{0,70}\b(smlouv|pojistk|contract)\b/i,
    /\b(pridat|zadat|ulozit|sepsat|zalozit)\b[^.!?\n]{0,70}\b(smlouv|pojistk|contract)\b/i,
    /\b(kalkulack)\b[^.!?\n]{0,80}\b(smlouv|sepsano)\b/i,
  ];
  return addContractPatterns.some((pattern) => pattern.test(normalized));
}

function asksDomexDiscount(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  const domexMention = /\bdomex\b/.test(normalized);
  if (!domexMention) return false;
  return /\b(sleva|slevu|slevy|prim[aá] sleva|ziskat slevu|jak ziskat)\b/.test(normalized);
}

function tokenizeNormalized(value: string): string[] {
  return normalizeForPolicy(value)
    .split(/[^a-z0-9/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function featureKeywordBag(feature: WebsiteFeature): string[] {
  const titleTokens = tokenizeNormalized(feature.title);
  const summaryTokens = tokenizeNormalized(feature.summary).filter((token) => token.length >= 4);
  const pathTokens = feature.path
    .split("/")
    .map((part) => normalizeForPolicy(part))
    .filter((part) => part.length >= 2);
  const explicitKeywords = feature.keywords.map((keyword) => normalizeForPolicy(keyword));

  return Array.from(
    new Set([...explicitKeywords, ...titleTokens, ...summaryTokens, ...pathTokens])
  );
}

function scoreFeatureMatch(haystack: string, feature: WebsiteFeature): number {
  let score = 0;
  for (const keyword of feature.keywords) {
    if (haystack.includes(normalizeForPolicy(keyword))) {
      score += keyword.includes(" ") ? 3 : 2;
    }
  }
  for (const token of featureKeywordBag(feature)) {
    if (haystack.includes(token)) {
      score += token.length >= 8 ? 2 : 1;
    }
  }
  if (haystack.includes(feature.path)) score += 3;
  if (haystack.includes(normalizeForPolicy(feature.title))) score += 6;
  return score;
}

function rankWebsiteFeatures(
  prompt: string,
  history: TopPremiumChatHistoryMessage[]
): RankedWebsiteFeature[] {
  const historyText = history.map((item) => item.content).join(" ");
  const haystack = normalizeForPolicy(`${historyText} ${prompt}`);

  return WEBSITE_FEATURES.map((feature) => ({
    ...feature,
    score: scoreFeatureMatch(haystack, feature),
  }))
    .filter((feature) => feature.score > 0)
    .sort((a, b) => b.score - a.score);
}

function asksWhereInWeb(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  return (
    /\b(kde|kam|v ktere sekci|na ktere strance|jak se dostanu|kde to je)\b/.test(normalized) &&
    /\b(najdu|je|otevru|udelam|mam jit|kliknu|v menu)\b/.test(normalized)
  );
}

function buildNavigationReply(prompt: string, history: TopPremiumChatHistoryMessage[]): string | null {
  if (!asksWhereInWeb(prompt)) return null;

  const ranked = rankWebsiteFeatures(prompt, history);
  const top = ranked[0];
  if (!top || top.score < 2) return null;

  const next = ranked[1];
  const lines = [
    `✅ Nejpravděpodobněji hledej tady: ${top.title} (${top.path}).`,
    `👉 Co tam uděláš: ${top.summary}`,
  ];
  if (next && next.score >= 2) {
    lines.push(`🔁 Alternativa: ${next.title} (${next.path}).`);
  }
  lines.push("Napiš konkrétní akci a dám přesný postup krok za krokem.");
  return lines.join("\n");
}

function asksCapabilities(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  return (
    /\b(co umis|co vsechno|v cem poradis|co umi web|jake jsou nastroje|co tam je|co je v appce)\b/.test(
      normalized
    ) || /\b(jaky mate nastroje|jaky jsou sekce)\b/.test(normalized)
  );
}

function buildCapabilitiesReply(): string {
  const keySections = [
    "🏠 Domů: dashboard a rychlé akce.",
    "🧮 Kalkulačka (/kalkulacka): výpočet provizí, Přidat smlouvu, PDF import, Sepsáno.",
    "📄 Smlouvy (/smlouvy): přehled a detail uložených smluv.",
    "🧰 Pomůcky (/pomucky): argumenty, dokumenty, srovnávače, zlato, statistiky a další nástroje.",
    "📬 Pošta (/posta): interní poštovní workflow.",
    "⚙️ Nastavení (/nastaveni): profil, timeline, systémová nastavení.",
    "👥 Můj tým (/muj-tym): týmové přehledy a práce s podřízenými.",
    "🏢 Intranet (/intranet): interní nástěnka a týmové příspěvky.",
  ];

  return [
    "✅ Ve webu se orientuju podle interní mapy sekcí. Hlavní oblasti:",
    ...keySections.map((line, index) => `${index + 1}) ${line}`),
    "",
    "👉 Napiš konkrétní úkol (např. „kde najdu export produkce“ nebo „jak uložit smlouvu“) a dám přesnou cestu i postup.",
  ].join("\n");
}

function asksHowTo(prompt: string): boolean {
  const normalized = normalizeForPolicy(prompt);
  return /\b(jak|postup|navod|krok za krokem|co kliknout)\b/.test(normalized);
}

function buildFeatureHowToReply(
  prompt: string,
  history: TopPremiumChatHistoryMessage[]
): string | null {
  if (!asksHowTo(prompt)) return null;

  const ranked = rankWebsiteFeatures(prompt, history);
  const top = ranked.find((feature) => feature.howTo && feature.howTo.length > 0 && feature.score >= 4);
  if (!top || !top.howTo || top.howTo.length === 0) return null;

  const lines = [
    `✅ Postup pro ${top.title} (${top.path}):`,
    ...top.howTo.map((step, index) => `${index + 1}) ${step}`),
  ];
  lines.push("👉 Když chceš, navážu rovnou konkrétním checklistem k tvému případu.");
  return lines.join("\n");
}

function buildUpstreamPrompt(
  prompt: string,
  history: TopPremiumChatHistoryMessage[],
  useWebSearch: boolean,
  externalSourceContext: string
): string {
  const trimmedPrompt = prompt.trim();
  const sanitizedPrompt = redactSensitiveText(trimmedPrompt).slice(0, MAX_UPSTREAM_MESSAGE_LEN);
  const sanitizedHistory = sanitizeHistoryForUpstream(history);
  const ragContext = buildRagContextBlock(trimmedPrompt, history);
  const today = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "long",
    timeZone: "Europe/Prague",
  }).format(new Date());
  const webModeInstruction = useWebSearch
    ? "Web režim: zapnutý. U aktuálních, právních nebo externích tvrzení je ověř přes web search a připoj zdroje."
    : "Web režim: vypnutý. Nepředstírej internetové ověření; odpovídej z interního kontextu a odborných znalostí.";
  const historyLines = sanitizedHistory
    .map((item) => `${item.role === "assistant" ? "Asistent" : "Uživatel"}: ${item.content}`)
    .join("\n");

  if (!historyLines) {
    return [
      TOP_PREMIUM_SYSTEM_PROMPT,
      "",
      `Datum: ${today}.`,
      webModeInstruction,
      ...(externalSourceContext ? ["", externalSourceContext] : []),
      "",
      ragContext,
      "",
      "Dotaz uživatele:",
      sanitizedPrompt,
    ].join("\n");
  }

  return [
    TOP_PREMIUM_SYSTEM_PROMPT,
    "",
    `Datum: ${today}.`,
    webModeInstruction,
    ...(externalSourceContext ? ["", externalSourceContext] : []),
    "",
    ragContext,
    "",
    "Předchozí konverzace (nejnovější dole):",
    historyLines,
    "",
    "Aktuální dotaz uživatele:",
    sanitizedPrompt,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:top-premium-chat:post",
    limit: TOP_PREMIUM_CHAT_RATE_LIMIT,
    windowMs: TOP_PREMIUM_CHAT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný payload pro Bohemka Asistent." },
        { status: 400 }
      ),
      ctx
    );
  }

  const sensitiveCategory = detectHardBlockedSensitiveInput(payload.prompt);
  if (sensitiveCategory) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            `Zpráva obsahuje citlivé údaje (${sensitiveCategory}). ` +
            "Kvůli bezpečnosti ji neposílám do AI. Odstraň prosím identifikátory (e-mail, telefon, RČ, číslo smlouvy) a napiš dotaz obecně.",
        },
        { status: 422 }
      ),
      ctx
    );
  }

  if (asksHowToAddContract(payload.prompt)) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: ADD_CONTRACT_KNOWLEDGE_REPLY,
      }),
      ctx
    );
  }

  if (asksDomexDiscount(payload.prompt)) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: DOMEX_DISCOUNT_KNOWLEDGE_REPLY,
      }),
      ctx
    );
  }

  if (asksCapabilities(payload.prompt)) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: buildCapabilitiesReply(),
      }),
      ctx
    );
  }

  const featureHowToReply = buildFeatureHowToReply(payload.prompt, payload.history);
  if (featureHowToReply) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: featureHowToReply,
      }),
      ctx
    );
  }

  const navigationReply = buildNavigationReply(payload.prompt, payload.history);
  if (navigationReply) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: navigationReply,
      }),
      ctx
    );
  }

  if (asksForContractLookup(payload.prompt)) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            "Bohemka Asistent nemá přístup ke smlouvám. Můžu poradit obecně k pojištění, investicím nebo investičnímu zlatu, ale nevyhledám konkrétní smlouvu.",
        },
        { status: 403 }
      ),
      ctx
    );
  }

  const externalSourceContext = buildExternalSourceContextBlock(
    payload.prompt,
    payload.history
  );

  const useWebSearch = shouldUseWebSearch(payload.prompt, payload.history);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    useWebSearch ? AI_WEB_TIMEOUT_MS : AI_TIMEOUT_MS
  );

  try {
    const aiPrompt = buildUpstreamPrompt(
      payload.prompt,
      payload.history,
      useWebSearch,
      externalSourceContext
    );

    if (!OPENAI_API_KEY) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: "Bohemka Asistent není nakonfigurovaný (chybí OPENAI_API_KEY).",
          },
          { status: 503 }
        ),
        ctx
      );
    }

    const buildRequestBody = (maxOutputTokens: number): Record<string, unknown> => {
      const requestBody: Record<string, unknown> = {
        model: TOP_PREMIUM_OPENAI_MODEL,
        input: aiPrompt,
        max_output_tokens: maxOutputTokens,
        reasoning: {
          effort: "low",
        },
        text: {
          verbosity: "low",
        },
      };

      if (useWebSearch) {
        requestBody.tools = [
          {
            type: "web_search",
            search_context_size: TOP_PREMIUM_WEB_SEARCH_CONTEXT_SIZE,
            user_location: {
              type: "approximate",
              country: "CZ",
              timezone: "Europe/Prague",
            },
          },
        ];
        requestBody.tool_choice = "auto";
        requestBody.include = ["web_search_call.action.sources"];
      }

      return requestBody;
    };

    const callOpenAi = async (maxOutputTokens: number) => {
      const upstream = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(buildRequestBody(maxOutputTokens)),
        signal: controller.signal,
        cache: "no-store",
      });

      const upstreamPayload = await upstream.json().catch(() => null);
      const reply = readOpenAiOutputText(upstreamPayload);
      const responseStatus =
        upstreamPayload && typeof upstreamPayload === "object"
          ? String((upstreamPayload as Record<string, unknown>).status ?? "")
          : "";
      const incompleteReason = readIncompleteReason(upstreamPayload);

      return {
        ok: upstream.ok,
        status: upstream.status,
        payload: upstreamPayload,
        reply,
        responseStatus,
        incompleteReason,
      };
    };

    let usedMaxOutputTokens = useWebSearch ? OPENAI_WEB_MAX_OUTPUT_TOKENS : OPENAI_MAX_OUTPUT_TOKENS;
    let openAiCall = await callOpenAi(usedMaxOutputTokens);

    if (openAiCall.ok && !openAiCall.reply && openAiCall.incompleteReason === "max_output_tokens") {
      usedMaxOutputTokens = useWebSearch
        ? OPENAI_WEB_RETRY_MAX_OUTPUT_TOKENS
        : OPENAI_RETRY_MAX_OUTPUT_TOKENS;
      openAiCall = await callOpenAi(usedMaxOutputTokens);
    }

    if (!openAiCall.ok) {
      const errorMessage =
        readError(openAiCall.payload) || `Bohemka Asistent selhal (HTTP ${openAiCall.status}).`;
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: errorMessage }, { status: openAiCall.status }),
        ctx
      );
    }

    if (!openAiCall.reply) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error:
              openAiCall.responseStatus === "incomplete" || openAiCall.incompleteReason
                ? `Bohemka Asistent nevrátil textovou odpověď (${openAiCall.incompleteReason || openAiCall.responseStatus}).`
                : "Bohemka Asistent nevrátil textovou odpověď.",
          },
          { status: 502 }
        ),
        ctx
      );
    }

    const allSources = useWebSearch ? readOpenAiWebSources(openAiCall.payload) : [];
    const sources = allSources.slice(0, MAX_SOURCES_IN_REPLY);
    const cleanReply = formatReplyForUi(openAiCall.reply);
    const replyWithSources =
      sources.length > 0
        ? `${cleanReply}\n\nZdroje:\n${sources.map((source) => formatSourceLine(source)).join("\n")}`
        : cleanReply;

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: replyWithSources,
        sources,
        meta: {
          usedWebSearch: useWebSearch,
          model: TOP_PREMIUM_OPENAI_MODEL,
          maxOutputTokens: usedMaxOutputTokens,
        },
      }),
      ctx
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: isTimeout
            ? "Bohemka Asistent timeoutoval."
            : "Nepodařilo se spojit se službou Bohemka Asistent.",
        },
        { status: 504 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}

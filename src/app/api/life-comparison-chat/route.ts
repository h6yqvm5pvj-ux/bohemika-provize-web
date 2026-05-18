import { NextResponse, type NextRequest } from "next/server";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { resolveLifeComparisonSourcePayload } from "@/lib/server/lifeComparisonSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim() ?? "";
const OPENAI_MODEL =
  process.env.LIFE_COMPARISON_OPENAI_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5-mini";
const OPENAI_SMALLTALK_MODEL =
  process.env.LIFE_COMPARISON_SMALLTALK_MODEL?.trim() || OPENAI_MODEL;
const OPENAI_COMPLEX_MODEL =
  process.env.LIFE_COMPARISON_COMPLEX_MODEL?.trim() || OPENAI_MODEL;
const LEGACY_AI_ASSISTANT_URL =
  process.env.AI_ASSISTANT_URL?.trim() ||
  process.env.NEXT_PUBLIC_AI_ASSISTANT_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/aiAssistant";
const ENABLE_WEB_SEARCH =
  (process.env.LIFE_COMPARISON_ENABLE_WEB_SEARCH?.trim() || "1") !== "0";
const WEB_SEARCH_CONTEXT_SIZE =
  process.env.LIFE_COMPARISON_WEB_SEARCH_CONTEXT_SIZE?.trim() || "low";

const CHAT_RATE_LIMIT = 25;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const PROMPT_MAX_LEN = 2_000;
const MAX_SELECTED_PRODUCTS = 80;
const MAX_SELECTED_SECTIONS = 50;
const MAX_HISTORY_MESSAGES = 6;
const MAX_CONTEXT_ITEMS = 36;
const MAX_DETERMINISTIC_ITEMS = 7;
const MAX_PRODUCTS_PER_BULLET = 5;
const MAX_VALUE_GROUPS = 4;
const MAX_FOLLOWUPS = 4;
const CHAT_RESPONSE_CACHE_TTL_MS = 45_000;
const CHAT_RESPONSE_CACHE_LIMIT = 300;
const CHAT_RESPONSE_CACHE_VERSION = 6;
const AI_TIMEOUT_MS = 16_000;
const AI_WEB_TIMEOUT_MS = 24_000;
const OPENAI_MAX_OUTPUT_TOKENS = 900;
const OPENAI_SMALLTALK_MAX_OUTPUT_TOKENS = 520;
const OPENAI_COMPLEX_MAX_OUTPUT_TOKENS = 1_250;

const LIFE_COMPARISON_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "bullets", "followups", "sources"],
  properties: {
    summary: {
      type: "string",
      description: "Stručná odpověď v češtině, přímo k dotazu uživatele.",
    },
    bullets: {
      type: "array",
      maxItems: MAX_DETERMINISTIC_ITEMS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "citations"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          citations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
    followups: {
      type: "array",
      maxItems: MAX_FOLLOWUPS,
      items: { type: "string" },
    },
    sources: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
} as const;

type ChatHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type ChatRequestPayload = {
  prompt: string;
  selectedProductIds: string[];
  selectedCategoryTitles: string[];
  onlyDifferences: boolean;
  history: ChatHistoryMessage[];
};

type ComparisonProduct = {
  id: string;
  insurer: string;
  name: string;
  version: string;
};

type ComparisonItem = {
  id: string;
  page: number;
  question: string;
  values: Record<string, string>;
};

type ComparisonSection = {
  title: string;
  items: ComparisonItem[];
};

type ComparisonPayload = {
  source?: string;
  generatedAt?: string;
  products: ComparisonProduct[];
  sections: ComparisonSection[];
};

type ChatIntent =
  | "compare"
  | "differences"
  | "section_summary"
  | "best_product"
  | "lookup";

type ChatRouteKind =
  | "smalltalk"
  | "capabilities"
  | "general_life"
  | "table_lookup"
  | "table_compare"
  | "client_explanation"
  | "advisor_recommendation";

type ChatRoute = {
  kind: ChatRouteKind;
  usesTableContext: boolean;
  usesWebSearch: boolean;
  usesStructuredOutput: boolean;
  model: string;
  maxOutputTokens: number;
  maxContextItems: number;
  styleInstruction: string;
};

type QueryTraits = {
  asksInsurer: boolean;
  asksNegative: boolean;
  isCancer: boolean;
  isEarlyPhase: boolean;
};

type ScopedContextItem = {
  sectionTitle: string;
  item: ComparisonItem;
  differs: boolean;
  score: number;
};

type ScopedPack = {
  requestedProducts: ComparisonProduct[];
  selectedProducts: ComparisonProduct[];
  sections: ComparisonSection[];
  items: ScopedContextItem[];
  totalItems: number;
  dataCoverage: {
    requestedCount: number;
    withDataCount: number;
    withoutDataLabels: string[];
  };
};

type AssistantCitation = {
  section: string;
  page: number;
  id: string;
  question: string;
};

type AssistantBullet = {
  title: string;
  detail: string;
  citations: AssistantCitation[];
};

type AssistantWebSource = {
  title: string;
  url: string;
};

type AssistantStructuredAnswer = {
  summary: string;
  bullets: AssistantBullet[];
  citations: AssistantCitation[];
  followups: string[];
  sources?: AssistantWebSource[];
  intent: ChatIntent;
};

type CachedChatResponse = {
  reply: string;
  warning?: string;
  answer?: AssistantStructuredAnswer;
  meta: {
    usedItemsCount: number;
    totalItems: number;
    intent: ChatIntent;
  };
};

type ParsedAiAnswer = {
  summary: string;
  bullets: Array<{ title: string; detail: string; citations?: string[] }>;
  followups?: string[];
  sources?: AssistantWebSource[];
};

declare global {
  var __lifeComparisonChatResponseCache:
    | Map<string, { expiresAt: number; value: CachedChatResponse }>
    | undefined;
}

function getChatResponseCache(): Map<string, { expiresAt: number; value: CachedChatResponse }> {
  if (!globalThis.__lifeComparisonChatResponseCache) {
    globalThis.__lifeComparisonChatResponseCache = new Map();
  }
  return globalThis.__lifeComparisonChatResponseCache;
}

function makeCacheKey(payload: ChatRequestPayload, effectivePrompt: string): string {
  const productIds = [...payload.selectedProductIds].sort((a, b) => a.localeCompare(b));
  const sectionTitles = [...payload.selectedCategoryTitles].sort((a, b) =>
    a.localeCompare(b, "cs")
  );

  return JSON.stringify({
    version: CHAT_RESPONSE_CACHE_VERSION,
    prompt: normalizeSearchValue(effectivePrompt),
    onlyDifferences: payload.onlyDifferences,
    productIds,
    sectionTitles,
  });
}

function readCachedResponse(key: string): CachedChatResponse | null {
  const cache = getChatResponseCache();
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCachedResponse(key: string, value: CachedChatResponse): void {
  const cache = getChatResponseCache();
  cache.set(key, { expiresAt: Date.now() + CHAT_RESPONSE_CACHE_TTL_MS, value });

  if (cache.size <= CHAT_RESPONSE_CACHE_LIMIT) return;

  for (const [entryKey, entry] of cache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      cache.delete(entryKey);
    }
    if (cache.size <= CHAT_RESPONSE_CACHE_LIMIT) return;
  }

  while (cache.size > CHAT_RESPONSE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

function normalizeSearchValue(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalized(value: string): string[] {
  return normalizeSearchValue(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function hasAnyPhrase(haystackNormalized: string, needlesNormalized: string[]): boolean {
  return needlesNormalized.some((needle) => haystackNormalized.includes(needle));
}

function toValuesMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const map: Record<string, string> = {};

  Object.entries(record).forEach(([key, rawValue]) => {
    if (typeof rawValue === "string") {
      map[key] = rawValue;
    }
  });

  return map;
}

function isComparisonPayload(value: unknown): value is ComparisonPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.products) || !Array.isArray(payload.sections)) return false;

  const productsValid = payload.products.every((rawProduct) => {
    if (!rawProduct || typeof rawProduct !== "object") return false;
    const product = rawProduct as Record<string, unknown>;
    return (
      typeof product.id === "string" &&
      typeof product.insurer === "string" &&
      typeof product.name === "string" &&
      typeof product.version === "string"
    );
  });
  if (!productsValid) return false;

  const sectionsValid = payload.sections.every((rawSection) => {
    if (!rawSection || typeof rawSection !== "object") return false;
    const section = rawSection as Record<string, unknown>;
    if (typeof section.title !== "string" || !Array.isArray(section.items)) return false;

    return section.items.every((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") return false;
      const item = rawItem as Record<string, unknown>;
      if (typeof item.id !== "string") return false;
      if (typeof item.question !== "string") return false;
      if (!Number.isFinite(item.page)) return false;
      return toValuesMap(item.values) !== null;
    });
  });

  return sectionsValid;
}

function parsePayload(raw: unknown): ChatRequestPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!prompt) return null;

  const selectedProductIds = Array.isArray(row.selectedProductIds)
    ? row.selectedProductIds
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, MAX_SELECTED_PRODUCTS)
    : [];

  const selectedCategoryTitles = Array.isArray(row.selectedCategoryTitles)
    ? row.selectedCategoryTitles
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, MAX_SELECTED_SECTIONS)
    : [];

  const history = Array.isArray(row.history)
    ? row.history
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item): ChatHistoryMessage => {
          const role: ChatHistoryMessage["role"] =
            item.role === "assistant" ? "assistant" : "user";
          return {
            role,
            text: typeof item.text === "string" ? item.text.trim() : "",
          };
        })
        .filter((item) => item.text.length > 0)
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

  return {
    prompt: prompt.slice(0, PROMPT_MAX_LEN),
    selectedProductIds: Array.from(new Set(selectedProductIds)),
    selectedCategoryTitles: Array.from(new Set(selectedCategoryTitles)),
    onlyDifferences: row.onlyDifferences === true,
    history,
  };
}

function valuesAreDifferent(item: ComparisonItem, productIds: string[]): boolean {
  if (productIds.length < 2) return false;
  const normalizedValues = productIds.map((productId) =>
    normalizeSearchValue(item.values[productId] ?? "")
  );
  return new Set(normalizedValues).size > 1;
}

function trimForInline(value: string, maxLen = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trimEnd()}…`;
}

function displayProductLabel(product: ComparisonProduct): string {
  const insurer = product.insurer.trim();
  const name = product.name.trim();
  if (!insurer) return name || product.id;
  if (!name) return insurer;
  return `${insurer} ${name}`;
}

function buildCitation(sectionTitle: string, item: ComparisonItem): AssistantCitation {
  return {
    section: sectionTitle,
    page: item.page,
    id: item.id,
    question: item.question,
  };
}

function citationToken(citation: AssistantCitation): string {
  return `[${citation.section} | str. ${citation.page} | ${citation.id}]`;
}

function buildEffectivePrompt(prompt: string, history: ChatHistoryMessage[]): string {
  const base = prompt.trim();
  const normalizedBase = normalizeSearchValue(base);
  const tokens = tokenizeNormalized(base);
  const followUpPhrases = [
    "a co",
    "a jak",
    "a kde",
    "a kdyz",
    "a u",
    "a v tom",
    "a tam",
    "u nich",
    "u toho",
    "v tom",
    "tam",
    "coze",
    "proc",
    "a proc",
    "co tim myslis",
  ];
  const looksFollowUp =
    followUpPhrases.some(
      (phrase) => normalizedBase === phrase || normalizedBase.startsWith(`${phrase} `)
    ) ||
    (tokens.length <= 2 && ["ano", "ne", "proc", "coze", "jakto"].includes(tokens[0] ?? ""));

  if (!looksFollowUp) return base;

  const previousUser = [...history]
    .reverse()
    .find((message) => message.role === "user" && normalizeSearchValue(message.text) !== normalizedBase);

  if (!previousUser) return base;
  return `${previousUser.text}\nNavazující dotaz: ${base}`;
}

function detectIntent(promptNormalized: string): ChatIntent {
  const compareTerms = ["porovnej", "srovnej", "vs", "versus", "oproti", "vuci", "proti"];
  const differenceTerms = [
    "rozdil",
    "rozdily",
    "lisi",
    "odlis",
    "v cem se lisi",
    "co se lisi",
    "kde se lisi",
  ];
  const summaryTerms = ["shrn", "souhrn", "sekce", "sekci", "kategorie", "kapitola"];
  const bestTerms = [
    "nejlepsi",
    "nejvhodnejsi",
    "co je lepsi",
    "ktery je lepsi",
    "je lepsi",
    "vhodnejsi",
    "vyhodnejsi",
    "doporuc",
    "vybral",
    "zvolil",
  ];
  const asksWhichIsBetter =
    /(lepsi|vhodnejsi|vyhodnejsi).*(nebo|vs|versus|oproti)/.test(promptNormalized) ||
    /(nebo|vs|versus|oproti).*(lepsi|vhodnejsi|vyhodnejsi)/.test(promptNormalized);

  if (asksWhichIsBetter) return "best_product";
  if (hasAnyPhrase(promptNormalized, bestTerms)) return "best_product";
  if (hasAnyPhrase(promptNormalized, differenceTerms)) return "differences";
  if (hasAnyPhrase(promptNormalized, compareTerms)) return "compare";
  if (hasAnyPhrase(promptNormalized, summaryTerms)) return "section_summary";
  return "lookup";
}

const TERM_HINTS: Record<string, string[]> = {
  invalid: [
    "invalid",
    "invalidita",
    "duchod",
    "stupe",
    "pokles pracovni schopnosti",
    "rozpor",
    "ossz",
  ],
  alkohol: ["alkohol", "promil", "promile", "krac", "sniz", "pod vlivem"],
  vypoved: [
    "vypoved",
    "vypovedet",
    "vypovedni",
    "vypoveditelnost",
    "lhut",
    "zanik",
    "ukonc",
    "zrus",
  ],
  zanik: ["zanik", "ukonc", "zrus", "vypoved", "lhut"],
  cekac: ["cekac", "cekaci", "karenc", "karencni", "lhut", "doba"],
  karenc: ["cekac", "cekaci", "karenc", "karencni", "lhut"],
  vyluk: ["vyluk", "vyjimk", "omezen", "neplni", "nehradi", "nevyplaci", "nevztahuje"],
  smrt: ["smrt", "umrti", "zemre", "zemrel"],
  uraz: ["uraz", "urazem", "trval", "nasledk", "tnu"],
  nemoc: ["nemoc", "diagnoz", "hospitaliz", "pracovni neschopnost"],
  pojistn: ["pojistne", "platba", "mesicn", "rocni", "frekvence"],
  rakovin: ["rakovin", "karcinom", "nador", "onkolog", "in situ", "tnm", "t1"],
  nador: ["rakovin", "karcinom", "nador", "onkolog", "in situ", "tnm", "t1"],
  opce: ["opce", "navyseni", "navysit", "zivotni udalost", "svatba", "dite", "hypoteka"],
  indexace: ["indexace", "navyseni", "inflace"],
};

const QUERY_STOPWORDS = new Set([
  "jaka",
  "jaky",
  "jake",
  "ktera",
  "ktery",
  "ktere",
  "kdo",
  "co",
  "jak",
  "kde",
  "proc",
  "prosim",
  "navazujici",
  "dotaz",
  "coze",
  "pojistovna",
  "pojistovny",
  "produkt",
  "produkty",
  "u",
  "v",
  "na",
  "za",
  "a",
  "ale",
  "mi",
  "me",
  "je",
  "jsou",
  "by",
  "bych",
  "to",
  "se",
  "si",
  "od",
  "do",
]);

const CAPABILITY_PATTERNS = [
  /co vsechno umis/,
  /co umis/,
  /co dokazes/,
  /jak mi pomuzes/,
  /s cim mi pomuzes/,
  /^help\b/,
  /^napoveda\b/,
];

const DEFINITION_PATTERNS = [
  /^co je\b/,
  /^co znamena\b/,
  /^vysvetli pojem\b/,
  /^jak funguje\b/,
  /^k cemu je\b/,
];

const GENERAL_LIFE_ADVICE_PATTERNS = [
  /^proc\b/,
  /^kdy\b/,
  /^k cemu\b/,
  /^pro koho\b/,
  /^ma smysl\b/,
  /^má smysl\b/,
  /^vyplati se\b/,
  /^vyplatí se\b/,
  /^potrebuji\b/,
  /^potřebuji\b/,
  /proc .*zivotni pojist/,
  /proč .*životní pojist/,
  /kdy .*zivotni pojist/,
  /kdy .*životní pojist/,
  /k cemu .*zivotni pojist/,
  /k čemu .*životní pojist/,
  /pro koho .*zivotni pojist/,
  /pro koho .*životní pojist/,
  /vyhody .*zivotni pojist/,
  /výhody .*životní pojist/,
  /nevyhody .*zivotni pojist/,
  /nevýhody .*životní pojist/,
  /duvod.*zivot/,
  /duvodu.*zivot/,
  /proc mit .*zivot/,
  /proc .*mit .*zivot/,
  /proc .*mit .*pojist/,
];

const PRODUCT_HINT_PATTERNS = [
  /allianz/,
  /cpp/,
  /ceska podnikatelska/,
  /csob/,
  /generali/,
  /komercni pojistovna/,
  /kooperativa/,
  /\bnn\b/,
  /uniqa/,
  /metlife/,
  /maxima/,
  /pillow/,
  /simplea/,
  /slavia/,
  /flexi/,
  /neon/,
  /orange risk/,
  /bel mondo/,
  /partners zivot/,
  /zivot radost/,
];

const CLIENT_EXPLANATION_PATTERNS = [
  /pro klienta/,
  /klientovi/,
  /vysvetli.*klient/,
  /jednoduse/,
  /lidsky/,
  /argument/,
  /obchodn/,
  /prodejn/,
];

const WEB_SEARCH_PATTERNS = [
  /internet/,
  /web/,
  /online/,
  /dohled/,
  /over/,
  /ověr/,
  /aktual/,
  /nejnovejs/,
  /dnes/,
  /202[6-9]/,
  /zakon/,
  /zákon/,
  /obcansky zakonik/,
  /občanský zákoník/,
  /legislativ/,
  /dan/,
  /daň/,
  /financni arbitr/,
  /cn b/,
  /cnb/,
  /formular/,
  /formulář/,
  /postup/,
  /vypoved/,
  /vypověd/,
  /vypovedni/,
  /vypovědní/,
  /lhut/,
  /lhůt/,
  /ukonc/,
  /ukonč/,
  /zrus/,
  /zruš/,
  /odstoupen/,
  /odkupn/,
  /pojistn.*smlouv/,
];

const CANCELLATION_PROCESS_PATTERNS = [
  /vypoved/,
  /vypověd/,
  /vypovedni/,
  /vypovědní/,
  /lhut.*vypoved/,
  /lhůt.*vypověd/,
  /ukonc.*smlouv/,
  /ukonč.*smlouv/,
  /zrus.*smlouv/,
  /zruš.*smlouv/,
  /odstoupen.*smlouv/,
  /odkupn/,
  /jak .*vypoved/,
  /jak .*vypověd/,
  /jak .*zrus/,
  /jak .*zruš/,
  /jak .*ukonc/,
  /jak .*ukonč/,
  /postup.*vypoved/,
  /postup.*zrus/,
  /vzor.*vypoved/,
  /formular.*vypoved/,
];

const DOMAIN_HINT_STEMS = [
  "pojist",
  "srovn",
  "porovn",
  "produkt",
  "pojistn",
  "plnen",
  "vyluk",
  "vypoved",
  "lhut",
  "ukonc",
  "zrus",
  "karenc",
  "cekac",
  "invalid",
  "rakovin",
  "onkolog",
  "diagnoz",
  "smrt",
  "uraz",
  "nemoc",
  "hospital",
  "klient",
  "rizik",
  "vypl",
];

function isDomainPrompt(promptNormalized: string): boolean {
  if (!promptNormalized) return false;
  if (PRODUCT_HINT_PATTERNS.some((pattern) => pattern.test(promptNormalized))) return true;
  if (DOMAIN_HINT_STEMS.some((stem) => promptNormalized.includes(stem))) return true;
  if (detectIntent(promptNormalized) !== "lookup") return true;
  return false;
}

function isCapabilitiesPrompt(promptNormalized: string): boolean {
  return CAPABILITY_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function isDefinitionPrompt(promptNormalized: string): boolean {
  return DEFINITION_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function isGeneralLifeAdvicePrompt(promptNormalized: string): boolean {
  if (PRODUCT_HINT_PATTERNS.some((pattern) => pattern.test(promptNormalized))) {
    return false;
  }
  if (!/(zivotni pojist|zivotk|pojisteni|pojistka|pojistku|pojisteni zivota|rizikove pojist)/.test(promptNormalized)) {
    return false;
  }
  return GENERAL_LIFE_ADVICE_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function isClientExplanationPrompt(promptNormalized: string): boolean {
  return CLIENT_EXPLANATION_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function shouldUseWebSearch(promptNormalized: string): boolean {
  if (!ENABLE_WEB_SEARCH) return false;
  return WEB_SEARCH_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function isCancellationProcessPrompt(promptNormalized: string): boolean {
  return CANCELLATION_PROCESS_PATTERNS.some((pattern) => pattern.test(promptNormalized));
}

function pickChatRoute(promptNormalized: string, intent: ChatIntent): ChatRoute {
  const domainPrompt = isDomainPrompt(promptNormalized);
  const capabilitiesPrompt = isCapabilitiesPrompt(promptNormalized);
  const clientExplanation = isClientExplanationPrompt(promptNormalized);
  const definitionPrompt = isDefinitionPrompt(promptNormalized);
  const generalAdvicePrompt = isGeneralLifeAdvicePrompt(promptNormalized);
  const webSearch = shouldUseWebSearch(promptNormalized);
  const cancellationProcess = isCancellationProcessPrompt(promptNormalized);
  const complexIntent = intent === "best_product" || intent === "compare" || intent === "differences";

  if (!domainPrompt && !capabilitiesPrompt) {
    return {
      kind: "smalltalk",
      usesTableContext: false,
      usesWebSearch: webSearch,
      usesStructuredOutput: false,
      model: OPENAI_SMALLTALK_MODEL,
      maxOutputTokens: webSearch ? 700 : OPENAI_SMALLTALK_MAX_OUTPUT_TOKENS,
      maxContextItems: 0,
      styleInstruction:
        webSearch
          ? "Odpověz přirozeně a použij web jen pro aktuální faktickou informaci. Uveď zdroje."
          : "Odpověz jako normální chat: krátce, přirozeně a bez tahání uživatele do životního pojištění, pokud se na něj neptá.",
    };
  }

  if (capabilitiesPrompt) {
    return {
      kind: "capabilities",
      usesTableContext: false,
      usesWebSearch: false,
      usesStructuredOutput: false,
      model: OPENAI_MODEL,
      maxOutputTokens: 600,
      maxContextItems: 0,
      styleInstruction:
        "Vysvětli stručně, co umíš v tomto srovnávači. Buď konkrétní: porovnání produktů, rozdíly, vysvětlení pro klienta, citace z tabulek.",
    };
  }

  if ((definitionPrompt || generalAdvicePrompt || cancellationProcess) && !complexIntent) {
    return {
      kind: "general_life",
      usesTableContext: definitionPrompt && !generalAdvicePrompt && !cancellationProcess && domainPrompt,
      usesWebSearch: webSearch || cancellationProcess,
      usesStructuredOutput: false,
      model: OPENAI_MODEL,
      maxOutputTokens: webSearch || cancellationProcess ? 900 : 700,
      maxContextItems: definitionPrompt && !generalAdvicePrompt && !cancellationProcess ? 20 : 0,
      styleInstruction:
        cancellationProcess
          ? "Vysvětli praktický postup ke zrušení nebo výpovědi smlouvy v ČR. U aktuálních právních nebo institucionálních tvrzení použij web a uveď zdroje."
          : generalAdvicePrompt
            ? "Odpověz jako specializovaný poradce na životní pojištění. Nepoužívej tabulky, pokud se uživatel neptá na konkrétní produkt, pojišťovnu nebo kritérium."
            : "Vysvětli obecný pojem ze životního pojištění jasně a prakticky. Neuváděj produktová fakta, pokud nejsou v datech.",
    };
  }

  if (clientExplanation) {
    return {
      kind: "client_explanation",
      usesTableContext: domainPrompt,
      usesWebSearch: webSearch,
      usesStructuredOutput: domainPrompt,
      model: complexIntent ? OPENAI_COMPLEX_MODEL : OPENAI_MODEL,
      maxOutputTokens: complexIntent ? OPENAI_COMPLEX_MAX_OUTPUT_TOKENS : OPENAI_MAX_OUTPUT_TOKENS,
      maxContextItems: complexIntent ? 44 : 28,
      styleInstruction:
        "Odpověz poradensky pro použití s klientem: nejdřív jedna přímá věta, potom jednoduché argumenty. Nepoužívej interní technický tón.",
    };
  }

  if (intent === "best_product") {
    return {
      kind: "advisor_recommendation",
      usesTableContext: true,
      usesWebSearch: webSearch,
      usesStructuredOutput: true,
      model: OPENAI_COMPLEX_MODEL,
      maxOutputTokens: OPENAI_COMPLEX_MAX_OUTPUT_TOKENS,
      maxContextItems: 44,
      styleInstruction:
        "Dej poradenské doporučení pouze podle dat. Nevyhlašuj absolutního vítěze bez priorit klienta; uveď, pro koho která varianta dává smysl.",
    };
  }

  if (intent === "compare" || intent === "differences") {
    return {
      kind: "table_compare",
      usesTableContext: true,
      usesWebSearch: webSearch,
      usesStructuredOutput: true,
      model: OPENAI_COMPLEX_MODEL,
      maxOutputTokens: OPENAI_COMPLEX_MAX_OUTPUT_TOKENS,
      maxContextItems: 44,
      styleInstruction:
        "Porovnej věcně a strukturovaně. Začni nejdůležitějším rozdílem, pak napiš konkrétní body podle tabulek.",
    };
  }

  return {
    kind: "table_lookup",
    usesTableContext: true,
    usesWebSearch: webSearch,
    usesStructuredOutput: true,
    model: OPENAI_MODEL,
    maxOutputTokens: OPENAI_MAX_OUTPUT_TOKENS,
    maxContextItems: 32,
    styleInstruction:
      "Odpověz přímo na dotaz. Pokud tabulky obsahují jen související údaj, řekni to krátce a neuhýbej do obecných témat.",
  };
}

function detectQueryTraits(promptNormalized: string): QueryTraits {
  const asksInsurer =
    /(jaka|ktera|ktery)\s+(pojistovna|pojistovny|produkt|produkty)/.test(promptNormalized) ||
    /(kdo)\s+/.test(promptNormalized);
  const asksNegative =
    /(neplni|neplnen|bez plneni|vyluk|vyjimk|0%|nehradi|nevyplaci)/.test(promptNormalized);
  const isCancer =
    /(rakovin|karcinom|nador|onkolog|melanom|lymfom|leukemi|tnm|in situ)/.test(promptNormalized);
  const isEarlyPhase =
    /(rane|ranne|nejrane|in situ|t1|t1n0m0|stadium i|stadiu i)/.test(promptNormalized);

  return { asksInsurer, asksNegative, isCancer, isEarlyPhase };
}

function expandToken(token: string): string[] {
  const expanded = new Set<string>([token]);
  if (token.length >= 5) expanded.add(token.slice(0, token.length - 1));
  if (token.length >= 6) expanded.add(token.slice(0, token.length - 2));
  if (token.length >= 4) expanded.add(token.slice(0, 4));

  if (token.startsWith("rakovin") || token.startsWith("karcin") || token.startsWith("nador")) {
    ["rakovin", "karcinom", "nador", "onkolog", "in situ", "tnm", "t1"].forEach((item) =>
      expanded.add(item)
    );
  }
  if (token.startsWith("ran") || token.startsWith("faze") || token.startsWith("stad")) {
    ["rane", "nejrane", "in situ", "t1", "t1n0m0"].forEach((item) => expanded.add(item));
  }
  if (token.startsWith("nepl") || token.startsWith("vyluk") || token === "0") {
    ["nepln", "bez plneni", "vyluk", "0%"].forEach((item) => expanded.add(item));
  }
  if (token.startsWith("vypoved") || token.startsWith("zanik") || token.startsWith("ukonc")) {
    ["vypoved", "vypovedet", "vypovedni", "vypoveditelnost", "zanik", "ukonc", "lhut"].forEach(
      (item) => expanded.add(item)
    );
  }
  if (token.startsWith("lhut") || token.startsWith("doba")) {
    ["lhut", "doba", "cekac", "karenc", "vypovedni"].forEach((item) => expanded.add(item));
  }
  if (token.startsWith("opce") || token.startsWith("navys")) {
    ["opce", "navyseni", "navysit", "zivotni udalost", "svatba", "dite"].forEach((item) =>
      expanded.add(item)
    );
  }

  return Array.from(expanded);
}

function buildQueryTerms(promptNormalized: string, traits: QueryTraits): string[] {
  const tokens = tokenizeNormalized(promptNormalized).filter(
    (token) => token.length >= 3 && !QUERY_STOPWORDS.has(token)
  );
  const terms = new Set<string>();

  tokens.forEach((token) => {
    expandToken(token).forEach((item) => terms.add(item));
  });

  Object.entries(TERM_HINTS).forEach(([stem, hints]) => {
    if (promptNormalized.includes(stem)) {
      hints.forEach((hint) => terms.add(hint));
    }
  });

  if (traits.isCancer) {
    ["rakovin", "karcinom", "nador", "onkolog", "in situ", "tnm", "t1"].forEach((item) =>
      terms.add(item)
    );
  }
  if (traits.isEarlyPhase) {
    ["rane", "nejrane", "in situ", "t1", "t1n0m0"].forEach((item) => terms.add(item));
  }
  if (traits.asksNegative) {
    ["nepln", "vyluk", "0%", "bez plneni", "nevyplaci"].forEach((item) => terms.add(item));
  }

  return Array.from(terms).slice(0, 60);
}

function productAliases(product: ComparisonProduct): string[] {
  const rawParts = [
    product.id,
    product.insurer,
    product.name,
    product.version,
    `${product.insurer} ${product.name}`,
  ];
  const aliases = new Set<string>();

  rawParts.forEach((part) => {
    const normalized = normalizeSearchValue(part);
    if (normalized.length >= 3) aliases.add(normalized);
    tokenizeNormalized(part)
      .filter((token) => token.length >= 4)
      .forEach((token) => aliases.add(token));
  });

  if (normalizeSearchValue(product.insurer) === "cpp") {
    aliases.add("cpp");
    aliases.add("ceska podnikatelska");
  }
  if (normalizeSearchValue(product.insurer).includes("kooperativa")) {
    aliases.add("koop");
    aliases.add("kooperativa");
  }
  if (normalizeSearchValue(product.insurer).includes("generali")) {
    aliases.add("generali");
  }
  if (normalizeSearchValue(product.insurer) === "nn") {
    aliases.add("nn");
  }
  if (normalizeSearchValue(product.insurer).includes("uniqa")) {
    aliases.add("uniqa");
  }

  return Array.from(aliases);
}

function inferPromptProductIds(
  products: ComparisonProduct[],
  selectedProductIds: string[],
  promptNormalized: string
): string[] {
  const selectedSet =
    selectedProductIds.length > 0 ? new Set(selectedProductIds) : new Set(products.map((p) => p.id));
  const matched = products.filter((product) => {
    if (!selectedSet.has(product.id)) return false;
    return productAliases(product).some((alias) => {
      if (alias.length < 3) return false;
      return promptNormalized.includes(alias);
    });
  });

  if (matched.length === 0) return [];
  if (matched.length >= selectedSet.size) return [];
  return matched.map((product) => product.id);
}

function buildScopedPack(
  payload: ComparisonPayload,
  selectedProductIds: string[],
  selectedCategoryTitles: string[],
  onlyDifferences: boolean,
  promptNormalized: string,
  traits: QueryTraits
): ScopedPack {
  const requestedProducts =
    selectedProductIds.length > 0
      ? payload.products.filter((product) => selectedProductIds.includes(product.id))
      : payload.products.slice();

  const fallbackRequestedProducts =
    requestedProducts.length > 0 ? requestedProducts : payload.products.slice();
  const requestedProductIdsInOrder = fallbackRequestedProducts.map((product) => product.id);

  const sectionFilterSet =
    selectedCategoryTitles.length > 0
      ? new Set(selectedCategoryTitles.map((title) => title.trim()))
      : null;

  const scopedSections: ComparisonSection[] = [];

  payload.sections.forEach((section) => {
    if (sectionFilterSet && !sectionFilterSet.has(section.title)) return;

    const scopedItems = section.items
      .map((item) => {
        const scopedValues: Record<string, string> = {};
        requestedProductIdsInOrder.forEach((productId) => {
          scopedValues[productId] = item.values[productId] ?? "";
        });
        return {
          id: item.id,
          page: item.page,
          question: item.question,
          values: scopedValues,
        };
      })
      .filter((item) =>
        onlyDifferences ? valuesAreDifferent(item, requestedProductIdsInOrder) : true
      );

    if (scopedItems.length > 0) {
      scopedSections.push({ title: section.title, items: scopedItems });
    }
  });

  const filledCounts = new Map<string, number>();
  fallbackRequestedProducts.forEach((product) => filledCounts.set(product.id, 0));

  scopedSections.forEach((section) => {
    section.items.forEach((item) => {
      fallbackRequestedProducts.forEach((product) => {
        const normalizedValue = normalizeSearchValue(item.values[product.id] ?? "");
        if (normalizedValue && normalizedValue !== "-" && normalizedValue !== "—") {
          filledCounts.set(product.id, (filledCounts.get(product.id) ?? 0) + 1);
        }
      });
    });
  });

  const selectedProducts = fallbackRequestedProducts.filter(
    (product) => (filledCounts.get(product.id) ?? 0) > 0
  );
  const activeProducts = selectedProducts.length > 0 ? selectedProducts : fallbackRequestedProducts;
  const activeProductIds = activeProducts.map((product) => product.id);

  const withoutDataLabels = fallbackRequestedProducts
    .filter((product) => (filledCounts.get(product.id) ?? 0) === 0)
    .map((product) => displayProductLabel(product));

  const prunedSections =
    selectedProducts.length > 0
      ? scopedSections
          .map((section) => ({
            title: section.title,
            items: section.items.map((item) => {
              const prunedValues: Record<string, string> = {};
              activeProductIds.forEach((productId) => {
                prunedValues[productId] = item.values[productId] ?? "";
              });
              return {
                id: item.id,
                page: item.page,
                question: item.question,
                values: prunedValues,
              };
            }),
          }))
          .filter((section) => section.items.length > 0)
      : [];

  const terms = buildQueryTerms(promptNormalized, traits);
  const scopedItems: ScopedContextItem[] = [];

  prunedSections.forEach((section) => {
    section.items.forEach((item) => {
      const normalizedQuestion = normalizeSearchValue(item.question);
      const normalizedSection = normalizeSearchValue(section.title);
      const normalizedValueRows = Object.values(item.values).map(normalizeSearchValue);
      const normalizedValues = normalizedValueRows.join(" ");
      const filledValues = normalizedValueRows.filter((value) => value && value !== "-" && value !== "—");
      const normalizedHaystack = `${normalizedSection} ${normalizedQuestion} ${item.id} ${normalizedValues}`;

      let score = 0;
      if (promptNormalized && normalizedHaystack.includes(promptNormalized)) score += 10;

      terms.forEach((term) => {
        if (normalizedQuestion.includes(term)) score += 4;
        if (normalizedSection.includes(term)) score += 2;
        if (normalizedValues.includes(term)) score += 5;
      });

      const completenessRatio =
        activeProductIds.length > 0 ? filledValues.length / activeProductIds.length : 0;
      score += Math.round(completenessRatio * 4);
      if (completenessRatio < 0.25) score -= 3;

      if (traits.isCancer && /(rakovin|karcinom|nador|onkolog|melanom|lymfom|leukemi|tnm|in situ)/.test(normalizedHaystack)) {
        score += 14;
      }
      if (traits.isEarlyPhase && /(rane|nejrane|in situ|t1|t1n0m0|stadium i|stadiu i)/.test(normalizedHaystack)) {
        score += 10;
      }
      if (traits.asksNegative && /(nepln|vyluk|0%|bez plneni|nevyplaci|nevztahuje)/.test(normalizedValues)) {
        score += 8;
      }

      scopedItems.push({
        sectionTitle: section.title,
        item,
        differs: valuesAreDifferent(item, activeProductIds),
        score,
      });
    });
  });

  scopedItems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.item.page !== b.item.page) return a.item.page - b.item.page;
    return a.item.id.localeCompare(b.item.id, "cs");
  });

  const totalItems = prunedSections.reduce((sum, section) => sum + section.items.length, 0);

  return {
    requestedProducts: fallbackRequestedProducts,
    selectedProducts: activeProducts,
    sections: prunedSections,
    items: scopedItems,
    totalItems,
    dataCoverage: {
      requestedCount: fallbackRequestedProducts.length,
      withDataCount: selectedProducts.length,
      withoutDataLabels,
    },
  };
}

function buildContextRows(
  pack: ScopedPack,
  limit = MAX_CONTEXT_ITEMS
): { rows: string[]; usedItemsCount: number } {
  const picked = pack.items.slice(0, limit);
  const rows = picked.map(({ sectionTitle, item }) => {
    const valuesText = pack.selectedProducts
      .map((product) => {
        const value = (item.values[product.id] ?? "").trim();
        return `${product.insurer} ${product.name}: ${value || "—"}`;
      })
      .join(" | ");

    return `- [${sectionTitle} | str. ${item.page} | ${item.id}] ${item.question}\n  ${valuesText}`;
  });

  return { rows, usedItemsCount: rows.length };
}

function sectionCandidates(pack: ScopedPack, promptNormalized: string): Array<{ title: string; score: number }> {
  const terms = buildQueryTerms(promptNormalized, detectQueryTraits(promptNormalized));

  return pack.sections
    .map((section) => {
      const normalized = normalizeSearchValue(section.title);
      let score = 0;
      if (promptNormalized && normalized.includes(promptNormalized)) score += 8;
      terms.forEach((term) => {
        if (normalized.includes(term)) score += 2;
      });
      return { title: section.title, score };
    })
    .sort((a, b) => b.score - a.score);
}

function shortProductLabel(product: ComparisonProduct): string {
  const insurer = product.insurer.trim();
  const name = product.name.trim();
  if (!name) return insurer;
  if (normalizeSearchValue(name).includes(normalizeSearchValue(insurer))) return name;
  return `${insurer} ${name}`;
}

function dedupeRowsByQuestion(rows: ScopedContextItem[]): ScopedContextItem[] {
  const seen = new Set<string>();
  const output: ScopedContextItem[] = [];

  rows.forEach((row) => {
    const key = normalizeSearchValue(row.item.question);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(row);
  });

  return output;
}

function rowHasUsefulSignal(row: ScopedContextItem, products: ComparisonProduct[]): boolean {
  const values = products.map((product) => normalizeSearchValue(row.item.values[product.id] ?? ""));
  const filledValues = values.filter((value) => value && value !== "-" && value !== "—");
  if (filledValues.length === 0) return false;

  const unique = new Set(filledValues);
  if (unique.size > 1) return true;

  const normalized = filledValues[0] ?? "";
  if (!normalized) return false;
  if (normalized.length >= 6) return true;
  return /(ano|ne|pln|vyluk|%|limit|dnu|mesic|rok|cekac)/.test(normalized);
}

function valuesGrouped(
  item: ComparisonItem,
  products: ComparisonProduct[]
): Array<{ value: string; productLabels: string[] }> {
  const groups = new Map<string, { value: string; productLabels: string[] }>();

  products.forEach((product) => {
    const raw = trimForInline(item.values[product.id] ?? "—");
    const key = normalizeSearchValue(raw) || "—";
    const current = groups.get(key);
    if (current) {
      current.productLabels.push(shortProductLabel(product));
      return;
    }
    groups.set(key, {
      value: raw,
      productLabels: [shortProductLabel(product)],
    });
  });

  return Array.from(groups.values()).sort((a, b) => b.productLabels.length - a.productLabels.length);
}

function rowDetail(row: ScopedContextItem, products: ComparisonProduct[]): string {
  if (products.length <= MAX_PRODUCTS_PER_BULLET) {
    return products
      .map((product) => `• ${shortProductLabel(product)}: ${trimForInline(row.item.values[product.id] ?? "—")}`)
      .join("\n");
  }

  const groups = valuesGrouped(row.item, products).slice(0, MAX_VALUE_GROUPS);

  return groups
    .map((group) => {
      const sample = group.productLabels.slice(0, 3).join(", ");
      const rest = group.productLabels.length > 3 ? ` +${group.productLabels.length - 3}` : "";
      return `• ${group.productLabels.length}× "${group.value}" (${sample}${rest})`;
    })
    .join("\n");
}

function bulletFromRow(row: ScopedContextItem, products: ComparisonProduct[]): AssistantBullet {
  return {
    title: row.item.question,
    detail: rowDetail(row, products),
    citations: [buildCitation(row.sectionTitle, row.item)],
  };
}

function uniqueCitations(bullets: AssistantBullet[]): AssistantCitation[] {
  const seen = new Set<string>();
  const citations: AssistantCitation[] = [];

  bullets.forEach((bullet) => {
    bullet.citations.forEach((citation) => {
      const key = `${citation.section}::${citation.page}::${citation.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      citations.push(citation);
    });
  });

  return citations;
}

function defaultFollowups(intent: ChatIntent, pack: ScopedPack): string[] {
  const topSection = pack.sections[0]?.title ?? "Invalidita";

  const byIntent: Record<ChatIntent, string[]> = {
    compare: [
      "Které 3 rozdíly jsou pro klienta nejdůležitější?",
      `Shrň mi sekci „${topSection}“ v jednoduchých bodech.`,
      "Porovnej jen produkty s největším krytím invalidity.",
    ],
    differences: [
      "Vysvětli mi rozdíly jednoduše pro klienta.",
      "Kde jsou největší rozdíly v čekacích dobách?",
      "Kde jsou největší rozdíly ve výlukách?",
    ],
    section_summary: [
      "V které části jsou největší rizika pro klienta?",
      "Co z toho bych měl určitě klientovi vysvětlit?",
      "Porovnej teď stejnou sekci jen pro 3 top produkty.",
    ],
    best_product: [
      "Klient řeší hlavně invaliditu a výluky. Co doporučíš?",
      "Klient chce co nejvyšší pojistné plnění. Které produkty porovnat?",
      "Připrav mi argumentaci pro 2 nejlepší varianty.",
    ],
    lookup: [
      "Shrň to ve 3 bodech pro klienta.",
      "Kde jsou v tom největší rozdíly?",
      "Doporuč další dotaz, který má teď smysl řešit.",
    ],
  };

  return byIntent[intent].slice(0, MAX_FOLLOWUPS);
}

function buildRouteFallbackAnswer(
  route: ChatRoute,
  intent: ChatIntent,
  pack: ScopedPack,
  promptNormalized: string,
  traits: QueryTraits
): AssistantStructuredAnswer {
  if (route.kind === "smalltalk") {
    return {
      summary: "Jsem tady. Napiš mi, co potřebuješ vyřešit.",
      bullets: [],
      citations: [],
      followups: [],
      intent,
    };
  }

  if (route.kind === "capabilities") {
    const bullets: AssistantBullet[] = [
      {
        title: "Data ze srovnávače",
        detail:
          "Umím porovnat vybrané produkty, najít rozdíly v kritériích a citovat konkrétní řádky tabulek.",
        citations: [],
      },
      {
        title: "Poradenské vysvětlení",
        detail:
          "Umím převést technické odpovědi do jednoduchých bodů pro klienta, včetně výluk, invalidity, čekacích dob nebo rakoviny.",
        citations: [],
      },
      {
        title: "Obecné otázky k životku",
        detail:
          "Umím odpovídat i na obecné dotazy k životnímu pojištění. Aktuální právní nebo webové informace má ověřovat OpenAI přes web search.",
        citations: [],
      },
    ];

    return {
      summary: "Umím fungovat jako specializovaný chat pro životní pojištění a zároveň pracovat s daty tohoto srovnávače.",
      bullets,
      citations: [],
      followups: [
        "Jak vypovědět životní pojištění?",
        "Porovnej invaliditu ve vybraných produktech.",
        "Vysvětli výluky klientovi ve 3 bodech.",
      ],
      intent,
    };
  }

  if (route.kind === "general_life" && isCancellationProcessPrompt(promptNormalized)) {
    const bullets: AssistantBullet[] = [
      {
        title: "Co připravit",
        detail:
          "Uveď číslo smlouvy, identifikaci pojistníka, jasnou žádost o ukončení nebo výpověď, datum a podpis. Doručení řeš prokazatelně: datová schránka, doporučený dopis nebo pobočka s potvrzením.",
        citations: [],
      },
      {
        title: "Na čem záleží lhůta",
        detail:
          "Rozhoduje důvod ukončení, typ smlouvy, pojistné období a pojistné podmínky. Bez aktuálního webového ověření nebudu tvrdit jednu univerzální lhůtu pro všechny smlouvy.",
        citations: [],
      },
      {
        title: "Co ověřit před odesláním",
        detail:
          "Zkontroluj pojistné podmínky konkrétní pojišťovny, případný odkupný nebo daňový dopad a jestli nejde o riziko, které má klient pořád potřebovat.",
        citations: [],
      },
    ];

    return {
      summary:
        "Výpověď životního pojištění řeš písemně a prokazatelně; přesná lhůta se liší podle důvodu ukončení a podmínek smlouvy.",
      bullets,
      citations: [],
      followups: [
        "Připrav mi text výpovědi pro klienta.",
        "Jaký je rozdíl mezi výpovědí a odkupem?",
        "Co má klient ověřit před zrušením smlouvy?",
      ],
      intent,
    };
  }

  if (route.kind === "general_life") {
    const bullets: AssistantBullet[] = [
      {
        title: "Ochrana příjmu",
        detail:
          "Když kvůli nemoci nebo úrazu klient nemůže pracovat, dobře nastavené pojištění může pomoct nahradit výpadek příjmu.",
        citations: [],
      },
      {
        title: "Zajištění rodiny",
        detail:
          "Pokud má partnera, děti nebo hypotéku, pojistka může rodině dát čas a peníze zvládnout těžkou situaci.",
        citations: [],
      },
      {
        title: "Krytí vážných nemocí",
        detail:
          "Rakovina, infarkt, mrtvice nebo jiné vážné diagnózy často znamenají vyšší náklady a delší léčbu. Pojištění může vytvořit finanční rezervu.",
        citations: [],
      },
      {
        title: "Ochrana při invaliditě",
        detail:
          "Invalidita bývá jeden z největších finančních zásahů do života, protože může dlouhodobě snížit schopnost vydělávat.",
        citations: [],
      },
      {
        title: "Klid v hlavě",
        detail:
          "Smyslem není mít pojistku za každou cenu, ale mít jistotu, že při vážném problému nebude klient řešit jen zdraví, ale i okamžitý tlak na peníze.",
        citations: [],
      },
    ];

    return {
      summary:
        "Pět hlavních důvodů, proč mít životní pojištění:",
      bullets,
      citations: [],
      followups: [
        "Jak to vysvětlit klientovi jednoduše?",
        "Kdy životní pojištění naopak nedává smysl?",
        "Jak nastavit priority krytí?",
      ],
      intent,
    };
  }

  return buildDeterministicStructuredAnswer(intent, pack, promptNormalized, traits);
}

function formatProductList(labels: string[], limit = 8): string {
  if (labels.length === 0) return "—";
  const head = labels.slice(0, limit).join(", ");
  const rest = labels.length > limit ? ` +${labels.length - limit}` : "";
  return `${head}${rest}`;
}

type CoverageClass = "not_covered" | "limited" | "covered" | "unknown";

function classifyCoverageValue(value: string): CoverageClass {
  const normalized = normalizeSearchValue(value);
  if (!normalized || normalized === "-" || normalized === "—") return "unknown";

  const percentages = Array.from(normalized.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)).map((match) =>
    Number(match[1].replace(",", "."))
  );
  if (percentages.length > 0) {
    const maxValue = Math.max(...percentages);
    const minValue = Math.min(...percentages);
    if (maxValue <= 0) return "not_covered";
    if (maxValue < 100 || minValue < 100) return "limited";
    return "covered";
  }

  if (/(nepln|nelze plnit|bez plneni|stanovena vyluka|nevztahuje|nevyplaci|0%)/.test(normalized)) {
    return "not_covered";
  }

  if (/(jen|omezen|nejrane|rane|in situ|t1|vyluk)/.test(normalized)) return "limited";
  if (/(ano|plneno|plni|kryti)/.test(normalized)) return "covered";
  return "unknown";
}

function buildInsurerQuestionAnswer(
  pack: ScopedPack,
  traits: QueryTraits,
  intent: ChatIntent
): AssistantStructuredAnswer | null {
  if (!traits.asksInsurer || (!traits.asksNegative && !traits.isCancer)) return null;
  if (pack.items.length === 0 || pack.selectedProducts.length === 0) return null;
  if (pack.selectedProducts.length < 2) return null;

  const candidates = pack.items
    .filter((row) => rowHasUsefulSignal(row, pack.selectedProducts))
    .filter((row) => {
      const haystack = normalizeSearchValue(
        `${row.sectionTitle} ${row.item.question} ${Object.values(row.item.values).join(" ")}`
      );
      if (
        traits.isCancer &&
        !/(rakovin|karcinom|nador|onkolog|melanom|lymfom|leukemi|tnm|in situ)/.test(haystack)
      ) {
        return false;
      }
      if (
        traits.isEarlyPhase &&
        !/(rane|nejrane|in situ|t1|t1n0m0|stadium i|stadiu i)/.test(haystack)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const scoreA = buildInsurerCandidateScore(a, traits);
      const scoreB = buildInsurerCandidateScore(b, traits);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (a.item.page !== b.item.page) return a.item.page - b.item.page;
      return a.item.id.localeCompare(b.item.id, "cs");
    });

  const picked = (candidates.length > 0 ? candidates : pack.items)[0];
  if (!picked) return null;

  const byCoverage: Record<CoverageClass, string[]> = {
    not_covered: [],
    limited: [],
    covered: [],
    unknown: [],
  };

  pack.selectedProducts.forEach((product) => {
    const value = picked.item.values[product.id] ?? "";
    const coverage = classifyCoverageValue(value);
    byCoverage[coverage].push(shortProductLabel(product));
  });

  const knownCount =
    byCoverage.not_covered.length + byCoverage.limited.length + byCoverage.covered.length;
  if (knownCount === 0) return null;

  const bullets: AssistantBullet[] = [];

  if (byCoverage.not_covered.length > 0) {
    bullets.push({
      title: "Bez plnění / výluka",
      detail: `• ${formatProductList(byCoverage.not_covered)}`,
      citations: [buildCitation(picked.sectionTitle, picked.item)],
    });
  }
  if (byCoverage.limited.length > 0) {
    bullets.push({
      title: "Omezené plnění",
      detail: `• ${formatProductList(byCoverage.limited)}`,
      citations: [buildCitation(picked.sectionTitle, picked.item)],
    });
  }
  if (byCoverage.covered.length > 0) {
    bullets.push({
      title: "Plnění (dle tohoto kritéria)",
      detail: `• ${formatProductList(byCoverage.covered)}`,
      citations: [buildCitation(picked.sectionTitle, picked.item)],
    });
  }
  if (byCoverage.unknown.length > 0) {
    bullets.push({
      title: "Bez jasné informace v aktuálním výběru",
      detail: `• ${formatProductList(byCoverage.unknown)}`,
      citations: [buildCitation(picked.sectionTitle, picked.item)],
    });
  }

  const summaryBase = traits.isCancer
    ? "Našel jsem nejrelevantnější kritérium k rakovině a raným fázím."
    : "Našel jsem nejrelevantnější kritérium k tvému dotazu.";

  return {
    summary: `${summaryBase} Výsledek ber jako pracovní shortlist, detail je vždy v citaci.`,
    bullets: bullets.slice(0, MAX_DETERMINISTIC_ITEMS),
    citations: uniqueCitations(bullets),
    followups: [
      "Ukáž mi jen pojišťovny bez plnění.",
      "Porovnej jen produkty s omezeným plněním.",
      "Shrň rozdíl rané vs. pokročilé fáze v jednoduchých bodech.",
    ].slice(0, MAX_FOLLOWUPS),
    intent,
  };
}

function buildInsurerCandidateScore(row: ScopedContextItem, traits: QueryTraits): number {
  const haystack = normalizeSearchValue(
    `${row.sectionTitle} ${row.item.question} ${Object.values(row.item.values).join(" ")}`
  );

  let score = row.score;
  if (traits.isCancer && /(rakovin|karcinom|nador|onkolog)/.test(haystack)) score += 24;
  if (traits.isEarlyPhase && /(nejrane|rane|in situ|t1|t1n0m0)/.test(haystack)) score += 20;
  if (traits.asksNegative && /(nepln|nelze plnit|vyluk|bez plneni|0%)/.test(haystack)) score += 12;
  if (/pojistne kryti rakoviny|zhoubny nador|karcinom/.test(haystack)) score += 8;
  return score;
}

function buildDataCoverageContext(pack: ScopedPack): string {
  const { requestedCount, withDataCount, withoutDataLabels } = pack.dataCoverage;
  if (requestedCount === 0) return "Bez vybraných produktů.";
  if (withDataCount === requestedCount) {
    return `Vyplněná data jsou dostupná pro všech ${requestedCount} vybraných produktů.`;
  }
  if (withDataCount === 0) {
    return `Vyplněná data nejsou dostupná pro žádný z ${requestedCount} vybraných produktů.`;
  }

  const missingPreview = withoutDataLabels.slice(0, 4).join(", ");
  const rest =
    withoutDataLabels.length > 4 ? ` +${withoutDataLabels.length - 4} dalších` : "";
  return `Vyplněná data jsou dostupná pro ${withDataCount}/${requestedCount} vybraných produktů. Produkty bez dat: ${missingPreview}${rest}. Tuto větu nepiš uživateli automaticky; zohledni ji jen při formulaci odpovědi.`;
}

function structuredToText(answer: AssistantStructuredAnswer): string {
  const bulletLines = answer.bullets.map((bullet) => {
    const citationLine = bullet.citations.map(citationToken).join(" ");
    return `- ${bullet.title}\n${bullet.detail}\n  ${citationLine}`;
  });
  const sourceLines = (answer.sources ?? []).map((source) => `- ${source.title}: ${source.url}`);

  return [
    answer.summary,
    ...bulletLines,
    ...(sourceLines.length > 0 ? ["Zdroje:", ...sourceLines] : []),
  ].join("\n\n");
}

function mergeSources(...sourceGroups: Array<AssistantWebSource[] | undefined>): AssistantWebSource[] {
  const seen = new Set<string>();
  const output: AssistantWebSource[] = [];

  sourceGroups.flatMap((group) => group ?? []).forEach((source) => {
    const url = source.url.trim();
    const title = source.title.trim() || url;
    if (!/^https?:\/\//.test(url)) return;

    const key = url.replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ title, url });
  });

  return output.slice(0, 6);
}

function buildDeterministicStructuredAnswer(
  intent: ChatIntent,
  pack: ScopedPack,
  promptNormalized: string,
  traits: QueryTraits
): AssistantStructuredAnswer {
  const safeSummary = "V poskytnutých datech to nevidím.";

  if (pack.items.length === 0) {
    return {
      summary: safeSummary,
      bullets: [],
      citations: [],
      followups: defaultFollowups(intent, pack),
      intent,
    };
  }

  if (intent === "lookup") {
    const insurerAnswer = buildInsurerQuestionAnswer(pack, traits, intent);
    if (insurerAnswer) {
      return {
        ...insurerAnswer,
        summary: insurerAnswer.summary,
      };
    }
  }

  if ((intent === "compare" || intent === "differences") && pack.selectedProducts.length < 2) {
    return {
      summary: "Pro srovnání vyber alespoň 2 produkty.",
      bullets: [],
      citations: [],
      followups: ["Porovnej tyto 2 produkty.", ...defaultFollowups("compare", pack)].slice(
        0,
        MAX_FOLLOWUPS
      ),
      intent,
    };
  }

  if (intent === "best_product") {
    const differing = dedupeRowsByQuestion(
      pack.items.filter((row) => row.differs && rowHasUsefulSignal(row, pack.selectedProducts))
    ).slice(0, MAX_DETERMINISTIC_ITEMS);
    const coverageRows = pack.selectedProducts
      .map((product) => {
        const filled = pack.items.reduce((count, row) => {
          const value = normalizeSearchValue(row.item.values[product.id] ?? "");
          return count + (value ? 1 : 0);
        }, 0);
        return { product, filled };
      })
      .sort((a, b) => b.filled - a.filled)
      .slice(0, 3);

    const coverageBullet: AssistantBullet = {
      title: "Pokrytí dat u vybraných produktů",
      detail: coverageRows
        .map(
          ({ product, filled }) =>
            `• ${shortProductLabel(product)}: ${filled}/${pack.totalItems} vyplněných kritérií`
        )
        .join("\n"),
      citations: differing[0] ? [buildCitation(differing[0].sectionTitle, differing[0].item)] : [],
    };

    const differenceBullets = differing.map((row) => bulletFromRow(row, pack.selectedProducts));
    const bullets = [coverageBullet, ...differenceBullets].slice(0, MAX_DETERMINISTIC_ITEMS);

    return {
      summary:
        "Univerzálně nejlepší produkt bez priorit klienta z těchto dat neurčím. Níže jsou objektivní podklady pro rozhodnutí.",
      bullets,
      citations: uniqueCitations(bullets),
      followups: defaultFollowups(intent, pack),
      intent,
    };
  }

  if (intent === "section_summary") {
    const candidates = sectionCandidates(pack, promptNormalized);
    const best = candidates[0];

    if (!best || best.score <= 0) {
      const available = pack.sections.slice(0, 8).map((section) => section.title).join(", ");
      return {
        summary: `Upřesni prosím sekci. Dostupné sekce: ${available}.`,
        bullets: [],
        citations: [],
        followups: defaultFollowups(intent, pack),
        intent,
      };
    }

    const sectionRows = dedupeRowsByQuestion(
      pack.items.filter(
        (row) =>
          row.sectionTitle === best.title && rowHasUsefulSignal(row, pack.selectedProducts)
      )
    )
      .slice(0, MAX_DETERMINISTIC_ITEMS)
      .map((row) => bulletFromRow(row, pack.selectedProducts));

    return {
      summary: `Shrnutí sekce „${best.title}“ (${sectionRows.length} nejrelevantnějších bodů).`,
      bullets: sectionRows,
      citations: uniqueCitations(sectionRows),
      followups: defaultFollowups(intent, pack),
      intent,
    };
  }

  if (intent === "compare" || intent === "differences") {
    const differingRows = dedupeRowsByQuestion(
      pack.items.filter(
        (row) => row.differs && rowHasUsefulSignal(row, pack.selectedProducts)
      )
    )
      .slice(0, MAX_DETERMINISTIC_ITEMS)
      .map((row) => bulletFromRow(row, pack.selectedProducts));

    if (differingRows.length === 0) {
      return {
        summary: "V aktuálním výběru nevidím mezi produkty rozdíly v dostupných kritériích.",
        bullets: [],
        citations: [],
        followups: defaultFollowups(intent, pack),
        intent,
      };
    }

    return {
      summary:
        intent === "compare"
          ? `Porovnání: našel jsem ${differingRows.length} hlavních rozdílů.`
          : `Hlavní rozdíly: vybral jsem ${differingRows.length} nejdůležitějších bodů.`,
      bullets: differingRows,
      citations: uniqueCitations(differingRows),
      followups: defaultFollowups(intent, pack),
      intent,
    };
  }

  const lookupRows = dedupeRowsByQuestion(
    pack.items.filter((row) => rowHasUsefulSignal(row, pack.selectedProducts))
  )
    .slice(0, MAX_DETERMINISTIC_ITEMS)
    .map((row) => bulletFromRow(row, pack.selectedProducts));

  if (lookupRows.length === 0) {
    return {
      summary: safeSummary,
      bullets: [],
      citations: [],
      followups: defaultFollowups(intent, pack),
      intent,
    };
  }

  return {
    summary: "Nejrelevantnější body z aktuálního výběru:",
    bullets: lookupRows,
    citations: uniqueCitations(lookupRows),
    followups: defaultFollowups(intent, pack),
    intent,
  };
}

function buildAiPrompt(
  payload: ComparisonPayload,
  prompt: string,
  selectedProductIds: string[],
  selectedCategoryTitles: string[],
  onlyDifferences: boolean,
  contextRows: string[],
  history: ChatHistoryMessage[],
  intent: ChatIntent,
  coverageContext: string,
  route: ChatRoute
): string {
  const selectedProducts =
    selectedProductIds.length > 0
      ? payload.products.filter((product) => selectedProductIds.includes(product.id))
      : payload.products.slice();

  const productLines = selectedProducts.map(
    (product) => `- ${product.id}: ${product.insurer} / ${product.name} / ${product.version}`
  );
  const sectionInfo =
    selectedCategoryTitles.length > 0 ? selectedCategoryTitles.join(", ") : "všechny sekce";
  const historyLines = history.map(
    (message) => `- ${message.role === "assistant" ? "Asistent" : "Uživatel"}: ${message.text}`
  );
  const today = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "long",
    timeZone: "Europe/Prague",
  }).format(new Date());
  const hasTableContext = contextRows.length > 0;
  const productBlock = hasTableContext
    ? ["- Produkty:", ...productLines]
    : ["- Produkty: bez produktového kontextu pro tento dotaz"];
  const dataBlock = hasTableContext
    ? contextRows
    : ["- (bez tabulkového kontextu pro tento dotaz)"];
  const outputInstructions = route.usesStructuredOutput
    ? [
        "Vrať POUZE validní JSON bez markdownu a bez dalších komentářů.",
        "Summary musí být přímá odpověď na poslední dotaz, ne obecný úvod.",
        "Bullets používej jen tehdy, když přidávají hodnotu; pro smalltalk nech bullets i followups prázdné.",
        "Pro table citations použij přesně tokeny v podobě [Sekce | str. X | id], které jsou uvedené v datech. U obecných odpovědí mohou být citations prázdné.",
        "Pro internetové zdroje používej pole sources s title a url. Do table citations nedávej URL.",
        "JSON schema:",
        '{"summary":"string","bullets":[{"title":"string","detail":"string","citations":["[Sekce | str. X | id]"]}],"followups":["string"],"sources":[{"title":"string","url":"string"}]}',
      ]
    : [
        "Odpověz jako ChatGPT: přirozeně, přímo a česky. Nevracej JSON, markdown tabulku ani interní technické údaje.",
        "Když uživatel chce počet důvodů nebo bodů, použij přehledný číslovaný seznam.",
        "Každý bod napiš jako krátký nadpis a jednu praktickou vysvětlující větu.",
        "U obecných poradenských odpovědí nezmiňuj tabulky, filtry ani srovnávač, pokud se na ně uživatel neptá.",
      ];

  return [
    "Jsi interní chat asistent pro srovnavač životního pojištění v češtině.",
    "Chovej se jako užitečný poradenský asistent: odpovídej přirozeně, konkrétně a podle dotazu uživatele.",
    `Režim odpovědi: ${route.kind}. ${route.styleInstruction}`,
    route.usesWebSearch
      ? "Pro aktuální, právní, externí nebo internetové informace použij web search a vrať zdroje v poli sources."
      : "Nepředstírej aktuální internetové ověření. Pokud by bylo potřeba, napiš stručně, že odpověď vychází z dostupného kontextu.",
    "Na běžný společenský chat odpověz normálně a krátce, bez nucení tématu životního pojištění.",
    "Když se dotaz týká konkrétních produktů, pojišťoven, kritérií, rozdílů nebo hodnot ve srovnávači, opři odpověď pouze o dodaná data ze srovnávače.",
    "Když je dotaz obecný k životnímu pojištění a dodaná data ho přímo neřeší, můžeš odpovědět obecným odborným vysvětlením. Jasně odliš obecné vysvětlení od faktů z tabulek.",
    "Nevymýšlej konkrétní produktová fakta, limity, procenta ani výluky, které nejsou v dodaných datech.",
    "Pokud něco v datech chybí, napiš to jen tehdy, když je to nutné pro přímou odpověď na dotaz.",
    "Nepřidávej automatické úvodní věty typu „Pozor: data jsou dostupná jen pro...“.",
    "V detailu zohledni že při velkém počtu produktů má být odpověď přehledná a kompaktní.",
    ...outputInstructions,
    "",
    "Aktivní kontext:",
    `- Dnešní datum: ${today}`,
    `- Route: ${route.kind}`,
    `- Intent: ${intent}`,
    `- Filtr sekcí: ${sectionInfo}`,
    `- Jen rozdíly: ${onlyDifferences ? "ano" : "ne"}`,
    `- Stav dat: ${coverageContext}`,
    ...productBlock,
    "",
    "Konverzační historie:",
    ...(historyLines.length > 0 ? historyLines : ["- (bez historie)"]),
    "",
    "Data ze srovnávače (výřez):",
    ...dataBlock,
    "",
    "Dotaz uživatele:",
    prompt.trim(),
  ].join("\n");
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function looksLikeJsonResponse(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return /"summary"\s*:|"bullets"\s*:|"followups"\s*:/.test(trimmed);
}

function parseAiStructuredAnswer(raw: string): ParsedAiAnswer | null {
  const jsonBlock = extractJsonObject(raw);
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const row = parsed as Record<string, unknown>;
    const summary = typeof row.summary === "string" ? row.summary.trim() : "";
    const bulletsRaw = Array.isArray(row.bullets) ? row.bullets : [];
    if (!summary) return null;

    const bullets = bulletsRaw
      .filter((bullet): bullet is Record<string, unknown> => !!bullet && typeof bullet === "object")
      .map((bullet) => {
        const title = typeof bullet.title === "string" ? bullet.title.trim() : "";
        const detail = typeof bullet.detail === "string" ? bullet.detail.trim() : "";
        const citations = Array.isArray(bullet.citations)
          ? bullet.citations.filter((item): item is string => typeof item === "string")
          : [];
        return { title, detail, citations };
      })
      .filter((bullet) => bullet.title && bullet.detail);

    const followups = Array.isArray(row.followups)
      ? row.followups
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const sources = Array.isArray(row.sources)
      ? row.sources
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item) => ({
            title: typeof item.title === "string" ? item.title.trim() : "",
            url: typeof item.url === "string" ? item.url.trim() : "",
          }))
          .filter((item) => item.title && /^https?:\/\//.test(item.url))
      : [];

    return { summary, bullets, followups, sources };
  } catch {
    return null;
  }
}

function citationLookup(pack: ScopedPack): Map<string, AssistantCitation> {
  const map = new Map<string, AssistantCitation>();
  pack.items.forEach((row) => {
    const citation = buildCitation(row.sectionTitle, row.item);
    map.set(citationToken(citation), citation);
  });
  return map;
}

function aiToStructuredAnswer(
  parsed: ParsedAiAnswer,
  intent: ChatIntent,
  pack: ScopedPack
): AssistantStructuredAnswer {
  const lookup = citationLookup(pack);

  const bullets: AssistantBullet[] = parsed.bullets.slice(0, MAX_DETERMINISTIC_ITEMS).map((bullet) => {
    const citations = (bullet.citations ?? [])
      .map((token) => lookup.get(token.trim()))
      .filter((value): value is AssistantCitation => Boolean(value));

    return {
      title: bullet.title,
      detail: bullet.detail,
      citations,
    };
  });

  const citations = uniqueCitations(bullets);

  return {
    summary: parsed.summary,
    bullets,
    citations,
    followups: (parsed.followups ?? []).slice(0, MAX_FOLLOWUPS).filter(Boolean),
    sources: (parsed.sources ?? []).slice(0, 6),
    intent,
  };
}

function finalizeResponse(
  answer: AssistantStructuredAnswer,
  meta: CachedChatResponse["meta"],
  warning?: string
): CachedChatResponse {
  return {
    answer,
    reply: structuredToText(answer),
    warning,
    meta,
  };
}

function finalizeTextResponse(
  reply: string,
  meta: CachedChatResponse["meta"],
  warning?: string
): CachedChatResponse {
  return {
    reply,
    warning,
    meta,
  };
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
      const text = contentRow.text ?? contentRow.value;
      if (typeof text === "string" && text.trim()) {
        textParts.push(text.trim());
      }
    });
  });

  return textParts.join("\n").trim();
}

function sourceFromRecord(record: Record<string, unknown>): AssistantWebSource | null {
  const urlCandidate = record.url ?? record.uri ?? record.link;
  if (typeof urlCandidate !== "string") return null;

  const url = urlCandidate.trim();
  if (!/^https?:\/\//.test(url)) return null;

  const titleCandidate = record.title ?? record.name ?? record.source;
  const title =
    typeof titleCandidate === "string" && titleCandidate.trim()
      ? titleCandidate.trim()
      : url;

  return { title, url };
}

function readOpenAiWebSources(payload: unknown): AssistantWebSource[] {
  const candidates: AssistantWebSource[] = [];

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

async function requestOpenAiAnswer(
  prompt: string,
  signal: AbortSignal,
  authToken: string,
  model: string,
  maxOutputTokens: number,
  useWebSearch: boolean,
  structuredOutput: boolean
): Promise<{ reply: string; payload: unknown; sources: AssistantWebSource[] }> {
  if (!OPENAI_API_KEY) {
    const upstream = await fetch(LEGACY_AI_ASSISTANT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ prompt }),
      signal,
      cache: "no-store",
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    const reply =
      upstreamPayload && typeof upstreamPayload === "object"
        ? String((upstreamPayload as Record<string, unknown>).reply ?? "").trim()
        : "";

    if (!upstream.ok || !reply) {
      const errorMessage =
        readError(upstreamPayload) || `Firebase AI proxy selhala (HTTP ${upstream.status}).`;
      throw new Error(errorMessage);
    }

    return { reply, payload: upstreamPayload, sources: [] };
  }

  const requestBody: Record<string, unknown> = {
    model,
    input: prompt,
    max_output_tokens: maxOutputTokens,
  };

  if (structuredOutput) {
    requestBody.text = {
      format: {
        type: "json_schema",
        name: "life_comparison_chat_answer",
        strict: true,
        schema: LIFE_COMPARISON_ANSWER_SCHEMA,
      },
    };
  }

  if (useWebSearch) {
    requestBody.tools = [
      {
        type: "web_search",
        search_context_size: WEB_SEARCH_CONTEXT_SIZE,
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

  const upstream = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal,
    cache: "no-store",
  });

  const upstreamPayload = await upstream.json().catch(() => null);
  const reply = readOpenAiOutputText(upstreamPayload);

  if (!upstream.ok) {
    const errorMessage =
      readError(upstreamPayload) || `OpenAI odpověď selhala (HTTP ${upstream.status}).`;
    throw new Error(errorMessage);
  }

  if (!reply) {
    const row =
      upstreamPayload && typeof upstreamPayload === "object"
        ? (upstreamPayload as Record<string, unknown>)
        : {};
    const status = typeof row.status === "string" ? row.status : "";
    const incompleteDetails =
      row.incomplete_details && typeof row.incomplete_details === "object"
        ? (row.incomplete_details as Record<string, unknown>)
        : null;
    const reason =
      incompleteDetails && typeof incompleteDetails.reason === "string"
        ? incompleteDetails.reason
        : "";

    throw new Error(
      status === "incomplete" || reason
        ? `OpenAI nevrátila textovou odpověď (${reason || status}).`
        : "OpenAI nevrátila textovou odpověď."
    );
  }

  return { reply, payload: upstreamPayload, sources: readOpenAiWebSources(upstreamPayload) };
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:life-comparison-chat:post",
    limit: CHAT_RATE_LIMIT,
    windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatný payload pro AI chat." }, { status: 400 }),
      ctx
    );
  }

  const effectivePrompt = buildEffectivePrompt(payload.prompt, payload.history);
  const promptNormalized = normalizeSearchValue(effectivePrompt);
  const intent = detectIntent(promptNormalized);
  const route = pickChatRoute(promptNormalized, intent);
  const traits = detectQueryTraits(promptNormalized);
  const cacheKey = makeCacheKey(payload, effectivePrompt);
  const cachedResponse = readCachedResponse(cacheKey);

  if (cachedResponse) {
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: cachedResponse.reply,
        answer: cachedResponse.answer,
        warning: cachedResponse.warning,
        meta: cachedResponse.meta,
      }),
      ctx
    );
  }

  const comparisonPayload = resolveLifeComparisonSourcePayload();
  if (!isComparisonPayload(comparisonPayload)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Data srovnávače mají neplatný formát." }, { status: 502 }),
      ctx
    );
  }

  const inferredProductIds = inferPromptProductIds(
    comparisonPayload.products,
    payload.selectedProductIds,
    promptNormalized
  );
  const effectiveSelectedProductIds =
    inferredProductIds.length > 0 ? inferredProductIds : payload.selectedProductIds;

  const scopedPack = buildScopedPack(
    comparisonPayload,
    effectiveSelectedProductIds,
    payload.selectedCategoryTitles,
    payload.onlyDifferences,
    promptNormalized,
    traits
  );

  if (scopedPack.totalItems === 0 && route.usesTableContext) {
    const answer: AssistantStructuredAnswer = {
      summary: "V poskytnutých datech to nevidím.",
      bullets: [],
      citations: [],
      followups: defaultFollowups(intent, scopedPack),
      intent,
    };

    const responsePayload = finalizeResponse(answer, {
      usedItemsCount: 0,
      totalItems: 0,
      intent,
    });
    writeCachedResponse(cacheKey, responsePayload);

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: responsePayload.reply,
        answer: responsePayload.answer,
        meta: responsePayload.meta,
      }),
      ctx
    );
  }

  const fallbackAnswer = buildRouteFallbackAnswer(
    route,
    intent,
    scopedPack,
    promptNormalized,
    traits
  );

  const context = route.usesTableContext
    ? buildContextRows(scopedPack, route.maxContextItems)
    : { rows: [], usedItemsCount: 0 };
  const coverageContext = route.usesTableContext
    ? buildDataCoverageContext(scopedPack)
    : "Bez tabulkového kontextu pro tento dotaz.";
  const aiPrompt = buildAiPrompt(
    comparisonPayload,
    effectivePrompt,
    scopedPack.selectedProducts.map((product) => product.id),
    payload.selectedCategoryTitles,
    payload.onlyDifferences,
    context.rows,
    payload.history,
    intent,
    coverageContext,
    route
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    route.usesWebSearch ? AI_WEB_TIMEOUT_MS : AI_TIMEOUT_MS
  );

  try {
    const { reply: upstreamReply, sources: upstreamSources } = await requestOpenAiAnswer(
      aiPrompt,
      controller.signal,
      ctx.token,
      route.model,
      route.maxOutputTokens,
      route.usesWebSearch,
      route.usesStructuredOutput
    );

    if (!route.usesStructuredOutput) {
      const parsedTextAi = parseAiStructuredAnswer(upstreamReply);
      const plainReply = parsedTextAi
        ? structuredToText(aiToStructuredAnswer(parsedTextAi, intent, scopedPack))
        : looksLikeJsonResponse(upstreamReply)
          ? structuredToText(fallbackAnswer)
          : upstreamReply;
      const replyWithSources =
        upstreamSources.length > 0
          ? `${plainReply}\n\nZdroje:\n${upstreamSources
              .map((source) => `- ${source.title}: ${source.url}`)
              .join("\n")}`
          : plainReply;
      const responsePayload = finalizeTextResponse(replyWithSources, {
        usedItemsCount: context.usedItemsCount,
        totalItems: scopedPack.totalItems,
        intent,
      });
      writeCachedResponse(cacheKey, responsePayload);

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          reply: responsePayload.reply,
          meta: responsePayload.meta,
        }),
        ctx
      );
    }

    const parsedAi = parseAiStructuredAnswer(upstreamReply);
    if (parsedAi) {
      const structuredAnswer = aiToStructuredAnswer(
        {
          ...parsedAi,
          sources: mergeSources(parsedAi.sources, upstreamSources),
        },
        intent,
        scopedPack
      );

      const responsePayload = finalizeResponse(structuredAnswer, {
        usedItemsCount: context.usedItemsCount,
        totalItems: scopedPack.totalItems,
        intent,
      });
      writeCachedResponse(cacheKey, responsePayload);

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          reply: responsePayload.reply,
          answer: responsePayload.answer,
          meta: responsePayload.meta,
        }),
        ctx
      );
    }

    if (looksLikeJsonResponse(upstreamReply)) {
      const responsePayload = finalizeResponse(fallbackAnswer, {
        usedItemsCount: Math.min(MAX_DETERMINISTIC_ITEMS, scopedPack.items.length),
        totalItems: scopedPack.totalItems,
        intent,
      });
      writeCachedResponse(cacheKey, responsePayload);

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          reply: responsePayload.reply,
          answer: responsePayload.answer,
          meta: responsePayload.meta,
        }),
        ctx
      );
    }

    const responsePayload = finalizeTextResponse(upstreamReply, {
      usedItemsCount: context.usedItemsCount,
      totalItems: scopedPack.totalItems,
      intent,
    });
    writeCachedResponse(cacheKey, responsePayload);

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: responsePayload.reply,
        answer: responsePayload.answer,
        meta: responsePayload.meta,
      }),
      ctx
    );
  } catch (err: unknown) {
    const isTimeout =
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: string }).name === "AbortError";
    const errorMessage =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "OpenAI asistent není dostupný.";
    console.warn("Life comparison chat OpenAI fallback:", errorMessage);

    const fallbackResponse = finalizeResponse(
      fallbackAnswer,
      {
        usedItemsCount: Math.min(MAX_DETERMINISTIC_ITEMS, scopedPack.items.length),
        totalItems: scopedPack.totalItems,
        intent,
      },
      process.env.LIFE_COMPARISON_SHOW_AI_WARNINGS === "1"
        ? isTimeout
          ? "OpenAI asistent timeoutoval, vracím odpověď z lokální logiky."
          : `${errorMessage} Vracím odpověď z lokální logiky.`
        : undefined
    );
    writeCachedResponse(cacheKey, fallbackResponse);

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        reply: fallbackResponse.reply,
        answer: fallbackResponse.answer,
        warning: fallbackResponse.warning,
        meta: fallbackResponse.meta,
      }),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}

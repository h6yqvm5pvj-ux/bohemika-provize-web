import type { ToolHubToolKey } from "./toolHub";

export type ToolCatalogCategory =
  | "Životní pojištění"
  | "Pojištění majetku"
  | "Pojištění vozidel"
  | "Cestovní pojištění"
  | "Finance"
  | "Investice"
  | "Obecné";

export type ToolCatalogNews = {
  kind: "new" | "updated";
  summary: string;
};

export type ToolCatalogEntry = {
  key: ToolHubToolKey;
  category: ToolCatalogCategory;
  title: string;
  description: string;
  href: string;
  news?: ToolCatalogNews;
};

const CATEGORY_SEARCH_KEYWORDS: Record<ToolCatalogCategory, readonly string[]> = {
  "Životní pojištění": [
    "život",
    "životko",
    "pojištění osob",
    "rizika",
  ],
  "Pojištění majetku": ["majetek", "nemovitost", "dům", "byt"],
  "Pojištění vozidel": [
    "auto",
    "automobil",
    "vozidlo",
    "povinné ručení",
    "havarijní pojištění",
  ],
  "Cestovní pojištění": ["cestovní", "cestovko", "zahraničí"],
  Finance: ["finance", "provize", "produkce", "výplata"],
  Investice: ["investice", "spoření", "zhodnocení"],
  Obecné: ["obecné", "administrativa", "poradenství"],
};

const TOOL_SEARCH_KEYWORDS: Record<ToolHubToolKey, readonly string[]> = {
  argumenty: ["námitky", "odpovědi", "komunikace", "prodej", "klient"],
  kontakty: [
    "telefon",
    "email",
    "podpora",
    "pojišťovna",
    "allianz",
    "čpp",
    "kooperativa",
    "uniqa",
    "metlife",
    "maxima",
    "pillow",
  ],
  dokumenty: ["šablony", "formuláře", "pdf", "podklady", "pojišťovna"],
  zaznam: ["jednání", "potřeby klienta", "povinná dokumentace"],
  "vypoved-smlouvy": [
    "výpověď",
    "zrušení",
    "ukončení",
    "odstoupení",
    "pojistka",
  ],
  "jak-stiham-vypoved-smlouvy": [
    "výpověď",
    "výpovědní lhůta",
    "termín",
    "ukončení",
    "konec smlouvy",
  ],
  "nahrada-smlouvy": [
    "převod pojistného",
    "doplatek",
    "přeplatek",
    "náhradka",
  ],
  "radar-vyroci": ["retence", "obvolání", "konec smlouvy", "klienti", "servis"],
  tvorba: ["editor", "dopis", "formulář", "šablona", "pdf"],
  "ai-asistent": ["chat", "dotaz", "rada", "poradce", "umělá inteligence"],
  "online-vizitka": ["profil", "web", "qr", "kontakt", "osobní stránka"],
  "hypoteka-vlastni-zdroje": [
    "hypo",
    "ltv",
    "akontace",
    "spoření",
    "nemovitost",
    "úvěr",
  ],
  statistika: ["výkon", "produkce", "provize", "schůzky", "oslovení"],
  "export-produkce": ["report", "pdf", "email", "výkon", "provize", "přehled"],
  "plan-produkce": ["cíl", "odměna", "provize", "výkon", "plánování"],
  tipar: ["tip", "doporučení", "spolupráce", "odměna", "provize"],
  zlato: ["investiční zlato", "slitek", "spoření", "investice"],
  katastr: [
    "čúzk",
    "cuzk",
    "ruian",
    "list vlastnictví",
    "parcela",
    "nemovitost",
    "adresa",
  ],
  "proklepka-vozidla": [
    "auto",
    "automobil",
    "vin",
    "stk",
    "kilometry",
    "tachometr",
    "sklo",
    "tržní cena",
    "orv",
    "vlastník",
  ],
  "nahrat-tachometr": ["auto", "kilometry", "km", "allianz", "pillow", "vozidlo"],
  "odkazy-instituce": [
    "portál",
    "pojišťovna",
    "instituce",
    "allianz",
    "čpp",
    "kooperativa",
    "uniqa",
    "metlife",
    "pillow",
  ],
  ares: ["ičo", "firma", "podnikatel", "živnostník", "ekonomický subjekt", "registr"],
  "projekce-vykonu": ["výplata", "příjem", "provize", "odměna", "kariéra", "budoucnost"],
  "cestovni-pojisteni-cpp-vs-kooperativa": [
    "cestovko",
    "čpp",
    "česká podnikatelská pojišťovna",
    "kooperativa",
    "axa",
    "srovnání",
    "porovnání",
    "limity",
    "výluky",
  ],
  "nastaveni-zivotniho-pojisteni": [
    "životko",
    "invalidita",
    "smrt",
    "pracovní neschopnost",
    "neschopenka",
    "příjem",
    "dluhy",
    "rizika",
  ],
  "srovnavac-trvalych-nasledku": [
    "úraz",
    "progrese",
    "plnění",
    "srovnání",
    "porovnání",
    "životko",
  ],
  "srovnavac-pracovni-neschopnosti": [
    "nemocenská",
    "neschopenka",
    "pn",
    "karence",
    "srovnání",
    "porovnání",
    "životko",
  ],
  "srovnavac-zivotniho-pojisteni": [
    "životko",
    "srovnání",
    "porovnání",
    "pojišťovna",
    "podmínky",
    "invalidita",
    "smrt",
    "úraz",
  ],
  "neon-life-vs-metlife-oneguard": [
    "čpp",
    "česká podnikatelská pojišťovna",
    "metlife",
    "neon",
    "oneguard",
    "životko",
    "srovnání",
    "porovnání",
  ],
};

export const normalizeToolSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .trim();

export function toolMatchesSearchQuery(
  tool: Pick<ToolCatalogEntry, "key" | "category" | "title" | "description">,
  query: string,
): boolean {
  const normalizedQuery = normalizeToolSearch(query);
  if (!normalizedQuery) return true;

  const haystack = normalizeToolSearch(
    [
      tool.key,
      tool.title,
      tool.description,
      tool.category,
      ...CATEGORY_SEARCH_KEYWORDS[tool.category],
      ...TOOL_SEARCH_KEYWORDS[tool.key],
    ].join(" "),
  );
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return terms.every((term) => haystack.includes(term));
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    key: "argumenty",
    category: "Obecné",
    title: "Argumenty",
    description: "Přehled Argumentů na různé typy námitek od klienta.",
    href: "/pomucky/argumenty",
  },
  {
    key: "kontakty",
    category: "Obecné",
    title: "Kontakty",
    description:
      "Přímé kontakty na obchodní a administrativní podporu partnerských institucí.",
    href: "/?contacts=1",
  },
  {
    key: "dokumenty",
    category: "Obecné",
    title: "Dokumenty",
    description: "Centrální místo pro interní šablony, podklady a materiály.",
    href: "/pomucky/dokumenty",
  },
  {
    key: "zaznam",
    category: "Obecné",
    title: "Záznam z jednání",
    description: "Pomůcka pro správně vypsaný Záznam z jednání.",
    href: "/pomucky/zaznam",
  },
  {
    key: "vypoved-smlouvy",
    category: "Obecné",
    title: "Výpověď smlouvy",
    description: "Pomůcka pro přípravu výpovědi smlouvy.",
    href: "/pomucky/vypoved-smlouvy",
    news: {
      kind: "updated",
      summary:
        "Výpověď nyní podporuje více pojišťoven, předvyplnění údajů a stažení hotového PDF.",
    },
  },
  {
    key: "jak-stiham-vypoved-smlouvy",
    category: "Obecné",
    title: "Jak stíhám výpověď smlouvy?",
    description: "Ověření výpovědních lhůt a výpočet data ukončení smlouvy.",
    href: "/pomucky/jak-stiham-vypoved-smlouvy",
  },
  {
    key: "nahrada-smlouvy",
    category: "Obecné",
    title: "Náhrada smlouvy",
    description:
      "Výpočet převodu nevyčerpaného pojistného a doplatku nebo přeplatku.",
    href: "/pomucky/nahrada-smlouvy",
  },
  {
    key: "radar-vyroci",
    category: "Obecné",
    title: "Radar výročí",
    description:
      "Přehled klientů, kterým se blíží výročí smlouvy, s kontrolním checklistem na obvolání.",
    href: "/pomucky/radar-vyroci",
  },
  {
    key: "tvorba",
    category: "Obecné",
    title: "Tvorba PDF",
    description:
      "Interaktivní A4 editor dokumentu s pevnou hlavičkou, patičkou a stažením do PDF.",
    href: "/pomucky/tvorba",
  },
  {
    key: "ai-asistent",
    category: "Obecné",
    title: "AI Asistent",
    description:
      "Bohemka Asistent jako interní pomocník pro pojištění, investice a investiční zlato (bez přístupu ke smlouvám).",
    href: "/pomucky/ai-asistent",
  },
  {
    key: "online-vizitka",
    category: "Obecné",
    title: "Online Vizitka",
    description: "Editor pro tvou vlastní online vizitku.",
    href: "/nastaveni?tab=onlineCard",
  },
  {
    key: "hypoteka-vlastni-zdroje",
    category: "Investice",
    title: "Hypotéka: vlastní zdroje",
    description:
      "Spočítej, kolik je potřeba naspořit na hypotéku a za jak dlouho to vyjde při různých strategiích.",
    href: "/pomucky/hypoteka-vlastni-zdroje",
  },
  {
    key: "statistika",
    category: "Finance",
    title: "Statistika",
    description: "Denní statistika oslovení, schůzek a smluv s výpočtem provize.",
    href: "/pomucky/statistika",
  },
  {
    key: "export-produkce",
    category: "Finance",
    title: "Export produkce",
    description: "Statistika s možností stažení v PDF a Odeslání mailem.",
    href: "/pomucky/export-produkce",
  },
  {
    key: "plan-produkce",
    category: "Finance",
    title: "Plán produkce",
    description:
      "Naplánuj si cíleně Produkci a rovnou uvidíš svou odměnu. Můžeš i stáhnout v PDF.",
    href: "/pomucky/plan-produkce",
  },
  {
    key: "tipar",
    category: "Finance",
    title: "TIPAŘ",
    description:
      "Připrav nabídku TIP spolupráce podle své aktuální pozice a provize A101.",
    href: "/pomucky/tipar",
  },
  {
    key: "zlato",
    category: "Investice",
    title: "Zlato",
    description: "Přehled a kalkulace pro investice do zlata.",
    href: "/pomucky/zlato",
  },
  {
    key: "katastr",
    category: "Pojištění majetku",
    title: "Nahlížení do katastru nemovitostí",
    description:
      "Vyhledej údaje z CUZK podle kódu adresního místa (RÚIAN) s autorizací přes tvůj účet.",
    href: "/cuzk",
  },
  {
    key: "proklepka-vozidla",
    category: "Pojištění vozidel",
    title: "Proklepka vozidla",
    description:
      "Zjisti informace o vozidle jako například nájezd, tržní cenu, cenu skel, vlastníky, STK, data z ORV a další.",
    href: "/pomucky/proklepka-vozidla",
  },
  {
    key: "nahrat-tachometr",
    category: "Pojištění vozidel",
    title: "Nahrát tachometr",
    description: "Odkaz pro nahrání stavu tachometru pro pojišťovny Allianz a Pillow.",
    href: "/pomucky?open=nahrat-tachometr",
  },
  {
    key: "odkazy-instituce",
    category: "Obecné",
    title: "Odkazy",
    description: "Odkazy na portály institucí.",
    href: "/pomucky?open=odkazy-instituce",
  },
  {
    key: "ares",
    category: "Obecné",
    title: "ARES",
    description: "Vyhledání ekonomických subjektů v ARES podle IČO, názvu firmy a obce.",
    href: "/pomucky/ares",
  },
  {
    key: "projekce-vykonu",
    category: "Finance",
    title: "Projekce výkonu",
    description: "Vizualizuj si výplatu do budoucna.",
    href: "/pomucky/projekce-vykonu",
  },
  {
    key: "cestovni-pojisteni-cpp-vs-kooperativa",
    category: "Cestovní pojištění",
    title: "ČPP vs. Kooperativa vs. AXA — cestovní pojištění",
    description:
      "Interaktivní porovnání variant, limitů, výluk a připojištění tří cestovních pojištění.",
    href: "/pomucky/cestovni-pojisteni-cpp-vs-kooperativa",
    news: {
      kind: "updated",
      summary:
        "Srovnání nově zahrnuje ČPP, Kooperativu i AXA a pracuje s aktuálními podklady všech tří pojišťoven.",
    },
  },
  {
    key: "nastaveni-zivotniho-pojisteni",
    category: "Životní pojištění",
    title: "Jak nastavit Životní pojištění",
    description:
      "Stepper pro nastavení smrti, invalidity a pracovní neschopnosti podle příjmu, závazků a dluhů.",
    href: "/pomucky/nastaveni-zivotniho-pojisteni",
  },
  {
    key: "srovnavac-trvalych-nasledku",
    category: "Životní pojištění",
    title: "Srovnavač Trvalých následků",
    description: "Otevři srovnavač pro trvalé následky úrazu.",
    href: "/pomucky/srovnavac-trvalych-nasledku",
  },
  {
    key: "srovnavac-pracovni-neschopnosti",
    category: "Životní pojištění",
    title: "Srovnavač Pracovní neschopnosti",
    description: "Výběr produktů pro srovnání pracovní neschopnosti.",
    href: "/pomucky/srovnavac-pracovni-neschopnosti",
  },
  {
    key: "srovnavac-zivotniho-pojisteni",
    category: "Životní pojištění",
    title: "Srovnavač životního pojištění",
    description:
      "Porovnání produktových podmínek životního pojištění podle pojišťoven a kategorií.",
    href: "/pomucky/srovnavac-zivotniho-pojisteni",
  },
  {
    key: "neon-life-vs-metlife-oneguard",
    category: "Životní pojištění",
    title: "NEON Life vs. MetLife OneGuard",
    description: "Přehledné srovnání produktů ČPP NEON Life a MetLife OneGuard.",
    href: "/pomucky/neon-life-vs-metlife-oneguard",
    news: {
      kind: "new",
      summary:
        "Nové přehledné srovnání ČPP NEON Life a MetLife OneGuard na jednom místě.",
    },
  },
];

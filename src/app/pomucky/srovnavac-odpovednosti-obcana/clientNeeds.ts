import type { ComparisonSectionData } from "./comparisonData";

export const CLIENT_QUERY_LIMIT = 600;
// Živá služba může odpovídat i přes 10 s; základní profil je mezitím ihned použitelný.
export const CLIENT_AI_UPSTREAM_TIMEOUT_MS = 15_000;
// Rezerva na přihlašovací token, serverové ověření uživatele a přenos odpovědi.
export const CLIENT_AI_WAIT_MS = CLIENT_AI_UPSTREAM_TIMEOUT_MS + 5_000;

export const CLIENT_NEEDS = [
  { id: "tenant", label: "Bydlení v nájmu", explanation: "Škody na pronajatém bytě a jeho vybavení, včetně pojištěných rizik.", criteria: { tenancy: ["rented-property", "rented-property-risks", "rented-equipment", "rented-equipment-risks"] } },
  { id: "owner", label: "Vlastní nemovitost", explanation: "Odpovědnost z vlastnictví, další nemovitosti a pozemky.", criteria: { property: ["property-owner", "listed-property", "listed-property-land", "other-properties", "other-home", "other-holiday-home", "other-farm-building", "other-business-property", "other-apartment-building", "other-property-land", "other-separate-land", "other-property-territory", "minor-building-work", "self-build"] } },
  { id: "landlord", label: "Pronajímání nemovitosti", explanation: "Škody mezi pronajímatelem a nájemníkem, příjmová a územní omezení.", criteria: { tenancy: ["landlord-tenant-belongings", "tenant-damage-to-landlord", "maximum-rental-income", "rental-without-address", "landlord-territory"] } },
  { id: "children", label: "Děti v domácnosti", explanation: "Zahrnutí dětí mezi pojištěné osoby a případné věkové podmínky.", criteria: { coinsured: ["household-members", "children"] } },
  { id: "dog", label: "Pes", explanation: "Chov jednoho i více psů a škody na rostlinách.", criteria: { breeder: ["dog", "multiple-dogs", "animal-plant-damage"] } },
  { id: "cats", label: "Kočka", explanation: "Chov koček a škody způsobené na rostlinách.", criteria: { breeder: ["cats", "animal-plant-damage"] } },
  { id: "pets", label: "Další domácí zvířata", explanation: "Ostatní, exotická a nebezpečná zvířata, včetně omezení chovu k výdělku.", criteria: { breeder: ["other-pets", "dangerous-animals", "commercial-animals", "exotic-animals", "animal-plant-damage"] } },
  { id: "livestock", label: "Hospodářská zvířata", explanation: "Chov hospodářských zvířat a škody na porostech.", criteria: { breeder: ["livestock", "animal-plant-damage"] } },
  { id: "cycling", label: "Jízda na kole", explanation: "Rekreační cyklistika a případné zvláštní limity.", criteria: { "life-sport": ["recreational-cycling"] } },
  { id: "electric", label: "Elektrokolo / elektrokoloběžka", explanation: "Cyklistika, elektrovozítka bez povinného ručení, jejich definice a jízda po chodníku.", criteria: { "life-sport": ["recreational-cycling", "electric-vehicles", "electric-vehicles-sidewalk", "electric-vehicles-definition"] } },
  { id: "sport", label: "Rekreační sport", explanation: "Odpovědnost při rekreačním sportování.", criteria: { "life-sport": ["recreational-sport"] } },
  { id: "borrowed", label: "Půjčené věci", explanation: "Půjčené vybavení, podmínky půjčovny a jednotlivé druhy věcí.", criteria: { tenancy: ["borrowed-items", "item-lender", "borrowed-item-types", "borrowed-tools", "borrowed-sports-equipment", "borrowed-animals", "borrowed-electronics", "borrowed-vehicle", "rental-vehicle-deductible", "borrowed-motorboat", "borrowed-drone", "borrowed-aircraft"] } },
  { id: "travel", label: "Pobyt v zahraničí", explanation: "Územní platnost a uvedené výjimky; konkrétní zemi ověř v podrobnostech.", criteria: { general: ["territory"] } },
  { id: "helpers", label: "Výpomoc v domácnosti", explanation: "Osoby pomáhající s úklidem, hlídáním a údržbou, i na základě smlouvy.", criteria: { coinsured: ["household-helpers", "helper-chores", "helper-childcare", "helper-pet-care", "helper-property-care", "helper-path-maintenance", "helper-construction", "contracted-helpers", "contracted-helper-chores", "contracted-helper-childcare", "contracted-helper-pet-care", "contracted-helper-property-care", "contracted-helper-path-maintenance", "contracted-helper-construction"] } },
  { id: "weapons", label: "Legálně držená zbraň", explanation: "Škody způsobené legálně drženou zbraní mimo výkon práva myslivosti.", criteria: { "life-sport": ["legally-held-weapons"] } },
] as const;

export type ClientNeedId = (typeof CLIENT_NEEDS)[number]["id"];
export type NeedMatch = { id: ClientNeedId; evidence: string };
export const normalizeClientQuery = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const isClientNeedId = (id: unknown): id is ClientNeedId => CLIENT_NEEDS.some((need) => need.id === id);

const patterns: Record<ClientNeedId, RegExp> = {
  tenant: /\b(?:v|do)\s+(?:pod)?najmu\b|\b(?:pod)?najemni\w*|\b(?:ne)?pronajima\w*\s+si\b/g,
  owner: /\b(?:ne)?vlastni\w*\s+(?:(?:rodinny|vlastni)\s+)?(?:byt|dum|nemovitost|chalup|chat)\w*|\b(?:ve|v)\s+(?:svem|vlastnim)\s+(?:byte|dome)\b/g,
  landlord: /\b(?:ne)?pronajima\w*\b(?!\s+si\b)|\bpronajimatel\w*/g,
  children: /\b(?:deti|dite|detmi|detem|syna?|syny|dcer\w*)\b/g,
  dog: /\b(?:pes|psa|psi|psy|psu|psem|pejsk\w*)\b/g,
  cats: /\b(?:kock\w*|kocour\w*)\b/g,
  pets: /\b(?:zvirat\w*|zvire|papous\w*|had[ay]?|zelv\w*|exotick\w*|nebezpecn\w*\s+zvir\w*)\b/g,
  livestock: /\b(?:hospodarsk\w*\s+zvir\w*|kone|kun|koni|ovce|ovci|kozy|koz[au]|slepice|drubez|skot)\b/g,
  cycling: /\b(?:cyklist\w*|na\s+kole|jizdni\s+kolo)\b/g,
  electric: /\b(?:elektrokol\w*|elektrojednokol\w*|e-bike|ebike|elektrick\w*\s+(?:kol\w*|voz\w*))\b/g,
  sport: /\b(?:sport\w*|lyzu\w*|lyzov\w*|beha\w*|snowboard\w*|fotbal\w*|tenis\w*)\b/g,
  borrowed: /\b(?:ne)?(?:pujcu\w*|vypujcu\w*|zapujcu\w*)\b|\b(?:pujcen\w*|vypujcen\w*|zapujcen\w*|pujcovn\w*)\b/g,
  travel: /\b(?:zahranic\w*|cestuj\w*|cestuji|cestova\w*|evrop\w*|svet[ae]?|usa|kanad\w*|australi\w*)\b/g,
  helpers: /\b(?:chuv\w*|uklizec\w*|uklizeck\w*|vypomoc\w*|pomocnic\w*|hlidani\s+deti)\b/g,
  weapons: /\b(?:zbran\w*|pistol\w*|zbrojni\w*)\b/g,
};

// Negace se vztahuje k nejbližšímu výroku, ne k celému zadání.
function negated(text: string, start: number, end: number): boolean {
  const prefix = text.slice(0, end).split(/[.,;!?]|\bale\b/).at(-1) ?? "";
  const verbs = [...prefix.matchAll(/\b(?:nema\w*|nechova\w*|nechce\w*|neplanuje\w*|nebydli\w*|nevlastni\w*|nepronajima\w*|nejezdi\w*|nepujcu\w*|necestu\w*|neni|nejsou|bez|ne|ma|maji|mam|chova\w*|chce\w*|planuje\w*|bydli\w*|vlastni\w*|pronajima\w*|jezdi\w*|pujcu\w*|cestu\w*)\b/g)];
  const last = verbs.at(-1)?.[0];
  if (last === "bez" || last?.startsWith("ne")) return true;
  return /^\s+(?:nema\w*|nechce\w*|nechova\w*)\b/.test(text.slice(end))
    || /\bbez\s+$/.test(text.slice(Math.max(0, start - 8), start));
}

export function detectClientNeeds(query: string): { matches: NeedMatch[]; excluded: ClientNeedId[] } {
  const text = normalizeClientQuery(query);
  const matches: NeedMatch[] = [], excluded: ClientNeedId[] = [];
  for (const need of CLIENT_NEEDS) {
    const occurrences = [...text.matchAll(patterns[need.id])];
    if (!occurrences.length) continue;
    const positive = occurrences.find((match) => !negated(text, match.index!, match.index! + match[0].length));
    if (positive) matches.push({ id: need.id, evidence: positive[0] });
    else excluded.push(need.id);
  }
  // Obecná zmínka o hospodářských zvířatech neznamená další domácí mazlíčky.
  if (matches.some((match) => match.id === "livestock")) {
    const petIndex = matches.findIndex((match) => match.id === "pets" && /^zvirat/.test(match.evidence));
    if (petIndex >= 0) matches.splice(petIndex, 1);
  }
  return { matches, excluded };
}

/** Model smí vrátit jen známé potřeby s citací, která skutečně leží v zadání. */
export function parseAiClientNeeds(raw: unknown, query: string): NeedMatch[] | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > 6_000) return null;
    try { parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { needs?: unknown }).needs)) return null;
  const entries: unknown[] = (parsed as { needs: unknown[] }).needs;
  if (entries.length > CLIENT_NEEDS.length) return null;
  const text = normalizeClientQuery(query), excluded = detectClientNeeds(query).excluded;
  const matches: NeedMatch[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") return null;
    const { id, evidence } = entry as { id?: unknown; evidence?: unknown };
    if (!isClientNeedId(id) || typeof evidence !== "string" || evidence.trim().length < 2 || evidence.length > 180) return null;
    const snippet = normalizeClientQuery(evidence), index = text.indexOf(snippet);
    if (index < 0 || excluded.includes(id) || negated(text, index, index + snippet.length)) continue;
    if (!matches.some((match) => match.id === id)) matches.push({ id, evidence: evidence.trim() });
  }
  return matches;
}

export function personalizeSections(sections: readonly ComparisonSectionData[], needs: readonly ClientNeedId[]) {
  if (!needs.length) return [...sections];
  return sections.flatMap((section) => {
    const selected = new Map<string, string[]>();
    if (section.id === "general") section.criteria.forEach((row) => selected.set(row.id, ["Základní podmínky"]));
    for (const need of CLIENT_NEEDS.filter((item) => needs.includes(item.id))) {
      const ids = (need.criteria as Record<string, readonly string[]>)[section.id] ?? [];
      for (const id of ids) {
        let row = section.criteria.find((criterion) => criterion.id === id);
        const visited = new Set<string>();
        while (row && !visited.has(row.id)) {
          visited.add(row.id);
          selected.set(row.id, [...new Set([...(selected.get(row.id) ?? []), need.label])]);
          const parentId = row.parentId;
          row = parentId ? section.criteria.find((criterion) => criterion.id === parentId) : undefined;
        }
      }
    }
    const criteria = section.criteria.filter((row) => selected.has(row.id)).map((row) => ({ ...row, relevance: selected.get(row.id) }));
    return criteria.length ? [{ ...section, criteria }] : [];
  });
}

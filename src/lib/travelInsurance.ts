export const TRAVEL_ACTIVITIES = [
  { id: "relax", title: "Moře a odpočinek", description: "Pláž, město a výlety" },
  { id: "family", title: "Cesta s dětmi", description: "Dovolená pro celou rodinu" },
  { id: "hiking", title: "Hory a ferraty", description: "Od procházek po vrcholy" },
  { id: "diving", title: "Potápění", description: "Za zážitky pod hladinou" },
  { id: "winter", title: "Lyže a snowboard", description: "Sjezdovky i volný terén" },
  { id: "rental", title: "Půjčené vozidlo", description: "Auto nebo skútr na místě" },
  { id: "work", title: "Pracovní cesta", description: "Jednání, práce nebo stáž" },
  { id: "storno", title: "Ochrana ceny cesty", description: "Když musíte cestu zrušit" },
] as const;
export type TravelActivity = typeof TRAVEL_ACTIVITIES[number]["id"];
export type TravelDraft = {
  destination: string;
  departure: string;
  returnDate: string;
  ages: string;
  activities: TravelActivity[];
  ferrata: string;
  altitude: string;
  diving: string;
  winter: string;
  rental: string;
  paymentDate: string;
  tripCost: string;
  alreadyAbroad: boolean;
};
export type TravelInquiry = {
  trip: TravelDraft;
  intent: "offer" | "review";
  preferredContact: "email" | "phone";
  note: string;
};
export const EMPTY_TRAVEL_DRAFT: TravelDraft = {
  destination: "", departure: "", returnDate: "", ages: "", activities: [],
  ferrata: "Nevím", altitude: "Nevím", diving: "Nevím", winter: "Nevím", rental: "Auto",
  paymentDate: "", tripCost: "", alreadyAbroad: false,
};
export const TRAVEL_OPTIONS = {
  ferrata: ["Bez ferrat", "A–B", "C", "D", "E a vyšší", "Nevím"],
  altitude: ["Do 3 000 m", "3 000–3 500 m", "3 500–5 000 m", "Nad 5 000 m", "Nevím"],
  diving: ["Jen šnorchlování", "S přístrojem do 10 m", "S přístrojem 10–40 m", "Nad 40 m / jiné potápění", "Nevím"],
  winter: ["Upravené otevřené sjezdovky", "Volný terén / skialpinismus", "Nevím"],
  rental: ["Auto", "Skútr / motorka", "Obojí"],
} as const;

export const TRAVEL_SOURCES = {
  axa: "https://www.axa-assistance.cz/documents-to-download/Pojistne-podminky/Vseobecne-pojistne-podminky-cp?disposition=inline",
  koop: "https://www.koop.cz/cestovni-pojisteni/attachments/koop-cestovni-pojisteni-kolumbus-012-11-2025.pdf",
  cpp: "https://www.cpp.cz/cestovni-pojisteni/pripojisteni",
  cppLiability: "https://www.cpp.cz/file/edee/dokumenty/cestovni-pojisteni/smluvni-dokumentace/dppodc_1_18.pdf",
};
export const TRAVEL_FACTS_CHECKED = "6. 9. 2026";

export function pragueToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
export function travelAges(value: string): number[] {
  const parts = value.trim().split(/[,;\s]+/).filter(Boolean);
  if (!parts.length || parts.length > 12 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 120)) return [];
  return parts.map(Number);
}
export function validateTravelTrip(trip: TravelDraft, today = pragueToday()): string | null {
  if (trip.destination.trim().length < 2 || trip.destination.length > 100) return "Napište cílovou zemi nebo země vaší cesty.";
  if (!validDay(trip.departure) || !validDay(trip.returnDate)) return "Vyberte platný termín odjezdu a návratu.";
  if (trip.returnDate < trip.departure || trip.returnDate < today) return "Návrat musí být po odjezdu a cesta ještě nesmí být ukončená.";
  if (!trip.alreadyAbroad && trip.departure < today) return "Odjezd je v minulosti. Pokud už cestujete, zaškrtněte „Už jsem v zahraničí“.";
  if (!travelAges(trip.ages).length) return "Zadejte věk každého cestujícího oddělený čárkou, například 35, 32, 7. Nejvýše 12 osob.";
  return null;
}
export function validateTravelActivities(trip: TravelDraft, today = pragueToday()): string | null {
  if (!trip.activities.length) return "Vyberte alespoň jednu aktivitu nebo typ cesty.";
  if (trip.activities.includes("storno")) {
    if (trip.paymentDate && (!validDay(trip.paymentDate) || trip.paymentDate > today)) return "Datum již provedené platby musí být platné a nesmí být v budoucnosti.";
    if (trip.tripCost && (!/^\d{1,9}$/.test(trip.tripCost) || Number(trip.tripCost) <= 0)) return "Uveďte celkovou cenu cesty v celých Kč, nebo pole nechte prázdné.";
  }
  return null;
}

export function parseTravelInquiry(value: unknown): { ok: true; value: TravelInquiry } | { ok: false; error: string } {
  const fail = (error = "Neplatné údaje o cestě.") => ({ ok: false as const, error });
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  if (!data.trip || typeof data.trip !== "object" || Array.isArray(data.trip)) return fail();
  const raw = data.trip as Record<string, unknown>;
  for (const [key, limit] of Object.entries({ destination: 100, departure: 10, returnDate: 10, ages: 70, paymentDate: 10, tripCost: 9 })) {
    if (typeof raw[key] !== "string" || (raw[key] as string).length > limit) return fail();
  }
  if (typeof data.note !== "string" || data.note.length > 250) return fail();
  const text = (value: unknown, max: number) => typeof value === "string" && value.length <= max ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  if (!Array.isArray(raw.activities) || raw.activities.length > TRAVEL_ACTIVITIES.length || raw.activities.some(id => !TRAVEL_ACTIVITIES.some(item => item.id === id))) return fail();
  for (const key of Object.keys(TRAVEL_OPTIONS) as Array<keyof typeof TRAVEL_OPTIONS>) {
    if (!(TRAVEL_OPTIONS[key] as readonly unknown[]).includes(raw[key])) return fail();
  }
  if (!["offer", "review"].includes(String(data.intent)) || !["email", "phone"].includes(String(data.preferredContact)) || typeof raw.alreadyAbroad !== "boolean") return fail();
  const trip: TravelDraft = {
    destination: text(raw.destination, 100), departure: text(raw.departure, 10), returnDate: text(raw.returnDate, 10), ages: text(raw.ages, 70),
    activities: [...new Set(raw.activities)] as TravelActivity[],
    ferrata: String(raw.ferrata), altitude: String(raw.altitude), diving: String(raw.diving), winter: String(raw.winter), rental: String(raw.rental),
    paymentDate: text(raw.paymentDate, 10), tripCost: text(raw.tripCost, 9), alreadyAbroad: raw.alreadyAbroad,
  };
  const error = validateTravelTrip(trip) || validateTravelActivities(trip);
  if (error) return fail(error);
  return { ok: true, value: { trip, intent: data.intent as TravelInquiry["intent"], preferredContact: data.preferredContact as TravelInquiry["preferredContact"], note: text(data.note, 250) } };
}

export function travelTripSummary(trip: TravelDraft): string[] {
  const lines = [
    `Cíl: ${trip.destination.trim()}`,
    `Termín: ${trip.departure} – ${trip.returnDate}${trip.alreadyAbroad ? " (již v zahraničí)" : ""}`,
    `Věk cestujících: ${travelAges(trip.ages).join(", ")}`,
    `Aktivity: ${TRAVEL_ACTIVITIES.filter(item => trip.activities.includes(item.id)).map(item => item.title).join(", ")}`,
  ];
  if (trip.activities.includes("hiking")) lines.push(`Ferraty: ${trip.ferrata}; výška: ${trip.altitude}`);
  if (trip.activities.includes("diving")) lines.push(`Potápění: ${trip.diving}`);
  if (trip.activities.includes("winter")) lines.push(`Zimní sporty: ${trip.winter}`);
  if (trip.activities.includes("rental")) lines.push(`Půjčené vozidlo: ${trip.rental}`);
  if (trip.activities.includes("storno")) lines.push(`Cena cesty: ${trip.tripCost ? `${trip.tripCost} Kč` : "neuvedena"}; první platba: ${trip.paymentDate || "neuvedena"}`);
  return lines;
}
export function travelInquiryMessage(inquiry: TravelInquiry): string {
  return [inquiry.intent === "review" ? "Kontrola stávajícího cestovního pojištění" : "Poptávka cestovního pojištění",
    ...travelTripSummary(inquiry.trip), `Preferovaný kontakt: ${inquiry.preferredContact === "email" ? "e-mail" : "telefon"}`,
    inquiry.note ? `Poznámka: ${inquiry.note}` : ""].filter(Boolean).join("\n").slice(0, 1200);
}

export function travelPriorities(trip: TravelDraft): Array<{ title: string; text: string }> {
  const priorities = [{ title: "Léčení a návrat domů", text: `Pro destinaci „${trip.destination.trim()}“ porovnáme léčebné výlohy, asistenci, převoz a místní rozsah platnosti.` }];
  if (trip.alreadyAbroad) priorities.push({ title: "Počátek krytí po odjezdu", text: "Už jste v zahraničí. Před sjednáním ověříme, zda je možné pojištění uzavřít a od kdy skutečně platí." });
  if (trip.activities.includes("hiking")) priorities.push({ title: "Konkrétní trasa, ne jen „sport“", text: `Ferraty: ${trip.ferrata}. Výška: ${trip.altitude}. Ověříme zařazení aktivity, zásah horské služby a samostatně odpovědnost.` });
  if (trip.activities.includes("diving")) priorities.push({ title: "Hloubka a oprávnění k ponoru", text: `${trip.diving}. Upřesníme prostředí ponoru, certifikaci nebo doprovod instruktora a potřebné připojištění.` });
  if (trip.activities.includes("winter")) priorities.push({ title: "Sjezdovka a volný terén se liší", text: `${trip.winter}. Ověříme rozsah sportů, záchranné náklady, odpovědnost a případné krytí vypůjčené výbavy.` });
  if (trip.activities.includes("rental")) priorities.push({ title: "Škoda na půjčeném vozidle", text: `${trip.rental}: porovnáme odpovědnost za škodu na pronajaté věci i pojištění spoluúčasti z půjčovny. Rozhoduje důvod nároku, limit a podmínky pronájmu.` });
  if (trip.activities.includes("family") || travelAges(trip.ages).some(age => age < 18)) priorities.push({ title: "Když potřebuje pomoc dítě", text: "Porovnáme náklady na doprovod, ubytování blízkého a návrat ostatních členů rodiny." });
  if (trip.activities.includes("work")) priorities.push({ title: "Co přesně budete dělat", text: "Administrativní cesta, manuální práce a stáž mohou mít odlišné podmínky. Připojištění léčebných výloh nemusí rozšířit odpovědnost při práci." });
  if (trip.activities.includes("storno")) priorities.push({ title: "Storno řešte už při placení", text: "Rozhoduje datum úhrady, cena služeb, důvod zrušení a spoluúčast. Prověříme, zda lze storno pro vaši cestu ještě sjednat." });
  priorities.push({ title: "Škoda způsobená někomu jinému", text: "Odpovědnost posoudíme zvlášť od léčení, včetně omezení pro sport, vypůjčené věci a jednotlivých dílčích limitů." });
  return priorities;
}

export function travelComparisons(trip: TravelDraft) {
  if (trip.activities.includes("rental")) return [
    { name: "AXA", title: "Spoluúčast do 60 000 Kč", text: "Samostatné připojištění půjčeného vozidla. Ověříme oficiální zahraniční půjčovnu, příčinu škody a povinné doklady, včetně policejní zprávy.", source: TRAVEL_SOURCES.axa },
    { name: "Kooperativa", title: "PLUS: spoluúčast 10 000 Kč", text: "Přehled KOLUMBUS uvádí krytí ve variantě PLUS při odpovídajícím ujednání. Porovnáme tento limit se spoluúčastí vaší půjčovny.", source: TRAVEL_SOURCES.koop },
    { name: "ČPP", title: "Odpovědnost až 500 000 Kč", text: "Krytí škody na pronajaté movité věci od profesionální půjčovny: 10 % limitu odpovědnosti, nejvýše 500 000 Kč. MINI do 250 000 Kč, OPTI a MAXI do 500 000 Kč. U půjčeného vozidla posuzujeme zákonnou odpovědnost za škodu; nejde o automatické proplacení smluvní spoluúčasti.", source: TRAVEL_SOURCES.cppLiability },
  ];
  if (trip.activities.includes("hiking")) return [
    { name: "AXA", title: "Rozhoduje obtížnost ferraty", text: "Podmínky od 15. 6. 2026 řadí A/B mezi běžné sporty, C/D mezi rizikové. Potřebný rozsah ověříme podle trasy a zvolené varianty.", source: TRAVEL_SOURCES.axa },
    { name: "Kooperativa", title: "Aktivní sport: ferraty do C", text: "Rozsah aktivního sportu uvádí ferraty nejvýše C. Pro vyšší obtížnost ověříme možnost jiného výslovného ujednání; samotné připojištění aktivního sportu nestačí.", source: TRAVEL_SOURCES.koop },
    { name: "ČPP", title: "Sport i vybavení zvlášť", text: "Připojištění výbavy samo nepotvrzuje krytí sportovní činnosti. Pro konkrétní trasu ověříme zařazení sportu, rozsah záchrany a odpovědnosti.", source: TRAVEL_SOURCES.cpp },
  ];
  return [
    { name: "ČPP", title: "Storno a doplňky pro cestu", text: "U Storno PLUS zkontrolujeme datum platby i sjednání, limit a spoluúčast. Připojištění vybereme podle vašich plánů.", source: TRAVEL_SOURCES.cpp },
    { name: "Kooperativa", title: "KLASIK nebo PLUS", text: "Porovnáme samostatné limity na léčení, zásah záchranářů, doprovod i zavazadla. Vyšší léčebný limit není limitem pro všechny situace.", source: TRAVEL_SOURCES.koop },
    { name: "AXA", title: "Rozsah konkrétní varianty", text: "REFERENCE, KOMFORT a EXCELENT se liší krytím i dostupnými připojištěními. Například rizikové sporty nelze přidat k variantě REFERENCE.", source: TRAVEL_SOURCES.axa },
  ];
}

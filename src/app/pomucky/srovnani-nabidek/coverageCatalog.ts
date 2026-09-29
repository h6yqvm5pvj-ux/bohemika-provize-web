import { AMOUNT_TYPES, COVERAGE_STATUSES, DISABILITY_DEGREES } from "./lifeCoverage";
import { formatMoneyValue } from "./money";

export type CoverageField = {
  id: string; label: string; unit?: string; placeholder?: string;
  options?: readonly { id: string; label: string }[]; multiple?: boolean;
  when?: { field: string; values: readonly string[] };
};
type Definition = { id: string; label: string; icon: string; category: "life" | "auto"; group: string; fields: readonly CoverageField[] };
const money = (id: string, label: string, unit = "Kč"): CoverageField => ({ id, label, unit, placeholder: "Částka podle smlouvy" });
const text = (id: string, label: string, placeholder = "Doplň podle smlouvy"): CoverageField => ({ id, label, placeholder });
const amount = money("amount", "Pojistná částka");
const limit = money("limit", "Limit plnění");
const scope = text("scope", "Rozsah / varianta");
const waiting = text("waiting", "Čekací doba", "Např. bez čekací doby / 3 měsíce");
const territory = text("territory", "Územní platnost", "Např. ČR / Evropa včetně omezení");
const amountCourse: CoverageField[] = [
  { id: "amountType", label: "Průběh pojistné částky", options: AMOUNT_TYPES },
  { id: "interestRate", label: "Úrok z úvěru", unit: "%", when: { field: "amountType", values: ["loan"] } },
];
const dailyFields: CoverageField[] = [
  money("dailyAmount", "Denní dávka", "Kč/den"), scope,
  text("qualifyingDays", "Minimální doba trvání", "Např. alespoň 29 dní"),
  text("paidFrom", "Plnění od / zpětně", "Např. od 29. dne zpětně od 1. dne"),
  text("maxDays", "Maximální doba plnění", "Např. 730 dní / bez omezení"), waiting,
];
const sumFields: CoverageField[] = [amount, scope, waiting];
export const DEDUCTIBLE_FIELDS: readonly CoverageField[] = [
  { id: "deductibleType", label: "Spoluúčast", options: [
    { id: "none", label: "Bez spoluúčasti" }, { id: "fixed", label: "Pevná částka" },
    { id: "percent", label: "Procentní" }, { id: "percent-min", label: "Procentní s minimem" }, { id: "custom", label: "Jiné ujednání" },
  ] },
  { ...money("deductibleFixed", "Pevná spoluúčast"), when: { field: "deductibleType", values: ["fixed"] } },
  { ...money("deductiblePercent", "Procentní spoluúčast", "%"), when: { field: "deductibleType", values: ["percent", "percent-min"] } },
  { ...money("deductibleMin", "Minimální spoluúčast"), when: { field: "deductibleType", values: ["percent-min"] } },
  { ...text("deductibleCustom", "Vlastní spoluúčast"), when: { field: "deductibleType", values: ["custom"] } },
];
const autoFields: CoverageField[] = [limit, ...DEDUCTIBLE_FIELDS, scope, territory];
export const AUTO_LIABILITY_LIMITS = [35, 50, 60, 70, 100, 150, 200, 250].map(limit => ({ id: String(limit), label: `${limit}/${limit} mil. Kč` }));

export function deductibleLabel(values: Record<string, string>): string {
  const withUnit = (id: string, unit: string) => {
    const value = values[id]?.trim() || "";
    if (unit === "Kč") return formatMoneyValue(value);
    return value && /^[\d\s.,]+$/.test(value) ? `${value} ${unit}` : value;
  };
  switch (values.deductibleType) {
    case "none": return "Bez spoluúčasti";
    case "fixed": return withUnit("deductibleFixed", "Kč");
    case "percent": return withUnit("deductiblePercent", "%");
    case "percent-min": {
      const percent = withUnit("deductiblePercent", "%"), minimum = withUnit("deductibleMin", "Kč");
      return [percent, minimum && `min. ${minimum}`].filter(Boolean).join(", ");
    }
    case "custom": return values.deductibleCustom?.trim() || "";
    default: return "";
  }
}

export function liabilityLimitsLabel(values: Record<string, string>): string {
  const health = values.healthLimit?.trim() || "", property = values.propertyLimit?.trim() || "";
  if (!health && !property) return "";
  const numeric = (value: string) => /^[\d\s.,]+$/.test(value);
  if (numeric(health) && numeric(property)) return `${health}/${property} mil. Kč`;
  return [health, property].map(value => !value ? "Neuvedeno" : numeric(value) ? `${value} mil. Kč` : value).join(" / ");
}

// These are editable comparison prompts, not an insurer/product eligibility matrix.
// Research provenance and the scope of the catalog are documented in coverage-sources.md.
export const COVERAGE_CATALOG = [
  { id: "life-aid", label: "Příspěvek na pořízení zvláštní pomůcky", icon: "wallet", category: "life", group: "Zdraví a soběstačnost", fields: [limit, text("contribution", "Výše příspěvku / podíl nákladů"), scope, waiting] },
  { id: "life-diabetes", label: "Cukrovka a její komplikace", icon: "heart", category: "life", group: "Zdraví a soběstačnost", fields: [...sumFields, text("benefit", "Plnění za diagnózu / komplikace")] },
  { id: "life-vaccination", label: "Závažné následky očkování", icon: "shield", category: "life", group: "Zdraví a soběstačnost", fields: [...sumFields, territory] },
  { id: "life-upper-limbs", label: "Pojištění horních končetin", icon: "activity", category: "life", group: "Úrazy", fields: [...sumFields, text("valuation", "Plnění / oceňovací tabulka")] },
  { id: "life-critical", label: "Závažná onemocnění a poranění", icon: "heart", category: "life", group: "Zdraví a soběstačnost", fields: [amount, ...amountCourse, scope, text("repeat", "Opakované plnění / celkový limit"), waiting] },
  { id: "life-cancer", label: "Rakovina včetně in situ", icon: "heart", category: "life", group: "Zdraví a soběstačnost", fields: [...sumFields, text("early", "Časná stadia / in situ"), text("repeat", "Opakované plnění")] },
  { id: "life-care", label: "Závislost na péči / nesoběstačnost", icon: "home", category: "life", group: "Zdraví a soběstačnost", fields: [amount, money("pension", "Měsíční renta", "Kč/měsíc"), text("degrees", "Kryté stupně závislosti"), scope, waiting] },
  { id: "life-pension", label: "Invalidita s výplatou důchodu", icon: "wallet", category: "life", group: "Příjem a rodina", fields: [money("pension", "Měsíční důchod", "Kč/měsíc"), { id: "degrees", label: "Stupně invalidity", options: DISABILITY_DEGREES }, text("course", "Průběh důchodu", "Konstantní / rostoucí podle smlouvy"), text("duration", "Doba výplaty"), waiting] },
  { id: "life-incapacity", label: "Pracovní neschopnost", icon: "briefcase", category: "life", group: "Příjem a rodina", fields: dailyFields },
  { id: "life-hospital", label: "Hospitalizace", icon: "heart", category: "life", group: "Příjem a rodina", fields: dailyFields },
  { id: "life-child-care", label: "Ošetřování dítěte / pojištěného", icon: "home", category: "life", group: "Příjem a rodina", fields: dailyFields },
  { id: "life-waiver", label: "Zproštění od placení pojistného", icon: "wallet", category: "life", group: "Příjem a rodina", fields: [text("trigger", "Důvod zproštění", "Např. invalidita / pracovní neschopnost"), money("premium", "Hrazené pojistné", "Kč/měsíc"), text("duration", "Doba zproštění"), waiting] },
  { id: "life-accidental-death", label: "Smrt následkem úrazu", icon: "shield", category: "life", group: "Úrazy", fields: sumFields },
  { id: "life-traffic-death", label: "Smrt při dopravní nehodě", icon: "car", category: "life", group: "Úrazy", fields: sumFields },
  { id: "life-daily-injury", label: "Denní odškodné / léčení úrazu", icon: "activity", category: "life", group: "Úrazy", fields: [...dailyFields, text("progression", "Progrese denního odškodného")] },
  { id: "life-injury-payment", label: "Tělesné poškození / následky úrazu", icon: "activity", category: "life", group: "Úrazy", fields: [amount, scope, text("valuation", "Plnění / oceňovací tabulka")] },
  { id: "life-fractures", label: "Zlomeniny", icon: "activity", category: "life", group: "Úrazy", fields: [amount, scope, text("valuation", "Plnění / oceňovací tabulka")] },
  { id: "life-surgery", label: "Chirurgický zákrok", icon: "heart", category: "life", group: "Zdraví a soběstačnost", fields: [...sumFields, text("valuation", "Plnění / oceňovací tabulka")] },
  { id: "life-congenital", label: "Vrozené vady dětí", icon: "heart", category: "life", group: "Příjem a rodina", fields: sumFields },
  { id: "life-child-surgery", label: "Operace dítěte s vrozenou vadou", icon: "heart", category: "life", group: "Příjem a rodina", fields: sumFields },
  { id: "life-reproduction", label: "Asistovaná reprodukce", icon: "heart", category: "life", group: "Příjem a rodina", fields: [limit, text("cycles", "Počet cyklů / limit na cyklus"), scope, waiting] },
  { id: "life-assistance", label: "Zdravotní a sociální asistence", icon: "info", category: "life", group: "Příjem a rodina", fields: [text("package", "Název programu"), scope, text("services", "Služby a jejich limity"), territory] },
  { id: "auto-liability", label: "Povinné ručení", icon: "umbrella", category: "auto", group: "Základní krytí", fields: [money("healthLimit", "Limit újmy na zdraví", "mil. Kč"), money("propertyLimit", "Limit majetkových škod", "mil. Kč"), territory, text("conditions", "Další limity a ujednání")] },
  { id: "auto-collision", label: "Havarijní pojištění", icon: "car", category: "auto", group: "Základní krytí", fields: [amount,
    { id: "risks", label: "Sjednaná rizika", multiple: true, options: [{ id: "collision", label: "Havárie" }, { id: "theft", label: "Odcizení" }, { id: "nature", label: "Živel" }, { id: "vandalism", label: "Vandalismus" }, { id: "animal-hit", label: "Střet se zvířetem" }, { id: "animal-damage", label: "Poškození zvířetem" }] },
    ...DEDUCTIBLE_FIELDS, territory, text("valuation", "Ocenění / způsob opravy", "Např. obvyklá cena, smluvní servis") ] },
  { id: "auto-glass", label: "Pojištění skel", icon: "car", category: "auto", group: "Připojištění vozidla", fields: [limit, ...DEDUCTIBLE_FIELDS, text("glassScope", "Pojištěná skla", "Čelní / všechna / včetně panoramy"), text("repair", "Oprava, výměna a kalibrace")] },
  { id: "auto-animal-hit", label: "Střet se zvířetem", icon: "alert", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-animal-damage", label: "Poškození zvířetem", icon: "alert", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-nature", label: "Živelní rizika", icon: "umbrella", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-theft", label: "Odcizení vozidla", icon: "shield", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-vandalism", label: "Vandalismus", icon: "shield", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-gap", label: "GAP / doplatek do pořizovací ceny", icon: "wallet", category: "auto", group: "Připojištění vozidla", fields: [limit, money("purchasePrice", "Pořizovací cena"), text("duration", "Doba krytí GAP", "Např. 36 měsíců"), ...DEDUCTIBLE_FIELDS, text("conditions", "Podmínky plnění / krytí spoluúčasti")] },
  { id: "auto-assistance", label: "Asistenční služby", icon: "info", category: "auto", group: "Asistence a mobilita", fields: [
    text("package", "Název programu"), territory,
    { id: "events", label: "Situace s nárokem na asistenci", multiple: true, options: [{ id: "accident", label: "Nehoda" }, { id: "breakdown", label: "Porucha" }, { id: "theft", label: "Odcizení" }, { id: "tyre", label: "Defekt" }, { id: "battery", label: "Vybitá baterie" }, { id: "keys", label: "Klíče" }, { id: "fuel", label: "Palivo" }] },
    text("towingCz", "Odtah v ČR", "Např. 200 km / 5 000 Kč / bez limitu"),
    text("towingAbroad", "Odtah v zahraničí", "Uveď limit v km či Kč a cíl odtahu"),
    text("repair", "Oprava na místě / limit"), text("replacement", "Náhradní vozidlo / počet dnů"),
    text("return", "Repatriace vozidla / doprava posádky"), text("accommodation", "Ubytování / limit"), text("frequency", "Počet zásahů za rok"),
  ] },
  { id: "auto-replacement", label: "Náhradní vozidlo", icon: "car", category: "auto", group: "Asistence a mobilita", fields: [money("dailyLimit", "Denní limit", "Kč/den"), text("days", "Maximální počet dnů"), limit, text("trigger", "Kdy vzniká nárok"), ...DEDUCTIBLE_FIELDS] },
  { id: "auto-transport", label: "Náklady na náhradní dopravu", icon: "car", category: "auto", group: "Asistence a mobilita", fields: [limit, money("dailyLimit", "Denní limit", "Kč/den"), text("duration", "Doba plnění"), scope] },
  { id: "auto-passengers", label: "Úraz řidiče a posádky", icon: "activity", category: "auto", group: "Posádka a další ochrana", fields: [text("persons", "Pojištěné osoby", "Řidič / posádka / počet sedadel"), money("death", "Smrt úrazem"), money("injury", "Trvalé následky úrazu"), text("progression", "Progrese"), money("dailyAmount", "Denní odškodné", "Kč/den")] },
  { id: "auto-luggage", label: "Zavazadla, nosiče a boxy", icon: "briefcase", category: "auto", group: "Posádka a další ochrana", fields: autoFields },
  { id: "auto-legal", label: "Právní ochrana", icon: "shield", category: "auto", group: "Posádka a další ochrana", fields: autoFields },
  { id: "auto-no-fault", label: "Nezaviněná nehoda", icon: "car", category: "auto", group: "Připojištění vozidla", fields: autoFields },
  { id: "auto-pothole", label: "Poškození pneumatik a disků / výmol", icon: "car", category: "auto", group: "Připojištění vozidla", fields: autoFields },
] as const satisfies readonly Definition[];
export type CatalogCoverageKind = typeof COVERAGE_CATALOG[number]["id"];
export type CatalogDetails = { kind: CatalogCoverageKind; status: typeof COVERAGE_STATUSES[number]["id"]; values: Record<string, string> };
export const catalogDefinition = (kind: CatalogCoverageKind): Definition => COVERAGE_CATALOG.find(item => item.id === kind)!;
export const createCatalogDetails = (kind: CatalogCoverageKind): CatalogDetails => ({ kind, status: "", values: Object.fromEntries(catalogDefinition(kind).fields.map(field => [field.id, ""])) });
export const fieldIsVisible = (field: CoverageField, values: Record<string, string>) => !field.when || field.when.values.includes(values[field.when.field]);
export function catalogDetailsText(details: CatalogDetails): string {
  if (details.status === "excluded") return "Nesjednáno";
  const lines = details.status === "included" ? ["Sjednáno"] : [];
  for (const field of catalogDefinition(details.kind).fields) {
    if (field.id === "deductibleType") {
      const deductible = deductibleLabel(details.values);
      if (deductible) lines.push(`Spoluúčast: ${deductible}`);
      continue;
    }
    if (DEDUCTIBLE_FIELDS.some(item => item.id === field.id)) continue;
    if (details.kind === "auto-liability" && field.id === "healthLimit") {
      const limits = liabilityLimitsLabel(details.values);
      if (limits) lines.push(`Limity odpovědnosti: ${limits}`);
      continue;
    }
    if (details.kind === "auto-liability" && field.id === "propertyLimit") continue;
    const value = details.values[field.id]?.trim();
    if (!value || !fieldIsVisible(field, details.values)) continue;
    const display = field.options
      ? value.split("|").map(id => field.options!.find(option => option.id === id)!.label).join(", ")
      : field.unit?.startsWith("Kč") ? formatMoneyValue(value, field.unit) : field.unit && /^[\d\s.,]+$/.test(value) ? `${value} ${field.unit}` : value;
    lines.push(`${field.label}: ${display}`);
  }
  return lines.join("\n");
}
export function parseCatalogDetails(value: unknown, kind: CatalogCoverageKind): CatalogDetails {
  const fail = (): never => { throw new Error("Soubor obsahuje neplatné parametry připojištění."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  if (data.kind !== kind || !COVERAGE_STATUSES.some(option => option.id === data.status) || !data.values || typeof data.values !== "object" || Array.isArray(data.values)) return fail();
  const source = data.values as Record<string, unknown>;
  const fields = catalogDefinition(kind).fields;
  if (Object.keys(source).some(key => !fields.some(field => field.id === key))) return fail();
  const values = Object.fromEntries(fields.map(field => {
    const value = source[field.id];
    if (typeof value !== "string" || value.length > 160) return fail();
    if (value && field.options) {
      const selected = value.split("|");
      if ((!field.multiple && selected.length !== 1) || new Set(selected).size !== selected.length || selected.some(id => !field.options!.some(option => option.id === id))) return fail();
    }
    return [field.id, value];
  }));
  return { kind, status: data.status as CatalogDetails["status"], values };
}

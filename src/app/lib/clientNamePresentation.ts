import { clientIdentityKey } from "../_klienti/clientIdentity";

const cleanName = (value: string): string => value.normalize("NFC").trim().replace(/\s+/g, " ");
const foldName = (value: string): string => cleanName(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs-CZ");

export type ClientCompanySearchParts = { form: string; words: string[] };

const boundedForm = (pattern: string, trailingOnly = false): RegExp =>
  new RegExp(`(^|[^\\p{L}\\p{N}])(${pattern})${trailingOnly ? "(?=[\\s,.]*$)" : "(?=$|[^\\p{L}\\p{N}])"}`, "iu");

// Only search aliases use these forms. Their spelling never changes a card ID
// or the stored business name. An incomplete s.r. is a search alias for s.r.o.
const companyForms: [string, RegExp][] = [
  ["sro", boundedForm("s\\.?\\s*r\\.?\\s*o\\.?")],
  ["sro", boundedForm("s(?:\\.\\s*|\\s+)r\\.?")],
  ["as", boundedForm("a\\.\\s*s\\.?|a\\s+s\\.?")],
  ["as", boundedForm("as", true)],
  ["zs", boundedForm("z\\.\\s*s\\.?|z\\s+s\\.?")],
  ["zs", boundedForm("zs", true)],
  ["vos", boundedForm("v\\.?\\s*o\\.?\\s*s\\.?")],
  ["ks", boundedForm("k\\.\\s*s\\.?|k\\s+s\\.?")],
  ["ks", boundedForm("ks", true)],
  ["ops", boundedForm("o\\.?\\s*p\\.?\\s*s\\.?")],
  ["sp", boundedForm("s\\.\\s*p\\.?|s\\s+p\\.?")],
  ["sp", boundedForm("sp", true)],
  ["spol", boundedForm("spol\\.?")],
  ["druzstvo", boundedForm("druzstvo")],
  ["nadace", boundedForm("nadace")],
  ["ustav", boundedForm("ustav")],
  ["obec", boundedForm("obec")],
  ["mesto", boundedForm("mesto")],
];

/** Forgiving business-name tokens for search and suggestions, never identity. */
export function clientCompanySearchParts(value: string): ClientCompanySearchParts | null {
  const source = foldName(value);
  for (const [form, pattern] of companyForms) {
    const match = pattern.exec(source);
    if (!match) continue;
    const markerStart = match.index + match[1].length;
    const withoutForm = `${source.slice(0, markerStart)} ${source.slice(match.index + match[0].length)}`;
    let words: string[] = withoutForm.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (form === "sro") words = words.filter(word => word !== "spol");
    return { form, words };
  }
  return null;
}

const titles: Record<string, string> = {
  ingarch: "Ing. arch.", prof: "prof.", doc: "doc.", ing: "Ing.",
  mgr: "Mgr.", mga: "MgA.", bc: "Bc.", bca: "BcA.",
  mudr: "MUDr.", mddr: "MDDr.", mvdr: "MVDr.", judr: "JUDr.",
  rndr: "RNDr.", phdr: "PhDr.", pharmdr: "PharmDr.", thdr: "ThDr.",
  thlic: "ThLic.", paeddr: "PaedDr.", dr: "Dr.", phd: "Ph.D.",
  thd: "Th.D.", csc: "CSc.", drsc: "DrSc.", dis: "DiS.",
  mba: "MBA", msc: "MSc.", llm: "LLM", bba: "BBA",
};
const titlePattern = new RegExp(
  "(^|[\\s,])(ing\\.?\\s*arch|ph\\.?\\s*d|th\\.?\\s*d|pharmdr|paeddr|thlic|mudr|mddr|mvdr|judr|rndr|phdr|thdr|drsc|prof|doc|ing|mgr|mga|bca|bc|dr|csc|dis|mba|msc|llm|bba)(?:\\.(?=\\s|,|$|\\p{L})|(?=\\s|,|$))",
  "giu",
);

/** Format a person without changing the strict name-derived client identity. */
export function formatClientDisplayName(value: string, options: { isCompany?: boolean } = {}): string {
  const name = cleanName(value);
  if (options.isCompany || clientCompanySearchParts(name)) return name;
  // A lone uppercase token can be a business acronym without a legal form.
  // Require a fuller person name before replacing that ambiguous spelling.
  if (/^\p{Lu}[\p{Lu}\p{M}]+$/u.test(name)) return name;
  const capitalized = name.toLocaleLowerCase("cs-CZ").replace(/\p{L}[\p{L}\p{M}]*/gu, word => {
    const first = String.fromCodePoint(word.codePointAt(0)!);
    return first.toLocaleUpperCase("cs-CZ") + word.slice(first.length);
  });
  const formatted = capitalized.replace(titlePattern, (match: string, boundary: string, title: string, offset: number, source: string) => {
    const canonical = titles[title.toLocaleLowerCase("cs-CZ").replace(/[.\s]/g, "")];
    const next = source.slice(offset + match.length);
    return boundary + canonical + (/^\p{L}/u.test(next) ? " " : "");
  });
  // Title punctuation can expand a validated 200-character input. Keep such a
  // name readable by the same bounded parsers after it is saved.
  if (formatted.length > 200) return name;
  // Some Unicode uppercase mappings expand a letter (e.g. ß -> SS). Neither
  // formatting nor title cleanup may move encrypted cards to another identity.
  return clientIdentityKey(formatted) === clientIdentityKey(name) ? formatted : name;
}

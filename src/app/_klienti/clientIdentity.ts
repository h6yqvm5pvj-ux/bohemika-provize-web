// Identity matching is deliberately stricter than search: accents, word order,
// hyphens and company names remain significant. Never merge on a fuzzy match.
const title = "(?:prof|doc|ing\\.?\\s*arch|ing|mgr|mg[a]|bc[a]?|mudr|mddr|mvdr|judr|rndr|phdr|pharmdr|thdr|thlic|paeddr|dr|ph\\.?\\s*d|th\\.?\\s*d|csc|drsc|dis|mba|msc|llm|bba)";
const prefixTitle = new RegExp(`^(?:prof|doc|ing\\.?\\s*arch|ing|mgr|mga|bc[a]?|mudr|mddr|mvdr|judr|rndr|phdr|pharmdr|thdr|thlic|paeddr|dr)(?:\\.\\s*|\\s+)(?=\\p{L})`, "iu");
const suffixTitle = new RegExp(`(?:,\\s*|\\s+)${title}\\.?$`, "iu");
const companyForm = /(?:^|[\s,])(?:s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|z\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|o\.?\s*p\.?\s*s\.?|spol\.?|družstvo|nadace|ústav|obec|město|s\.p\.)(?:$|[\s,])/iu;

export function clientNameWithoutTitles(value: string | null | undefined): string {
  let name = (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (companyForm.test(name)) return name;
  let previous: string;
  do {
    previous = name;
    name = name.replace(prefixTitle, "").replace(suffixTitle, "").trim();
  } while (name !== previous);
  return name;
}

export const clientIdentityKey = (name: string | null | undefined): string =>
  clientNameWithoutTitles(name).toLocaleLowerCase("cs-CZ");

export const normalizeClientSearch = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ").trim();

// Reversible encoding avoids collisions between distinct accented names and
// keeps IDs stable when a title is added. Preserve the existing saved pilot card.
export function clientSlugForName(name: string | null | undefined): string | null {
  const key = clientIdentityKey(name);
  if (!key || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) return null;
  if (key === "martin březina") return "martin-brezina";
  return `c-${Array.from(new TextEncoder().encode(key), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function isClientCardSlug(slug: string): boolean {
  if (slug === "martin-brezina") return true;
  if (!/^c-(?:[0-9a-f]{2}){1,600}$/.test(slug)) return false;
  try {
    const bytes = Uint8Array.from(slug.slice(2).match(/../g)!, (byte) => parseInt(byte, 16));
    const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !/[\u0000-\u001f\u007f]/.test(name) && clientSlugForName(name) === slug;
  } catch {
    return false;
  }
}

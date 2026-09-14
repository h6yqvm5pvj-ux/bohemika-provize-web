import { clientIdentityKey } from "../_klienti/clientIdentity";
import { extractTerminationPolicyholderFromLines } from "./parseTerminationPolicyholderPdf";

export type ClientPdfEmailResult = {
  status: "found" | "not-found" | "name-mismatch" | "ambiguous";
  email: string | null;
};

const normalize = (value: string) => value.normalize("NFC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const ascii = (value: string) => normalize(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const start = /^(?:(?:\d+|[a-z]|[ivx]+)[.)]?\s+)?(?:pojistitel\s+)?(?:pojistnik(?:\s*\(vy\))?(?:\s*(?:\/|a|=)\s*pojisteny)?|udaje\s+o\s+pojistnikovi|ucastnik|udaje\s+o\s+ucastnikovi)(?:\s|:|$)/;
const end = /\b(?:zprostredkovatel(?:e)?|pojistovaci\s+zprostredkovatel(?:e)?|obchodni\s+zastupce|poradce|makler|pojisteny|pojistene\s+vozidlo|udaje\s+o\s+vozidle|pojistena\s+osoba|pojistene\s+osoby|vlastnik|provozovatel|opravnena\s+osoba|obmyslena\s+osoba|rozsah\s+pojisteni|predmet\s+pojisteni|misto\s+pojisteni|podpisy)\b/;
const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Conservative extraction for permanent records. Never fall back to an email
 * elsewhere in the PDF: the policyholder section must identify this client,
 * and every matching section must agree on a single address. */
export function extractClientEmailFromPdfLines(sourceLines: readonly string[], clientName: string): ClientPdfEmailResult {
  const expected = clientIdentityKey(clientName);
  if (!expected) return { status: "name-mismatch", email: null };
  const namePattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(expected).replace(/ /g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "iu");
  const lines = sourceLines.map(normalize).filter(Boolean);
  const candidates = new Set<string>();
  let matchedName = false;
  let foundSection = false;
  for (let index = 0; index < lines.length; index++) {
    const heading = ascii(lines[index]);
    const opening = heading.match(start);
    if (!opening) continue;
    foundSection = true;
    const section: string[] = [];
    for (let offset = index; offset < Math.min(lines.length, index + 80); offset++) {
      const line = lines[offset];
      const normalized = ascii(line);
      if (offset > index && start.test(normalized)) break;
      // A role may start in the same PDF row, especially in two-column layouts.
      const skip = offset === index ? opening[0].length : 0;
      const boundary = normalized.slice(skip).match(end);
      const beforeBoundary = boundary?.index == null ? line : line.slice(0, skip + boundary.index);
      if (beforeBoundary.trim()) section.push(beforeBoundary.trim());
      if (boundary) break;
    }
    const parsedName = extractTerminationPolicyholderFromLines(section).policyholderName;
    const labelledName = section.join(" ").replace(/(?:titul\s+(?:p[řr]ed|za)|jm[ée]no|p[řr][íi]jmen[íi])\s*:?\s*/giu, " ");
    if (!namePattern.test(section.join(" ")) && !namePattern.test(labelledName) && clientIdentityKey(parsedName) !== expected) continue;
    matchedName = true;
    for (const match of section.join(" ").matchAll(emailPattern)) {
      const email = match[0].toLowerCase();
      if (email.length <= 254 && !email.includes("..")) candidates.add(email);
    }
  }
  if (candidates.size > 1) return { status: "ambiguous", email: null };
  if (candidates.size === 1) return { status: "found", email: [...candidates][0] };
  return { status: foundSection && !matchedName ? "name-mismatch" : "not-found", email: null };
}

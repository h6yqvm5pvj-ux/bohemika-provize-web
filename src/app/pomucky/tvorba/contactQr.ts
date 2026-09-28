export type ContactDetails = {
  fullName: string;
  jobTitle: string;
  companyId: string;
  phone: string;
  email: string;
  officeAddress: string;
};

export type ContactQr = { payload: string; label: string; href?: string };
export type QrSymbol = { size: number; runs: { x: number; y: number; width: number }[] };
export const QR_MARGIN = 4;

const escapeValue = (value: string) => value.trim().replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { result += "\r\n "; bytes = 1; }
    result += character;
    bytes += length;
  }
  return result;
}

export function onlineCardUrl(profile: Record<string, unknown> | undefined, origin: string): string {
  const card = profile?.onlineCard;
  if (!card || typeof card !== "object" || !("enabled" in card) || card.enabled !== true || !("slug" in card) || typeof card.slug !== "string" || !card.slug.trim()) return "";
  return `${origin}/vizitka/${encodeURIComponent(card.slug.trim())}`;
}

export function contactQr(details: ContactDetails, cardUrl = ""): ContactQr | null {
  if (cardUrl) return { payload: cardUrl, href: cardUrl, label: "Moje online vizitka" };
  if (![details.fullName, details.phone, details.email].some(value => value.trim())) return null;
  const name = details.fullName.trim() || "Bohemika a.s.";
  const parts = name.split(/\s+/);
  const familyName = parts.pop() ?? "";
  const lines = [
    "BEGIN:VCARD", "VERSION:3.0", `FN:${escapeValue(name)}`,
    `N:${escapeValue(familyName)};${escapeValue(parts.join(" "))};;;`,
    "ORG:Bohemika a.s.",
    details.jobTitle.trim() && `TITLE:${escapeValue(details.jobTitle)}`,
    details.phone.trim() && `TEL;TYPE=CELL,VOICE:${escapeValue(details.phone)}`,
    details.email.trim() && `EMAIL;TYPE=INTERNET:${escapeValue(details.email)}`,
    details.officeAddress.trim() && `ADR;TYPE=WORK:;;${escapeValue(details.officeAddress)};;;;`,
    details.companyId.trim() && `NOTE:IČ: ${escapeValue(details.companyId)}`,
    "END:VCARD",
  ].filter(Boolean);
  return { payload: `${lines.map(line => foldLine(String(line))).join("\r\n")}\r\n`, label: "Uložit kontakt" };
}

export async function createQrSymbol(payload: string): Promise<QrSymbol> {
  const { default: QRCode } = await import("qrcode");
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const runs: QrSymbol["runs"] = [];
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      const start = x;
      while (x + 1 < modules.size && modules.get(y, x + 1)) x++;
      runs.push({ x: start + QR_MARGIN, y: y + QR_MARGIN, width: x - start + 1 });
    }
  }
  return { size: modules.size + QR_MARGIN * 2, runs };
}

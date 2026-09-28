import { describe, expect, it } from "vitest";
import { contactQr, createQrSymbol, onlineCardUrl, QR_MARGIN, type ContactDetails } from "./contactQr";

const advisor: ContactDetails = { fullName: "Petra Nováková", jobTitle: "Finanční poradkyně", companyId: "12345678", phone: "+420 777 123 456", email: "petra@example.cz", officeAddress: "Náměstí 123, Praha" };

describe("business card QR", () => {
  it("links to the active online card and keeps disabled cards out of the PDF", () => {
    expect(onlineCardUrl({ onlineCard: { enabled: true, slug: "petra-novakova" } }, "https://bohemika.app")).toBe("https://bohemika.app/vizitka/petra-novakova");
    expect(onlineCardUrl({ onlineCard: { enabled: false, slug: "petra-novakova" } }, "https://bohemika.app")).toBe("");
    expect(onlineCardUrl({ onlineCard: { enabled: true, slug: " " } }, "https://bohemika.app")).toBe("");
    expect(contactQr(advisor, "https://bohemika.app/vizitka/petra")).toEqual({ payload: "https://bohemika.app/vizitka/petra", href: "https://bohemika.app/vizitka/petra", label: "Moje online vizitka" });
  });

  it("provides a contact without an online card, including Czech text and escaped delimiters", () => {
    const qr = contactQr({ ...advisor, fullName: "Petra; Nováková", officeAddress: "Náměstí 123, Praha\nURL:https://example.test" })!;
    expect(qr.payload).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n");
    expect(qr.payload).toContain("FN:Petra\\; Nováková\r\n");
    expect(qr.payload).toContain("N:Nováková;Petra\\;;;;\r\n");
    expect(qr.payload).toContain("TEL;TYPE=CELL,VOICE:+420 777 123 456\r\n");
    expect(qr.payload).toContain("EMAIL;TYPE=INTERNET:petra@example.cz\r\n");
    expect(qr.payload).toContain("Náměstí 123\\, Praha\\nURL:");
    expect(qr.payload).not.toContain("\r\nURL:");
    expect(qr.href).toBeUndefined();
  });

  it("does not generate a placeholder contact, and preserves UTF-8 when folding long lines", () => {
    expect(contactQr({ fullName: "", jobTitle: "", phone: "", email: "", officeAddress: "", companyId: "" })).toBeNull();
    const name = "Štěpán Žluťoučký ".repeat(6).trim();
    const qr = contactQr({ ...advisor, fullName: name })!;
    expect(qr.payload.replace(/\r\n /g, "")).toContain(`FN:${name}\r\n`);
    expect(qr.payload.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("produces a square symbol with four empty modules on every side", async () => {
    const symbol = await createQrSymbol(contactQr(advisor)!.payload);
    expect(symbol.size).toBeGreaterThan(29);
    expect(symbol.runs.length).toBeGreaterThan(30);
    for (const run of symbol.runs) {
      expect(run.x).toBeGreaterThanOrEqual(QR_MARGIN);
      expect(run.y).toBeGreaterThanOrEqual(QR_MARGIN);
      expect(run.x + run.width).toBeLessThanOrEqual(symbol.size - QR_MARGIN);
      expect(run.y).toBeLessThan(symbol.size - QR_MARGIN);
    }
  });
});

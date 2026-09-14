import { describe, expect, it } from "vitest";
import { extractClientEmailFromPdfLines as extract } from "./extractClientEmailFromPdf";

describe("emails eligible for permanent client-card storage", () => {
  it("reads the identified policyholder, normalizing titles and email case", () => {
    expect(extract(["Pojistník (Vy)", "Jméno a příjmení: Bc. Petr Novák", "E-mail: PETR@EXAMPLE.TEST", "Zprostředkovatel", "poradce@example.test"], "Petr Novák")).toEqual({ status: "found", email: "petr@example.test" });
  });
  it("handles separately labelled first and last names", () => {
    expect(extract(["Pojistník", "Jméno", "Petr", "Příjmení", "Novák", "E-mail", "petr@example.test"], "Petr Novák").email).toBe("petr@example.test");
  });
  it("reads first and last name fields placed together on one CPP row", () => {
    expect(extract(["Pojistník", "Titul před: Bc. Jméno: Petr Přijmení: Novák Titul za:", "E-mail: petr@example.test Telefon: 777123456", "Provozovatel vozidla: shodný s pojistníkem"], "Petr Novák").email).toBe("petr@example.test");
  });
  it("reads an Allianz policyholder next to the insurer and stops at the vehicle owner's section", () => {
    expect(extract(["Pojistitel Pojistník (Vy)", "Allianz pojišťovna, a.s. Petr Novák", "E-mail petr@example.test", "Vlastník/provozovatel je shodný s pojistníkem", "E-mail jiny@example.test"], "Petr Novák")).toEqual({ status: "found", email: "petr@example.test" });
  });
  it("handles lettered policyholder sections without including the insured's contact", () => {
    expect(extract(["B Pojistník", "Titul, jméno, příjmení Petr Novák Fyzická osoba", "E-mail petr@example.test", "C Pojištěný", "jiny@example.test"], "Petr Novák").email).toBe("petr@example.test");
  });
  it("does not match a different client, even if an email is present", () => {
    expect(extract(["Pojistník", "Jana Nová", "jana@example.test"], "Petr Novák")).toEqual({ status: "name-mismatch", email: null });
  });
  it("never falls back to the first email anywhere in the document", () => {
    expect(extract(["Petr Novák", "Email: poradce@example.test"], "Petr Novák")).toEqual({ status: "not-found", email: null });
  });
  it.each(["Zprostředkovatel", "Pojištěný", "Provozovatel vozidla", "Pojištěná osoba", "Obmyšlená osoba"])("stops before another person's section: %s", heading => {
    expect(extract(["Pojistník", "Petr Novák", heading, "jinak@example.test"], "Petr Novák").email).toBeNull();
  });
  it("separates another role starting on the same PDF row", () => {
    expect(extract(["Pojistník Petr Novák Zprostředkovatel poradce@example.test"], "Petr Novák").email).toBeNull();
  });
  it("requires an unambiguous email across all matching policyholder sections", () => {
    expect(extract(["Pojistník", "Petr Novák", "petr@example.test", "Pojistník", "Petr Novák", "jiny@example.test"], "Petr Novák")).toEqual({ status: "ambiguous", email: null });
  });
  it("deduplicates repeated copies of the same email", () => {
    expect(extract(["Pojistník", "Petr Novák", "petr@example.test", "PETR@EXAMPLE.TEST"], "Petr Novák")).toEqual({ status: "found", email: "petr@example.test" });
  });
});

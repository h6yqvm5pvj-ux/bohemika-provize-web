import { describe, expect, it } from "vitest";
import { officeContributionFromStatementHtml } from "./officeContribution";

const html = (description: string, amount = "10&nbsp;000,00 Kč") => `<div id="ostatni_platby"><table><tr><td>${description}</td><td>${amount}</td></tr></table></div>`;

describe("office contribution in statement other payments", () => {
  it.each(["Mimořádná provize za produkci 200 bodů", "<b>Mimořádná provize</b> za produkci 200 bodů", "Příspěvek na kancelář", "Příspěvek na provoz kanceláře"])("recognizes %s", description => {
    expect(officeContributionFromStatementHtml(html(description))).toBe(10000);
  });
  it.each(["Mimořádná provize za produkci 300 bodů", "Doplatek smlouvy 123456 A101", "Storno příspěvku na kancelář", "Jiná odměna"])("ignores unrelated or contract payment %s", description => {
    expect(officeContributionFromStatementHtml(html(description))).toBe(0);
  });
  it.each(["-10 000,00", "NaN", "Infinity", "100000001", "0", "0x2710", "1e4"])("rejects invalid or reversed amounts %s", amount => {
    expect(officeContributionFromStatementHtml(html("Příspěvek na kancelář", amount))).toBe(0);
  });
  it("does not read payments from a commission table or a missing document", () => {
    expect(officeContributionFromStatementHtml(html("Příspěvek na kancelář").replace('id="ostatni_platby"', 'id="provize"'))).toBe(0);
    expect(officeContributionFromStatementHtml(null)).toBe(0);
  });
});


it.each(["10.000 Kč", "10.000,00 Kč", "10000.00", "10 000,00"])("accepts common Czech money notation %s", amount => {
  expect(officeContributionFromStatementHtml(html("Příspěvek na kancelář", amount))).toBe(10000);
});

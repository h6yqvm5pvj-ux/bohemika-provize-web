import { describe, expect, it } from "vitest";

import {
  CONTACT_INSTITUTIONS,
  DEFAULT_DIRECTORY_CONTACTS,
  describeContactDirectoryChange,
  normalizeDirectoryContacts,
} from "./contactDirectory";

describe("contactDirectory", () => {
  it("obsahuje Pillow s připraveným logem", () => {
    expect(
      CONTACT_INSTITUTIONS.find((institution) => institution.key === "pillow"),
    ).toMatchObject({
      label: "Pillow",
      logoPath: "/icons/pillow.png",
    });
  });

  it("přijme kompletní výchozí adresář", () => {
    expect(normalizeDirectoryContacts(DEFAULT_DIRECTORY_CONTACTS)).toEqual(
      DEFAULT_DIRECTORY_CONTACTS,
    );
  });

  it("odmítne neznámou instituci a duplicitní ID", () => {
    expect(
      normalizeDirectoryContacts([
        {
          id: "kontakt",
          institutionKey: "neznamy-partner",
          emails: [{ value: "kontakt@example.cz" }],
        },
      ]),
    ).toBeNull();

    expect(
      normalizeDirectoryContacts([
        {
          id: "kontakt",
          institutionKey: "pillow",
          emails: [{ value: "prvni@example.cz" }],
        },
        {
          id: "kontakt",
          institutionKey: "allianz",
          emails: [{ value: "druhy@example.cz" }],
        },
      ]),
    ).toBeNull();
  });

  it("odmítne neplatný e-mail nebo kartu bez telefonu a e-mailu", () => {
    expect(
      normalizeDirectoryContacts([
        {
          id: "pillow-kontakt",
          institutionKey: "pillow",
          emails: [{ value: "neni-email" }],
        },
      ]),
    ).toBeNull();

    expect(
      normalizeDirectoryContacts([
        {
          id: "pillow-kontakt",
          institutionKey: "pillow",
          person: "Petr Novák",
        },
      ]),
    ).toBeNull();
  });

  it("popíše přidání, úpravu i odstranění kontaktu", () => {
    const original = {
      id: "pillow-kam",
      institutionKey: "pillow",
      person: "Petr Novák",
      emails: [{ value: "petr@pillow.cz" }],
    };

    expect(describeContactDirectoryChange([], [original])).toMatchObject({
      kind: "added",
      changedCount: 1,
      institutionKey: "pillow",
      message: expect.stringContaining("Pillow – Petr Novák"),
    });
    expect(
      describeContactDirectoryChange([original], [
        { ...original, person: "Petr Novotný" },
      ]),
    ).toMatchObject({ kind: "updated", changedCount: 1 });
    expect(describeContactDirectoryChange([original], [])).toMatchObject({
      kind: "removed",
      changedCount: 1,
    });
    expect(describeContactDirectoryChange([original], [original])).toBeNull();
  });
});

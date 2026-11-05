import { describe, expect, it } from "vitest";

import {
  CONTACT_INSTITUTIONS,
  describeContactDirectoryChange,
  normalizeDirectoryContacts,
} from "./contactDirectory";

import { DEFAULT_DIRECTORY_CONTACTS } from "@/lib/server/defaultContactDirectory";

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

  it("zařadí všechny starší kontakty do skupiny Všichni", () => {
    const contacts = normalizeDirectoryContacts([{
      id: "legacy-contact", institutionKey: "allianz", emails: [{ value: "legacy@example.test" }],
    }]);
    expect(contacts?.[0]?.audience).toEqual({ type: "everyone" });
    expect(DEFAULT_DIRECTORY_CONTACTS.every(contact => contact.audience?.type === "everyone")).toBe(true);
  });

  it.each([null, "everyone", {}, { type: "unknown" }, { type: "group" },
    { type: "everyone", groupId: "private-group" }, { type: "group", groupId: "../group" }])(
    "odmítne neplatné omezení viditelnosti %j", audience => {
      expect(normalizeDirectoryContacts([{
        id: "restricted-contact", institutionKey: "allianz", emails: [{ value: "restricted@example.test" }], audience,
      }])).toBeNull();
    },
  );

  it.each([{ type: "everyone" }, { type: "specialists" }, { type: "group", groupId: "group-a" }])(
    "zachová platné publikum %j", audience => {
      expect(normalizeDirectoryContacts([{
        id: "contact", institutionKey: "allianz", emails: [{ value: "contact@example.test" }], audience,
      }])?.[0]?.audience).toEqual(audience);
    },
  );

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

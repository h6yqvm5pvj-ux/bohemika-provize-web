import { describe, expect, it } from "vitest";
import { planContactAudienceMigration } from "./migrate-contact-audiences.mjs";

describe("legacy contact audience migration", () => {
  it("assigns legacy records to Everyone without dropping fields or mutating its input", () => {
    const record = { id: "contact-a", person: "Synthetic contact", institutionKey: "allianz",
      emails: [{ value: "synthetic@example.test", cc: "copy@example.test" }], customField: "preserved" };
    const plan = planContactAudienceMigration({ contacts: [record], revision: 4, groups: [{ id: "unchanged" }] });
    expect(plan).toEqual({ contacts: [{ ...record, audience: { type: "everyone" } }], changed: 1, revision: 5 });
    expect(record).not.toHaveProperty("audience");
  });
  it("is idempotent and preserves restrictions saved concurrently before migration", () => {
    const contacts = [{ id: "contact-a", audience: { type: "specialists" } },
      { id: "contact-b", audience: { type: "group", groupId: "group-a" } },
      { id: "contact-c", audience: { type: "everyone" } }];
    expect(planContactAudienceMigration({ contacts, revision: 7 })).toEqual({ contacts, changed: 0, revision: 7 });
    const first = planContactAudienceMigration({ contacts: [{ id: "legacy" }] });
    expect(planContactAudienceMigration(first)).toMatchObject({ changed: 0, revision: 1 });
  });
  it.each([{}, { contacts: null }, { contacts: [null] }, { contacts: [{ id: "a", audience: null }] },
    { contacts: [{ id: "a", audience: { type: "unknown" } }] }, { contacts: [], revision: -1 }])(
    "rejects malformed records without turning restrictions public", data => {
      expect(() => planContactAudienceMigration(data)).toThrow();
    },
  );
});

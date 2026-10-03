import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { anniversaryRadarHref, anniversaryRadarTarget, findAnniversaryRadarTarget } from "./anniversaryRadarLink";

describe("anniversary radar navigation", () => {
  it("uses the normalized owner and full entry ID without exposing either in the URL", async () => {
    const target = await anniversaryRadarTarget(" Advisor@Example.Test ", "contract-1");
    expect(target).toBe(createHash("sha256").update(JSON.stringify(["advisor@example.test", "contract-1"])).digest("hex"));
    expect(await anniversaryRadarHref("advisor@example.test", "contract-1")).toBe(`/pomucky/radar-vyroci?contract=${target}`);
  });

  it("distinguishes identical entry IDs belonging to two owners", async () => {
    const own = { ownerEmail: "advisor@example.test", entryId: "same-id" };
    const team = { ownerEmail: "team@example.test", entryId: "same-id" };
    const target = await anniversaryRadarTarget(team.ownerEmail, team.entryId);
    expect(target).not.toBe(await anniversaryRadarTarget(own.ownerEmail, own.entryId));
    expect(await findAnniversaryRadarTarget(target.toUpperCase(), [own, team])).toBe(team);
    expect(await findAnniversaryRadarTarget(target, [own])).toBeNull();
  });

  it.each(["", "../contract", "a".repeat(63), "g".repeat(64), "a".repeat(65)])("rejects malformed target %j", async target => {
    expect(await findAnniversaryRadarTarget(target, [{ ownerEmail: "advisor@example.test", entryId: "same-id" }])).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { DirectoryContact } from "@/app/lib/contactDirectory";
import { createContactSearchSession } from "./contactSearchSession";

const contact = (id: string): DirectoryContact => ({
  id, institutionKey: "allianz", emails: [{ value: "synthetic@example.test" }],
});

describe("authorized contact search session", () => {
  it("shares one authorized request across queries in the same open session", async () => {
    const session = createContactSearchSession();
    const fetchContacts = vi.fn(async () => [contact("allowed")]);
    expect(await session.load("user-a", fetchContacts)).toEqual([contact("allowed")]);
    expect(await session.load("user-a", fetchContacts)).toEqual([contact("allowed")]);
    expect(fetchContacts).toHaveBeenCalledOnce();
  });

  it("never reuses another account's cached contacts", async () => {
    const session = createContactSearchSession();
    await session.load("user-a", async () => [contact("private-a")]);
    const loadB = vi.fn(async () => [contact("allowed-b")]);
    expect(await session.load("user-b", loadB)).toEqual([contact("allowed-b")]);
    expect(loadB).toHaveBeenCalledOnce();
  });

  it("discards an account A response arriving after account B started loading", async () => {
    const session = createContactSearchSession();
    let finishA!: (contacts: DirectoryContact[]) => void;
    const pendingA = session.load("user-a", () => new Promise(resolve => { finishA = resolve; }));
    const contactsB = [contact("allowed-b")];
    await session.load("user-b", async () => contactsB);
    finishA([contact("private-a")]);
    expect(await pendingA).toEqual([]);
    expect(await session.load("user-b", async () => [])).toEqual(contactsB);
  });

  it("refetches after reopening or invalidation and ignores an older in-flight response", async () => {
    const session = createContactSearchSession();
    let finishOld!: (contacts: DirectoryContact[]) => void;
    const pending = session.load("user-a", () => new Promise(resolve => { finishOld = resolve; }));
    session.invalidate();
    expect(await session.load("user-a", async () => [])).toEqual([]);
    finishOld([contact("revoked")]);
    expect(await pending).toEqual([]);
    const shouldNotFetch = vi.fn(async () => [contact("revoked")]);
    expect(await session.load("user-a", shouldNotFetch)).toEqual([]);
    expect(shouldNotFetch).not.toHaveBeenCalled();
  });

  it("retries failed reads instead of caching an unavailable directory", async () => {
    const session = createContactSearchSession();
    await expect(session.load("user-a", async () => { throw new Error("unavailable"); }))
      .rejects.toThrow("unavailable");
    expect(await session.load("user-a", async () => [contact("recovered")]))
      .toEqual([contact("recovered")]);
  });
});

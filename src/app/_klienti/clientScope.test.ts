import { describe, expect, it } from "vitest";
import { buildClientDirectory, filterClientDirectory } from "./clientDirectory";
import { clientScopeQuery, readClientScope, selectClientContracts } from "./clientScope";
import type { ClientAdviser, ClientContractItem } from "./clientCardHelpers";

const owner = "owner@example.test";
const advisers: ClientAdviser[] = [{ email: "jana@example.test", name: "Jana Bílá" }, { email: "pavel@example.test", name: "Pavel Černý" }];
const contract = (id: string, clientName: string, adviserEmail: string, extra: Partial<ClientContractItem> = {}): ClientContractItem => ({ id, clientName, adviserEmail, ...extra });
const contracts = [
  contract("own", "Petr Novák", owner, { status: "storno", contractNumber: "MY-123" }),
  contract("shared", "Bc. Petr Novák", advisers[0].email, { status: "active", contractNumber: "TEAM-123" }),
  contract("team-only", "Lucie Nová", advisers[0].email),
  contract("other-adviser", "Tomáš Malý", advisers[1].email),
];

describe("client ownership filters", () => {
  it("defaults to own clients and never includes a team-only client", () => {
    const selection = readClientScope(new URLSearchParams());
    expect(selection).toEqual({ scope: "my", advisers: [] });
    const own = buildClientDirectory(selectClientContracts(contracts, owner.toUpperCase(), selection, advisers));
    expect(own.map((client) => client.name)).toEqual(["Petr Novák"]);
    expect(own[0]).toMatchObject({ activeCount: 0, archivedCount: 1 });
    expect(own[0].contracts.map((contract) => contract.id)).toEqual(["own"]);
    expect(filterClientDirectory(own, "TEAM-123", "all", "name")).toEqual([]);
  });
  it("shows all team members or only one or more selected advisers", () => {
    expect(selectClientContracts(contracts, owner, { scope: "team", advisers: [] }, advisers).map((contract) => contract.id)).toEqual(["shared", "team-only", "other-adviser"]);
    expect(selectClientContracts(contracts, owner, { scope: "team", advisers: [advisers[0].email] }, advisers).map((contract) => contract.id)).toEqual(["shared", "team-only"]);
    expect(selectClientContracts(contracts, owner, { scope: "team", advisers: advisers.map((adviser) => adviser.email) }, advisers)).toHaveLength(3);
  });
  it("does not broaden an invalid adviser selection to everybody", () => {
    expect(selectClientContracts(contracts, owner, { scope: "team", advisers: ["outside@example.test", owner] }, advisers)).toEqual([]);
    expect(selectClientContracts(contracts, owner, { scope: "team", advisers: [] }, [])).toEqual([]);
  });
  it("uses the original adviser after transfer and excludes inherited contracts with no known author", () => {
    const transfers = [
      contract("inherited", "Klient týmu", owner, { originalAdviserEmail: advisers[0].email, acquisitionType: "inherited" }),
      contract("unknown", "Neznámý původ", owner, { acquisitionType: "inherited", originalAdviserEmail: "" }),
      contract("transferred-away", "Můj klient", advisers[0].email, { originalAdviserEmail: owner }),
    ];
    expect(selectClientContracts(transfers, owner, { scope: "my", advisers: [] }, advisers).map((contract) => contract.id)).toEqual(["transferred-away"]);
    expect(selectClientContracts(transfers, owner, { scope: "team", advisers: [advisers[0].email] }, advisers).map((contract) => contract.id)).toEqual(["inherited"]);
  });
  it("does not count an endorsement as a personally concluded policy", () => {
    const items = [contract("base", "Klient týmu", advisers[0].email), contract("addendum", "Klient týmu", owner, { entryType: "endorsement" })];
    expect(buildClientDirectory(selectClientContracts(items, owner, { scope: "my", advisers: [] }, advisers))).toEqual([]);
  });
  it("retains the chosen team and advisers in detail and return links", () => {
    const selection = { scope: "team" as const, advisers: [advisers[0].email, advisers[1].email] };
    expect(readClientScope(new URLSearchParams(clientScopeQuery(selection)))).toEqual(selection);
    expect(readClientScope(new URLSearchParams("scope=all&advisers=outside@example.test"))).toEqual({ scope: "my", advisers: [] });
    expect(readClientScope(new URLSearchParams("scope=team&advisers=JANA%40EXAMPLE.TEST,jana%40example.test"))).toEqual({ scope: "team", advisers: [advisers[0].email] });
  });
});

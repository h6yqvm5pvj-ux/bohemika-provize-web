import { describe, expect, it } from "vitest";
import { buildClientDirectory, filterClientDirectory } from "./clientDirectory";
import { clientIdentityKey, clientSlugForName, isClientCardSlug } from "./clientIdentity";
import { bestClientAddress, type ClientContractItem } from "./clientCardHelpers";

const contract = (id: string, clientName = "Petr Novák", extra: Partial<ClientContractItem> = {}): ClientContractItem => ({ id, clientName, adviserEmail: "owner@example.test", productKey: "neon", ...extra });

describe("client identity", () => {
  it.each(["Bc. Petr Novák", "  Bc.Petr   Novák  ", "Ing. arch. Petr Novák", "prof. Ing. Petr Novák, Ph.D., MBA", "Petr Novák, DiS.", "PETR NOVÁK", "Petr Novák"])("groups %s with the same untitled identity", (name) => {
    expect(clientSlugForName(name)).toBe(clientSlugForName("Petr Novák"));
  });
  it.each(["Petr Novak", "Novák Petr", "Petr Novotný", "Petr Novák-Svoboda", "Petr Novák Svoboda", "Petr Novák s.r.o."])("does not automatically merge %s", (name) => {
    expect(clientSlugForName(name)).not.toBe(clientSlugForName("Petr Novák"));
  });
  it("preserves company names, short personal names and distinct diacritics", () => {
    expect(clientIdentityKey("Ing. Novák, s.r.o.")).toBe("ing. novák, s.r.o.");
    expect(clientIdentityKey("Ma Lin")).toBe("ma lin");
    expect(clientIdentityKey("Jan Ma")).toBe("jan ma");
    expect(clientSlugForName("Petr Buček")).not.toBe(clientSlugForName("Petr Bůček"));
    expect(clientSlugForName("Jan Novák-Svoboda")).not.toBe(clientSlugForName("Jan Novák Svoboda"));
  });
  it("preserves the existing saved pilot card and rejects invalid IDs", () => {
    expect(clientSlugForName("Bc. Martin Březina")).toBe("martin-brezina");
    expect(isClientCardSlug("martin-brezina")).toBe(true);
    expect(isClientCardSlug(clientSlugForName("Petr Novák")!)).toBe(true);
    expect(isClientCardSlug(clientSlugForName("李 小龍")!)).toBe(true);
    for (const slug of ["", "other-client", "../cards", "c-ff", "c-00", "c-20", "c-0", "c-" + "61".repeat(201)]) expect(isClientCardSlug(slug)).toBe(false);
    expect(clientSlugForName(" ")).toBeNull();
  });
});

describe("contract-derived directory", () => {
  it("combines titled variants and retains original names, counting only contracts", () => {
    const items = [contract("a", "Bc. Petr Novák"), contract("b", "Petr Novák", { status: "storno" }), contract("a", "Bc. Petr Novák"), contract("c", "Petr Novák", { entryType: "endorsement" }), contract("d", " ")];
    const clients = buildClientDirectory(items);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ name: "Petr Novák", activeCount: 1, archivedCount: 1, aliases: ["Bc. Petr Novák", "Petr Novák"] });
    expect(items[0].clientName).toBe("Bc. Petr Novák");
  });
  it("keeps two distinct contracts with the same document ID in separate owner namespaces", () => {
    expect(buildClientDirectory([contract("a"), contract("a", "Bc. Petr Novák", { adviserEmail: "team@example.test" })])[0].contracts).toHaveLength(2);
  });
  it("normalizes phone formatting, detects conflicting contacts, and does not guess the correct value", () => {
    const clients = buildClientDirectory([
      contract("a", undefined, { clientPhone: "+420 777 123 456", clientEmail: "petr@example.test", clientAddress: "Praha 1" }),
      contract("b", "Bc. Petr Novák", { clientPhone: "777123456", clientEmail: "different@example.test", clientAddress: "Brno 2" }),
    ]);
    expect(clients[0]).toMatchObject({ phone: "+420 777 123 456", email: "", address: "", contactConflicts: ["e-mail", "adresa"] });
    expect(filterClientDirectory(clients, "", "review", "name")).toHaveLength(1);
  });
  it("does not turn an insured property's address into a permanent address", () => {
    const items = [contract("a", undefined, { domexDetail: { address: "Pojištěná chata 123" } })];
    expect(buildClientDirectory(items)[0].address).toBe("");
    expect(bestClientAddress(items)).toBe("");
  });
  it("reflects saved names and intentionally cleared contacts without changing identity or losing contract searches", () => {
    const clients = buildClientDirectory([contract("a", undefined, { clientEmail: "old@example.test" })], [{ slug: clientSlugForName("Petr Novák")!, clientName: "Ing. Petr Novák", phone: "777 999 888", email: "", permanentAddress: "Brno" }]);
    expect(clients[0]).toMatchObject({ name: "Ing. Petr Novák", phone: "777 999 888", email: "", address: "Brno" });
    expect(filterClientDirectory(clients, "old@example.test", "all", "name")).toHaveLength(1);
  });
  it("searches without accents, across word order, phone spacing and contract numbers", () => {
    const clients = buildClientDirectory([contract("a", "Bc. Petr Novák", { clientPhone: "+420 777 123 456", contractNumber: "123 / 456", clientEmail: "petr@example.test" }), contract("b", "Jana Bílá", { status: "storno" })]);
    for (const query of ["novak petr", "Bc.", "777123456", "777 123456", "123456", "petr@example"]) expect(filterClientDirectory(clients, query, "all", "name").map((c) => c.name)).toEqual(["Petr Novák"]);
    expect(filterClientDirectory(clients, "", "active", "name").map((c) => c.name)).toEqual(["Petr Novák"]);
    expect(filterClientDirectory(clients, "", "archived", "name").map((c) => c.name)).toEqual(["Jana Bílá"]);
    expect(filterClientDirectory(clients, "neexistuje", "all", "name")).toEqual([]);
  });
});

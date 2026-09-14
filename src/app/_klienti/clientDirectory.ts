import type { ClientCardDraft } from "./clientCardData";
import { clientIdentityKey, clientNameWithoutTitles, clientSlugForName, isClientCardSlug, normalizeClientSearch } from "./clientIdentity";
import { clientContractProductLabel, contractOwnerEmail, splitClientContracts, toDate, uniqueContracts, type ClientContractItem } from "./clientCardHelpers";

export type ClientCardSummary = Pick<ClientCardDraft, "clientName" | "phone" | "email" | "permanentAddress"> & { slug: string };
export type ClientDirectoryItem = {
  slug: string;
  name: string;
  initials: string;
  aliases: string[];
  contracts: ClientContractItem[];
  activeCount: number;
  archivedCount: number;
  phone: string;
  email: string;
  address: string;
  contactConflicts: string[];
  products: string[];
  ownerEmails: string[];
  latestActivity: number;
  searchText: string;
};

const phoneKey = (value: string) => value.replace(/\D/g, "").replace(/^(?:00420|420)(?=\d{9}$)/, "");
const contactValues = (contracts: ClientContractItem[], field: "clientPhone" | "clientEmail" | "clientAddress") => {
  const values = new Map<string, string>();
  for (const contract of contracts) {
    const value = contract[field]?.trim();
    if (!value) continue;
    const key = field === "clientPhone" ? phoneKey(value) : value.toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ");
    if (!values.has(key)) values.set(key, value);
  }
  return [...values.values()];
};

export function buildClientDirectory(contracts: ClientContractItem[], cards: ClientCardSummary[] = []): ClientDirectoryItem[] {
  const grouped = new Map<string, ClientContractItem[]>();
  for (const contract of uniqueContracts(contracts)) {
    // Endorsements belong to their original contract, not a second policy.
    if (contract.entryType === "endorsement") continue;
    const slug = contract.clientSlug && isClientCardSlug(contract.clientSlug) ? contract.clientSlug : clientSlugForName(contract.clientName);
    if (!slug) continue;
    const group = grouped.get(slug) ?? [];
    group.push(contract);
    grouped.set(slug, group);
  }
  const savedBySlug = new Map(cards.map((card) => [card.slug, card]));
  return [...grouped].map(([slug, items]) => {
    const dateOf = (contract: ClientContractItem) => toDate(contract.contractSignedDate ?? contract.createdAt)?.getTime() ?? 0;
    items.sort((a, b) => dateOf(b) - dateOf(a) || a.id.localeCompare(b.id));
    const aliases = [...new Set(items.map((item) => item.clientName!.trim().replace(/\s+/g, " ")))];
    const saved = savedBySlug.get(slug);
    const name = saved?.clientName || clientNameWithoutTitles(aliases[0]);
    const phones = contactValues(items, "clientPhone");
    const emails = contactValues(items, "clientEmail");
    const addresses = contactValues(items, "clientAddress");
    const split = splitClientContracts(items);
    const products = [...new Set(items.map(clientContractProductLabel))];
    const phone = saved ? saved.phone : phones.length === 1 ? phones[0] : "";
    const email = saved ? saved.email : emails.length === 1 ? emails[0] : "";
    const address = saved ? saved.permanentAddress : addresses.length === 1 ? addresses[0] : "";
    return {
      slug, name, aliases, contracts: items,
      initials: clientNameWithoutTitles(name).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("cs-CZ"),
      activeCount: split.active.length, archivedCount: split.archived.length,
      phone, email, address,
      contactConflicts: [phones.length > 1 ? "telefon" : "", emails.length > 1 ? "e-mail" : "", addresses.length > 1 ? "adresa" : ""].filter(Boolean),
      products,
      ownerEmails: [...new Set(items.map(contractOwnerEmail))],
      latestActivity: dateOf(items[0]),
      searchText: normalizeClientSearch([name, ...aliases, phone, email, address, ...phones, ...emails, ...addresses, ...products, ...items.map((item) => item.contractNumber ?? "")].join(" ")),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "cs-CZ") || a.slug.localeCompare(b.slug));
}

export type ClientFilter = "all" | "active" | "archived" | "missing-contact" | "review";
export type ClientSort = "name" | "contracts" | "recent";

export function filterClientDirectory(clients: ClientDirectoryItem[], query: string, filter: ClientFilter, sort: ClientSort): ClientDirectoryItem[] {
  const words = normalizeClientSearch(query).split(/\s+/).filter(Boolean);
  const numberQuery = query.replace(/[\s()+./-]/g, "");
  return clients.filter((client) => {
    const matchesText = words.every((word) => client.searchText.includes(word));
    const matchesNumber = /^\d{3,}$/.test(numberQuery) && (
      client.contracts.some((item) => [item.clientPhone, item.contractNumber].some((value) => value?.replace(/[\s()+./-]/g, "").includes(numberQuery))) ||
      client.phone.replace(/[\s()+./-]/g, "").includes(numberQuery)
    );
    if (!matchesText && !matchesNumber) return false;
    if (filter === "active") return client.activeCount > 0;
    if (filter === "archived") return client.activeCount === 0;
    if (filter === "missing-contact") return !client.phone || !client.email;
    if (filter === "review") return client.contactConflicts.length > 0;
    return true;
  }).sort((a, b) => (
    sort === "contracts" ? b.contracts.length - a.contracts.length : sort === "recent" ? b.latestActivity - a.latestActivity : 0
  ) || a.name.localeCompare(b.name, "cs-CZ") || clientIdentityKey(a.name).localeCompare(clientIdentityKey(b.name)));
}

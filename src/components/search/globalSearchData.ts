import {
  CONTACT_INSTITUTION_BY_KEY,
  type DirectoryContact,
} from "@/app/lib/contactDirectory";
import {
  TOOL_CATALOG,
  toolMatchesSearchQuery,
  type ToolCatalogEntry,
} from "@/app/pomucky/toolCatalog";

export type ContactSearchResult = DirectoryContact & {
  institutionLabel: string;
  title: string;
  subtitle: string;
};

export const normalizeGlobalSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .trim();

const matchesEveryTerm = (haystack: string, normalizedQuery: string): boolean => {
  const normalizedHaystack = normalizeGlobalSearch(haystack);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => normalizedHaystack.includes(term));
};

const contactSearchText = (
  contact: DirectoryContact,
  institutionLabel: string,
): string =>
  [
    institutionLabel,
    contact.person,
    contact.role,
    contact.description,
    contact.phone?.display,
    contact.notice,
    ...(contact.emails ?? []).flatMap((email) => [email.label, email.value]),
  ]
    .filter(Boolean)
    .join(" ");

export function findContactSearchResults(
  contacts: DirectoryContact[],
  query: string,
  limit = 6,
): ContactSearchResult[] {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (normalizedQuery.length < 2) return [];

  return contacts
    .flatMap((contact) => {
      const institution = CONTACT_INSTITUTION_BY_KEY.get(contact.institutionKey);
      if (!institution) return [];
      if (!matchesEveryTerm(contactSearchText(contact, institution.label), normalizedQuery)) {
        return [];
      }

      const title =
        contact.person ?? contact.description ?? contact.role ?? institution.label;
      const detail =
        contact.person && contact.description
          ? contact.description
          : contact.role && title !== contact.role
            ? contact.role
            : null;

      return [
        {
          ...contact,
          institutionLabel: institution.label,
          title,
          subtitle: detail ? `${institution.label} · ${detail}` : institution.label,
        },
      ];
    })
    .slice(0, limit);
}

export function findToolSearchResults(
  query: string,
  limit = 8,
): ToolCatalogEntry[] {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (normalizedQuery.length < 2) return [];

  return TOOL_CATALOG.filter((tool) =>
    toolMatchesSearchQuery(tool, normalizedQuery),
  ).slice(0, limit);
}

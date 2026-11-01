import { clientCompanySearchParts } from "./clientNamePresentation";

export const normalizeContractSearchText = (value?: string | null): string =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");

export const compactContractSearchNumber = (value?: string | null): string =>
  normalizeContractSearchText(value).replace(/[^a-z0-9]/g, "");

export function prepareContractSearch(query?: string | null) {
  const text = normalizeContractSearchText(query);
  const parsed = clientCompanySearchParts(text);
  // Words such as obec/město also occur in ordinary address searches. Only
  // legal-form abbreviations need the stricter alias-aware name comparison.
  const company = parsed && /^(?:sro|as|zs|vos|ks|ops|sp|spol)$/.test(parsed.form) ? parsed : null;
  return { text, words: text ? [...new Set(text.split(" "))] : [], number: text.replace(/[^a-z0-9]/g, ""), company };
}

export type PreparedContractSearch = ReturnType<typeof prepareContractSearch>;

/** All name fragments must match the same client; their order does not matter. */
export const matchesContractClientName = (normalizedName: string, query: PreparedContractSearch): boolean => {
  if (!query.company) return query.words.every(word => normalizedName.includes(word));
  const company = clientCompanySearchParts(normalizedName);
  if (!company || company.form !== query.company.form || query.company.words.length === 0) return false;
  // Consume separate business words so a repeated word cannot match one word twice.
  const assigned = new Map<number, number>();
  const assign = (queryIndex: number, visited: Set<number>): boolean => {
    for (let index = 0; index < company.words.length; index += 1) {
      if (visited.has(index) || !company.words[index].includes(query.company!.words[queryIndex])) continue;
      visited.add(index);
      const previous = assigned.get(index);
      if (previous === undefined || assign(previous, visited)) {
        assigned.set(index, queryIndex);
        return true;
      }
    }
    return false;
  };
  return query.company.words.every((_, index) => assign(index, new Set()));
};

export function matchesContractSearch(
  contract: { clientName?: string | null; contractNumber?: string | null },
  query: PreparedContractSearch,
): boolean {
  if (!query.text) return true;
  if (matchesContractClientName(normalizeContractSearchText(contract.clientName), query)) return true;
  const number = normalizeContractSearchText(contract.contractNumber);
  return number.includes(query.text) ||
    (query.number.length > 0 && number.replace(/[^a-z0-9]/g, "").includes(query.number));
}

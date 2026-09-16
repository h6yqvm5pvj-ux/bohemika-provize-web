export const normalizeContractSearchText = (value?: string | null): string =>
  (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");

export const compactContractSearchNumber = (value?: string | null): string =>
  normalizeContractSearchText(value).replace(/[^a-z0-9]/g, "");

export function prepareContractSearch(query?: string | null) {
  const text = normalizeContractSearchText(query);
  return { text, words: text ? [...new Set(text.split(" "))] : [], number: text.replace(/[^a-z0-9]/g, "") };
}

export type PreparedContractSearch = ReturnType<typeof prepareContractSearch>;

/** All name fragments must match the same client; their order does not matter. */
export const matchesContractClientName = (normalizedName: string, query: PreparedContractSearch): boolean =>
  query.words.every(word => normalizedName.includes(word));

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

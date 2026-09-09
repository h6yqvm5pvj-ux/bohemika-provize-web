export type ClientNameMatchKind = "exact" | "normalized" | "reordered" | "prefix" | "similar";
export type ClientNameMatch = { name: string; kind: ClientNameMatchKind };

export const CLIENT_NAME_MATCH_LABELS: Record<ClientNameMatchKind, string> = {
  exact: "Přesná shoda",
  normalized: "Jiný zápis jména",
  reordered: "Jiné pořadí jména",
  prefix: "Částečná shoda",
  similar: "Možný překlep",
};

// Preserve accents here: Buček and Bůček must not collapse into one exact match.
export const clientNameExactKey = (name: string): string =>
  name.normalize("NFC").trim().toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ");

const titles = new Set(["ing", "mgr", "bc", "bca", "mudr", "judr", "rndr", "mvdr", "phdr", "pharmdr", "doc", "prof", "phd", "csc", "dis", "mba"]);
const fold = (name: string) => clientNameExactKey(name).normalize("NFD").replace(/\p{M}/gu, "");
const words = (name: string) => fold(name).replace(/\bph\s*\.\s*d\.?/g, "phd").match(/[\p{L}\p{N}]+/gu) ?? [];
const isCompany = (tokens: string[]) =>
  /(?:^| )(?:s r o|a s|z s|o p s|sro|as|zs|ops|spol|druzstvo|nadace|ustav|obec|urad)(?: |$)/.test(tokens.join(" "));

function nameParts(name: string) {
  const rawTokens = words(name);
  const company = isCompany(rawTokens);
  const tokens = company ? rawTokens : rawTokens.filter((token) => !titles.has(token));
  return { name: name.trim().replace(/\s+/g, " "), exactKey: clientNameExactKey(name), tokens, company };
}

export function createClientNameIndex(names: readonly string[]) {
  const unique = new Map<string, ReturnType<typeof nameParts>>();
  for (const name of names) {
    const entry = nameParts(name);
    if (entry.exactKey && entry.tokens.length && !unique.has(entry.exactKey)) unique.set(entry.exactKey, entry);
  }
  return [...unique.values()];
}

// Match each query word to a distinct word, so "Jan Jan" cannot match "Jan Novák".
function distinctTokenMatch(query: string[], candidate: string[], accepts: (left: string, right: string) => boolean): boolean {
  if (query.length > candidate.length) return false;
  const assigned = new Map<number, number>();
  const assign = (queryIndex: number, visited: Set<number>): boolean => {
    for (let i = 0; i < candidate.length; i += 1) {
      if (visited.has(i) || !accepts(query[queryIndex], candidate[i])) continue;
      visited.add(i);
      const previous = assigned.get(i);
      if (previous === undefined || assign(previous, visited)) {
        assigned.set(i, queryIndex);
        return true;
      }
    }
    return false;
  };
  return query.every((_, index) => assign(index, new Set()));
}

function singleTypo(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4 || Math.abs(left.length - right.length) > 1) return false;
  let index = 0;
  while (left[index] === right[index] && index < Math.min(left.length, right.length)) index += 1;
  if (left.length === right.length) {
    return left.slice(index + 1) === right.slice(index + 1) || (
      left[index] === right[index + 1] && left[index + 1] === right[index] &&
      left.slice(index + 2) === right.slice(index + 2)
    );
  }
  return left.length > right.length
    ? left.slice(index + 1) === right.slice(index)
    : left.slice(index) === right.slice(index + 1);
}

function matchKind(query: ReturnType<typeof nameParts>, candidate: ReturnType<typeof nameParts>): ClientNameMatchKind | null {
  if (query.exactKey === candidate.exactKey) return "exact";
  const q = query.tokens;
  const c = candidate.tokens;
  if (q.join(" ") === c.join(" ")) return "normalized";
  const sameWords = q.length === c.length && [...q].sort().join(" ") === [...c].sort().join(" ");
  if (!query.company && !candidate.company && q.length >= 2 && sameWords) return "reordered";
  if (query.company !== candidate.company && (query.company || q.length >= 2)) return null;

  if (query.company || candidate.company) {
    // Company word order matters; do not apply person-name typo/reordering rules.
    return q.every((token, index) => c[index]?.startsWith(token)) ? "prefix" : null;
  }
  if (distinctTokenMatch(q, c, (left, right) => left === right || (left.length >= 2 && right.startsWith(left)))) return "prefix";
  if (q.length < 2 || q.length !== c.length) return null;
  const remaining = [...c];
  const unmatched = q.filter((token) => {
    const index = remaining.indexOf(token);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
  // Only one typo in the whole name; at least one other complete word must agree.
  return unmatched.length === 1 && singleTypo(unmatched[0], remaining[0]) ? "similar" : null;
}

export function matchClientName(queryText: string, index: ReturnType<typeof createClientNameIndex>, limit = 6): ClientNameMatch[] {
  const query = nameParts(queryText);
  if (query.exactKey.length < 2 || query.tokens.length === 0) return [];
  const priority: Record<ClientNameMatchKind, number> = { exact: 0, normalized: 1, reordered: 2, prefix: 3, similar: 4 };
  const matches = index.flatMap((candidate) => {
    const kind = matchKind(query, candidate);
    return kind ? [{ name: candidate.name, kind }] : [];
  }).sort((left, right) => priority[left.kind] - priority[right.kind] || left.name.localeCompare(right.name, "cs-CZ"));
  // A full-name match should not be diluted by unrelated partial/fuzzy suggestions.
  const fullMatches = matches.filter((match) => priority[match.kind] <= 2);
  const exactMatches = fullMatches.filter((match) => match.kind === "exact");
  return (exactMatches.length ? exactMatches : fullMatches.length ? fullMatches : matches).slice(0, limit);
}

import type { Product } from "../types/domain";

type ContractNumberPattern = {
  digits: number;
  prefixes: readonly string[];
  originalPrefixes?: readonly string[];
};

// Empirical review hints, not insurer validation rules. Rules require at least
// 10 distinct observed numbers and a consistent length/series. Use broad series
// for evolving ranges; do not turn isolated outliers into accepted prefixes.
// Evidence and deliberately unsupported products: docs/contract-number-review.md.
export const productContractNumberPatterns: Partial<Record<Product, ContractNumberPattern>> = {
  cppAuto: { digits: 10, prefixes: ["32", "31", "37", "38"] },
  neon: { digits: 10, prefixes: ["750"] },
  flexi: { digits: 10, prefixes: ["14"], originalPrefixes: ["14", "48"] },
  domex: { digits: 10, prefixes: ["00"] },
  cppsimplex: { digits: 10, prefixes: ["00"] },
  zamex: { digits: 10, prefixes: ["00"] },
  kooperativaAuto: { digits: 10, prefixes: ["63", "64"] },
  allianzAuto: { digits: 9, prefixes: ["7", "8"] },
  csobAuto: { digits: 10, prefixes: ["37", "61", "62"] },
  uniqaAuto: { digits: 10, prefixes: ["55"] },
  slaviaauto: { digits: 10, prefixes: ["37"] },
  koopodzam: { digits: 10, prefixes: ["395"] },
  cppcestovko: { digits: 10, prefixes: ["18"] },
  axacestovko: { digits: 10, prefixes: ["94"] },
  koopcestovko: { digits: 10, prefixes: ["505"] },
};

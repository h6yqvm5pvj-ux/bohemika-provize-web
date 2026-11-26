import { PROGRESSION_LABELS } from "./progressionOptions";

type ProductMetadata = { insurer: string; badges: string[]; filterYears?: string[] };

const products = {
  "cpp-10x": { insurer: "ČPP Životní pojištění NEON 2023–2026", badges: [PROGRESSION_LABELS["10x"]] },
  "cpp-5x": { insurer: "ČPP Životní pojištění NEON 2023–2026", badges: [PROGRESSION_LABELS["5x"]] },
  "cpp-neon-top-2022-06": { insurer: "ČPP Životní pojištění NEON", badges: ["2019–01.06.2022", PROGRESSION_LABELS["top5x"]] },
  "cpp-evoluce-top-5x": { insurer: "ČPP Evoluce", badges: ["16.07.2015–2016", PROGRESSION_LABELS["top5x"]] },
  "cpp-evoluce-plus-2020-top-5x": { insurer: "ČPP Evoluce PLUS", badges: ["2016–2020", PROGRESSION_LABELS["top5x"]] },
  "cpp-evoluce-5x": { insurer: "ČPP Evoluce", badges: ["16.07.2015–2016", PROGRESSION_LABELS["5x"]] },
  "cpp-evoluce-2015-5x": { insurer: "ČPP Evoluce", badges: ["01.01.2014–01.01.2015", PROGRESSION_LABELS["5x"]] },
  "uniqa-domino": { insurer: "UNIQA Domino", badges: [PROGRESSION_LABELS["10x"]] },
  "uniqa-logika-2019": { insurer: "UNIQA Logika 2019", badges: [PROGRESSION_LABELS["4x"]] },
  "uniqa-logika-2019-6x": { insurer: "UNIQA Logika 2019", badges: [PROGRESSION_LABELS["6x"]] },
  "uniqa-logika-2019-10x": { insurer: "UNIQA Logika 2019", badges: [PROGRESSION_LABELS["10x"]] },
  "uniqa-logika-2020-10x": { insurer: "UNIQA Logika 2020", badges: [PROGRESSION_LABELS["10x"]] },
  "uniqa-activelife-2019-324-324u": { insurer: "UNIQA ActiveLife 2019", badges: ["Tarify 324/324U", PROGRESSION_LABELS["5x"]] },
  "uniqa-activelife-2019-325-325u": { insurer: "UNIQA ActiveLife 2019", badges: ["Tarify 325/325U", PROGRESSION_LABELS["5x"]] },
  "uniqa-symfonie-2021-324-324u": { insurer: "UNIQA Symfonie 2021", badges: ["Tarify 324 a 324U", PROGRESSION_LABELS["5x"]] },
  "axa-active-life-2016-2021-324-324u": { insurer: "AXA Active Life 2016-2021", badges: ["Tarify 324/324U", PROGRESSION_LABELS["5x"]] },
  "axa-active-life-2016-2021-325-325u": { insurer: "AXA Active Life 2016-2021", badges: ["Tarify 325/325U", PROGRESSION_LABELS["5x"]] },
  "uniqa-zivot-radost": { insurer: "UNIQA Život & radost 2026", badges: [PROGRESSION_LABELS["10x"]] },
  "koop-flexi": { insurer: "Kooperativa Životní pojištění FLEXI 2026", badges: [PROGRESSION_LABELS["10x"]] },
  "koop-flexi-4x": { insurer: "Kooperativa Životní pojištění FLEXI 2026", badges: [PROGRESSION_LABELS["4x"]] },
  "koop-na-prani-tn4": { insurer: "Kooperativa NA PŘÁNÍ", badges: [PROGRESSION_LABELS["4x"]] },
  "koop-na-prani-tn8": { insurer: "Kooperativa NA PŘÁNÍ", badges: [PROGRESSION_LABELS["8x"]] },
  "metlife-oneguard": { insurer: "MetLife OneGuard", badges: [PROGRESSION_LABELS["10x"]] },
  "metlife-garde5": { insurer: "MetLife Garde 5.0", badges: ["2018", PROGRESSION_LABELS["10x"]] },
  "metlife-garde6": { insurer: "MetLife Garde 6.0", badges: ["2021–2024", PROGRESSION_LABELS["10x"]] },
  "csob-nas-zivot": { insurer: "ČSOB Náš Život", badges: [PROGRESSION_LABELS["8x"]] },
  "csob-forte": { insurer: "ČSOB Forte 2016-2019", badges: [PROGRESSION_LABELS["6x"]] },
  "kb-elan-2025-10": { insurer: "KB Elán", badges: ["15.10.2025", PROGRESSION_LABELS["8x"]] },
  "generali-muj-zivot-2026": { insurer: "Generali Můj Život 2 2026", badges: [PROGRESSION_LABELS["10x"]] },
  "generali-muj-zivot": { insurer: "Generali Můj Život 2 2024", badges: [PROGRESSION_LABELS["10x"]] },
  "generali-bel-mondo-20-2026": { insurer: "Generali Bel Mondo 20 2026", badges: [PROGRESSION_LABELS["10x"]] },
  "generali-bel-mondo-20-2023-2024": { insurer: "Generali Bel Mondo 20 2023-2024", badges: [PROGRESSION_LABELS["10x"]] },
  "generali-bel-mondo-20-2020-2022": { insurer: "Generali Bel Mondo 20 2020-2022", badges: [PROGRESSION_LABELS["8x"]] },
  "generali-allegro-20-2023-2024": { insurer: "Generali Allegro 20 2023-2024", badges: [PROGRESSION_LABELS["10x"]] },
  "generali-allegro-20-2020-2022": { insurer: "Generali Allegro 20 2020-2022", badges: [PROGRESSION_LABELS["8x"]] },
  "nn-orange": { insurer: "NN Orange RISK", badges: ["2023–18.03.2025", PROGRESSION_LABELS["5x"]] },
  "nn-orange-2025-09": { insurer: "NN Orange RISK", badges: ["02.09.2025–2026", PROGRESSION_LABELS["5x"]] },
  "nn-orange-10x": { insurer: "NN Orange RISK", badges: ["02.09.2025–2026", PROGRESSION_LABELS["10x"]] },
  "nn-orange-10x-2025-03": { insurer: "NN Orange RISK", badges: ["2023–18.03.2025", PROGRESSION_LABELS["10x"]] },
  "nn-zivot-2019-06": { insurer: "NN Život 6/2019", badges: [PROGRESSION_LABELS["8x"]] },
  "you-plus-4u-2025": { insurer: "YOU PLUS 4U 2021-2025", badges: [PROGRESSION_LABELS["8.5x"]] },
  "you-plus-4u-2025-t3k": { insurer: "YOU PLUS 4U 2021-2025", badges: [PROGRESSION_LABELS["10x"]] },
  "you-plus-4u-2020": { insurer: "YOU PLUS 4U 2020", badges: [PROGRESSION_LABELS["6x"]] },
  "maxima-maxefekt": { insurer: "Maxima MAXEFEKT 6.0", badges: [PROGRESSION_LABELS["10x"]] },
  "allianz-zivot": { insurer: "Allianz Život", badges: ["27.05.2022–28.11.2025", PROGRESSION_LABELS["8x"]] },
  "allianz-zivot-2021-06": { insurer: "Allianz Život", badges: ["01.01.2017–18.06.2021", PROGRESSION_LABELS["8x"]] },
  "allianz-partners-2026": { insurer: "Allianz Partners 2025–2026", badges: [PROGRESSION_LABELS["8x"]] },
  "simplea-2": { insurer: "Simplea 2.0", badges: [PROGRESSION_LABELS["10x"]] },
  "pillow-uraz-nemoc": { insurer: "Pillow Úraz Nemoc", badges: [PROGRESSION_LABELS["10x"]] },
} satisfies Record<string, ProductMetadata>;

type InsurerFilterOption = {
  value: string;
  productName: string;
  badges: string[];
  isLatestEdition: boolean;
};

type InsurerFilterGroup = {
  insurerName: string;
  options: InsurerFilterOption[];
};

const INSURER_FILTER_GROUP_PRIORITY = new Map([
  ["ČPP", 0],
  ["Kooperativa", 1],
  ["Allianz", 2],
]);

export const splitInsurerAndProduct = (value: string): { insurerName: string; productName: string } => {
  const insurerPrefixes = [
    "ČPP",
    "UNIQA",
    "Kooperativa",
    "MetLife",
    "ČSOB",
    "KB",
    "Generali",
    "NN",
    "Maxima",
    "Allianz",
    "AXA",
    "Slavia",
    "Simplea",
    "Pillow",
    "YOU PLUS",
  ];

  const lower = value.toLowerCase();
  const matched = insurerPrefixes.find((prefix) => lower.startsWith(prefix.toLowerCase()));
  if (!matched) {
    return { insurerName: value, productName: value };
  }

  const productName = value.slice(matched.length).trim();
  return {
    insurerName: matched,
    productName: productName || value,
  };
};

const splitProductYearBadge = (value: string): { productName: string; yearBadge: string | null } => {
  const match = value.match(/^(.*\S)\s+(\d{4}(?:[-–]\d{4})?|\d{1,2}\/\d{4})$/);
  if (!match) return { productName: value, yearBadge: null };

  return {
    productName: match[1],
    yearBadge: match[2].replace("-", "–"),
  };
};

const isYearBadge = (value: string): boolean =>
  /^\d{4}(?:[-–](?:\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?$/.test(value) ||
  /^\d{1,2}\/\d{4}$/.test(value) ||
  /^\d{1,2}\.\d{1,2}\.\d{4}(?:[-–](?:\d{4}|\d{1,2}\.\d{1,2}\.\d{4}))?$/.test(value);

const normalizeYearBadge = (value: string): string => value.replaceAll("-", "–");

const getEditionStart = (yearBadge: string): number => {
  const [start] = yearBadge.split("–");
  const [year, month = 1, day = 1] = start.split(/[./]/).map(Number).reverse();
  return year * 10_000 + month * 100 + day;
};

const getCardFilterYearBadges = (card: ProductMetadata): string[] => {
  const years = card.filterYears?.length
    ? card.filterYears
    : card.badges.filter(isYearBadge);

  return Array.from(new Set(years.map(normalizeYearBadge)));
};

export const getCardFilterOptions = (
  card: ProductMetadata
): Array<{ value: string; badges: string[] }> => {
  const yearBadges = getCardFilterYearBadges(card);

  if (yearBadges.length === 0) {
    return [{ value: `${card.insurer}::without-year`, badges: [] }];
  }

  return yearBadges.map((yearBadge) => ({
    value: `${card.insurer}::${yearBadge}`,
    badges: [yearBadge],
  }));
};

export function getInsurerFilterGroups(
  cards: readonly ProductMetadata[],
  filterableCards: readonly ProductMetadata[] = cards,
): InsurerFilterGroup[] {
  const latestEditionByProduct = new Map<string, number>();
  for (const card of cards) {
    for (const yearBadge of getCardFilterYearBadges(card)) {
      const start = getEditionStart(yearBadge);
      const latestStart = latestEditionByProduct.get(card.insurer) ?? 0;
      if (start > latestStart) latestEditionByProduct.set(card.insurer, start);
    }
  }

  return filterableCards
    .reduce<InsurerFilterGroup[]>((groups, card) => {
      const { insurerName, productName } = splitInsurerAndProduct(card.insurer);
      let group = groups.find((item) => item.insurerName === insurerName);

      if (!group) {
        group = { insurerName, options: [] };
        groups.push(group);
      }

      for (const filterOption of getCardFilterOptions(card)) {
        let option = group.options.find((item) => item.value === filterOption.value);
        if (!option) {
          const latestStart = latestEditionByProduct.get(card.insurer);
          option = {
            value: filterOption.value,
            productName,
            badges: [],
            isLatestEdition: filterOption.badges.some((badge) => getEditionStart(badge) === latestStart),
          };
          group.options.push(option);
        }

        for (const badge of filterOption.badges) {
          if (!option.badges.includes(badge)) option.badges.push(badge);
        }
      }

      return groups;
    }, [])
    .sort(
      (first, second) =>
        (INSURER_FILTER_GROUP_PRIORITY.get(first.insurerName) ?? Number.MAX_SAFE_INTEGER) -
        (INSURER_FILTER_GROUP_PRIORITY.get(second.insurerName) ?? Number.MAX_SAFE_INTEGER)
    );
}

export const INJURY_PRODUCT_CARDS = Object.fromEntries(
  Object.entries(products).map(([key, { insurer, badges }]: [string, ProductMetadata]) => {
    const { productName, yearBadge } = splitProductYearBadge(insurer);
    return [key, {
      key,
      insurer: productName,
      badges: yearBadge && !badges.includes(yearBadge) ? [yearBadge, ...badges] : badges,
    }];
  }),
) as Record<keyof typeof products, ProductMetadata & { key: string }>;

export const INJURY_PRODUCT_GROUPS = getInsurerFilterGroups(Object.values(INJURY_PRODUCT_CARDS));

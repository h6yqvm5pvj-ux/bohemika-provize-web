import type { GeneralAnswer, GeneralCriterionId } from "./generalData";

const LOWER_LIMIT_NOTE = "Pokud je sjednán nižší limit, jsou nižší (ve výši sjednaného limitu) také všechny uvedené limity.";

// Výchozí hodnocení; odlišnosti konkrétních verzí jsou uvedeny níže.
const NEGLIGENCE_ANSWERS = {
  negligence: { summary: "Ve vztahu k nedbalostnímu jednání se užije zákonný standard.", tone: "positive" },
  "negligence-definition": { summary: "Není definováno", tone: "positive" },
  "negligence-position": { summary: "Není definováno, nezhoršuje.", tone: "positive" },
  "negligence-refusal": { summary: "Pouze snížit pojistné plnění", tone: "positive" },
} satisfies Partial<Record<GeneralCriterionId, GeneralAnswer>>;

const HISTORICAL_CSOB_GENERAL = {
  "maximum-limit": {
    summary: "Max. 50 000 000 Kč",
    detail: `V dalších variantách 2, 4, 6, 8, 10, 15 nebo 25 mil. Kč. ${LOWER_LIMIT_NOTE}`,
    tone: "positive",
  },
  territory: { summary: "Evropa", tone: "positive" },
  ...NEGLIGENCE_ANSWERS,
} satisfies Record<GeneralCriterionId, GeneralAnswer>;

// Přepis screenshotu dodaného uživatelem 21. 9. 2026 v 9:28:25.
// Data i hodnocení platí pouze pro tyto konkrétní historické verze.
export const HISTORICAL_GENERAL_ANSWERS = {
  "cpp:domex-plus-2019-01-01": {
    "maximum-limit": {
      summary: "Max. 20 000 000 Kč",
      detail: `V dalších variantách 2, 4, 6, 8, 10, 12 nebo 15 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: { summary: "ČR, Evropa (geograficky) jen při přechodném pobytu", tone: "warning" },
    ...NEGLIGENCE_ANSWERS,
  },
  "cpp:domex-plus-2022-08-01": {
    "maximum-limit": {
      summary: "Max. 20 000 000 Kč",
      detail: `V dalších variantách 2, 3, 4, 5, 6, 7, 8, 9, 10 a 15 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: { summary: "ČR, Evropa (geograficky) jen při přechodném pobytu", tone: "warning" },
    ...NEGLIGENCE_ANSWERS,
  },
  "kooperativa:pojisteni-odpovednosti-2019-01-01": {
    "maximum-limit": {
      summary: "Max. 20 000 000 Kč",
      detail: `V dalších variantách 1, 2, 5, 10 nebo 15 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: { summary: "Evropa (vyjma Turecka a zemí SSSR, pokud nejsou členy EU)", tone: "warning" },
    ...NEGLIGENCE_ANSWERS,
  },
  "kooperativa:pojisteni-odpovednosti-2021-05-01": {
    "maximum-limit": {
      summary: "Max. 30 000 000 Kč",
      detail: `V dalších variantách 1, 2, 5, 10, 15 nebo 20 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: { summary: "Evropa (vyjma Turecka a zemí SSSR, pokud nejsou členy EU)", tone: "warning" },
    ...NEGLIGENCE_ANSWERS,
  },
  // Podklady ČSOB a Maximy z 21. 9. 2026, 9:57:19 a 9:58:07.
  // Zavřené podrobnosti územní platnosti nejsou domýšleny.
  "csob:nase-odpovednost-2018-04-01": { ...HISTORICAL_CSOB_GENERAL },
  "csob:nase-odpovednost-2020-03-01": { ...HISTORICAL_CSOB_GENERAL },
  "csob:nase-odpovednost-2022-10-01": {
    ...HISTORICAL_CSOB_GENERAL,
    "negligence-position": { summary: "Definice mírně zhoršuje postavení pojištěného.", tone: "neutral" },
  },
  "maxima:maxdomov-3-2021-10-18": {
    "maximum-limit": {
      summary: "Max. 50 000 000 Kč",
      detail: "Další varianty: 1; 2,5; 5; 10; 20 mil. Kč.",
      tone: "positive",
    },
    territory: { summary: "Evropa", tone: "positive" },
    ...NEGLIGENCE_ANSWERS,
    // Zdroj obsahuje pouze tento text, samotné znění definice nebylo dodáno.
    "negligence-definition": { summary: "Více informací", tone: "positive" },
  },
  "maxima:maxdomov-3-1-2023-01-16": {
    "maximum-limit": {
      summary: "Max. 50 000 000 Kč",
      detail: "Další varianty: 1; 2,5; 5; 10; 20; 50 mil. Kč.",
      tone: "positive",
    },
    territory: { summary: "Evropa", tone: "positive" },
    ...NEGLIGENCE_ANSWERS,
    "negligence-definition": {
      summary: "Jednání nebo opomenutí, lhostejnost a vědomé porušení právní povinnosti",
      detail: "a) Jednání nebo opomenutí, při kterém musel být vznik újmy předpokládán nebo očekáván a účastník věděl či mohl a měl vědět, že při takovém jednání nebo opomenutí újma nastaven, ale bez přiměřených důvodů spoléhal, že nenastane, případně byl s jejím vznikem srozuměn;\nb) Lhostejnost k výsledku jednání nebo k výsledku činnosti\nc) Vědomé porušení právní povinnosti",
      tone: "positive",
    },
  },
} satisfies Record<string, Record<GeneralCriterionId, GeneralAnswer>>;

import { comparisonAnswersDiffer, type ComparisonAnswer, type ComparisonSectionData } from "./comparisonData";
import { ADDITIONAL_GENERAL_ANSWERS } from "./additionalProductData";
import { REMAINING_GENERAL_ANSWERS } from "./remainingProductData";

export type GeneralAnswer = ComparisonAnswer;

export type GeneralCriterionId =
  | "maximum-limit"
  | "territory"
  | "negligence"
  | "negligence-definition"
  | "negligence-position"
  | "negligence-refusal";

export type GeneralCriterion = {
  id: GeneralCriterionId;
  title: string;
  parentId?: GeneralCriterionId;
  parentLabel?: string;
};

export const GENERAL_CRITERIA: GeneralCriterion[] = [
  { id: "maximum-limit", title: "Maximální limit" },
  { id: "territory", title: "Územní platnost pojištění" },
  {
    id: "negligence",
    title: "Vyhodnocení pojistných podmínek ve vztahu k nedbalostnímu jednání (např. hrubé nedbalosti)",
  },
  { id: "negligence-definition", title: "Definice", parentId: "negligence", parentLabel: "Nedbalostní jednání" },
  {
    id: "negligence-position",
    title: "Zhoršuje definice nedbalostního jednání (např. hrubé nedbalosti) postavení pojištěného nad rámec zákona?",
    parentId: "negligence",
    parentLabel: "Nedbalostní jednání",
  },
  {
    id: "negligence-refusal",
    title: "Může pojišťovna zamítnout nárok na pojistné plnění v důsledku nedbalostního jednání (např. hrubé nedbalosti)?",
    parentId: "negligence",
    parentLabel: "Nedbalostní jednání",
  },
];

type GeneralAnswers = Record<GeneralCriterionId, GeneralAnswer>;

const LOWER_LIMIT_NOTE =
  "Pokud je sjednán nižší limit, jsou nižší (ve výši sjednaného limitu) také všechny uvedené limity.";

// Přepis uživatelem dodaných screenshotů z 19. 9. 2026, 17:58:32 a 17:58:46.
// Hodnocení i barvy pocházejí z podkladu; klíče vždy označují konkrétní verzi produktu.
export const GENERAL_ANSWERS: Partial<Record<string, GeneralAnswers>> = {
  ...ADDITIONAL_GENERAL_ANSWERS,
  ...REMAINING_GENERAL_ANSWERS,
  "allianz:mujdomov-2026-06-25": {
    "maximum-limit": {
      summary: "Max. 20 000 000 Kč",
      detail: `V další variantě 5 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: {
      summary: "Evropa",
      detail:
        "Andorra, Belgie, Bulharsko, Černá Hora, Dánsko (včetně Faerských ostrovů), Estonsko, Finsko, Francie (včetně Korsiky), Gibraltar, Chorvatsko, Irsko, Island, Itálie, Kypr, Lichtenštejnsko, Litva, Lotyšsko, Lucembursko, Maďarsko, Malta, Monako, Německo, Nizozemsko, Norsko (včetně Špicberk), Polsko, Portugalsko (včetně Azor a Madeiry), Rakousko, Rumunsko, Řecko, San Marino, Severní Makedonie, Slovensko, Slovinsko, Srbsko, Španělsko (včetně Baleárských a Kanárských ostrovů), Švédsko, Švýcarsko, Vatikán, Velká Británie a Severní Irsko.",
      tone: "positive",
    },
    negligence: {
      summary: "Jakkoliv pojišťovna může pouze krátit, definice dopadá na široký okruh situací.",
      tone: "negative",
    },
    "negligence-definition": {
      summary: "Závažné porušení právních předpisů",
      detail:
        "Závažné porušení právních předpisů (např. protipožárních, bezpečnostních), které způsobilo újmu nebo zvětšení jejích následků.",
      tone: "negative",
    },
    "negligence-position": {
      summary: "Definice podstatně zhoršuje postavení pojištěného.",
      tone: "negative",
    },
    "negligence-refusal": {
      summary: "Pouze snížit pojistné plnění",
      tone: "positive",
    },
  },
  "cpp:domex-plus-2023-10-01": {
    "maximum-limit": {
      summary: "Max. 50 000 000 Kč",
      detail: `V dalších variantách 2, 3, 4, 5, 6, 7, 8, 9, 10 a 15 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: {
      summary: "ČR, Evropa (geograficky) jen při přechodném pobytu",
      tone: "warning",
    },
    negligence: {
      summary: "Ve vztahu k nedbalostnímu jednání se užije zákonný standard.",
      tone: "positive",
    },
    "negligence-definition": { summary: "Není definováno", tone: "positive" },
    "negligence-position": { summary: "Není definováno, nezhoršuje.", tone: "positive" },
    "negligence-refusal": { summary: "Pouze snížit pojistné plnění", tone: "positive" },
  },
  "csob:nase-odpovednost-2025-06-16": {
    "maximum-limit": {
      summary: "Max. 50 000 000 Kč",
      detail: `V dalších variantách 2, 4, 6, 10, 15 nebo 25 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: {
      summary: "Evropa",
      detail: "Odpovědnost nájemce stavby se vztahuje jen na ČR.",
      tone: "positive",
    },
    negligence: {
      summary: "Ve vztahu k nedbalostnímu jednání se užije zákonný standard.",
      tone: "positive",
    },
    "negligence-definition": { summary: "Není definováno", tone: "positive" },
    "negligence-position": { summary: "Není definováno, nezhoršuje.", tone: "positive" },
    "negligence-refusal": { summary: "Pouze snížit pojistné plnění", tone: "positive" },
  },
  "direct:majetkove-pojisteni-2025-10-16": {
    "maximum-limit": {
      summary: "Max. 100 000 000 Kč",
      // Jednotku mil. Kč uživatel výslovně potvrdil při přepisu.
      detail: `V dalších variantách 3, 5, 10, 25 a 50 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: { summary: "Evropa + Turecko", tone: "positive" },
    negligence: {
      summary: "Nedbalostní jednání (např. hrubá nedbalost) je sice ve výluce, nicméně definice nedopadá na širší okruh situací.",
      tone: "neutral",
    },
    "negligence-definition": {
      summary: "Úmysl či hrubá nedbalost",
      detail:
        "Nevzniká právo na pojistné plnění způsobené úmyslně či hrubou nedbalostí. Hrubá nedbalost je takové vědomé jednání, které svědčí o zřejmé lhostejnosti ke vzniku škody či újmy.",
      tone: "positive",
    },
    "negligence-position": {
      summary: "Definice nezhoršuje postavení pojištěného.",
      tone: "positive",
    },
    "negligence-refusal": { summary: "Ano, výluka", tone: "negative" },
  },
  "generali:muj-majetek-2-0-2026-06-13": {
    "maximum-limit": {
      summary: "Max. 50 000 000 Kč",
      detail: `V dalších variantách 2, 6, 10 nebo 30 mil. Kč. ${LOWER_LIMIT_NOTE}`,
      tone: "positive",
    },
    territory: {
      summary: "ČR / Evropa / Celý svět",
      detail:
        "Celý svět vyjma Běloruska, Íránu, Korejské lidově demokratické republiky, Kuby s americkým prvkem, Ruské federace, Sýrie, Venezuely s americkým prvkem, Krymského regionu, Doněckého regionu, Chersonského regionu, Luhanského regionu, Záporožského regionu.",
      tone: "positive",
    },
    negligence: {
      summary: "Nedbalostní jednání (např. hrubá nedbalost) je sice ve výluce, nicméně definice nedopadá na širší okruh situací.",
      tone: "neutral",
    },
    "negligence-definition": {
      summary: "Úmysl nebo hrubá nedbalost",
      detail:
        "Pojištění se nevztahuje na škodu či újmu způsobenou úmyslně nebo hrubou nedbalostí. Škoda či újma je způsobena hrubou nedbalostí, zejména jestliže přístup pojištěného ke konání nebo opomenutí nebo k jednání, o kterém pojištěný věděl, svědčí o zřejmé lhostejnosti k vzniku škody či újmy.",
      tone: "neutral",
    },
    "negligence-position": {
      summary: "Definice nezhoršuje postavení pojištěného.",
      tone: "positive",
    },
    "negligence-refusal": { summary: "Ano, výluka", tone: "negative" },
  },
};

export function hasGeneralComparison(productId: string): boolean {
  return GENERAL_ANSWERS[productId] !== undefined;
}

export function criterionHasDifferences(criterionId: GeneralCriterionId, productIds: string[]): boolean {
  return comparisonAnswersDiffer(productIds.map((productId) => GENERAL_ANSWERS[productId]?.[criterionId]));
}

export const GENERAL_SECTION: ComparisonSectionData = {
  id: "general",
  title: "Obecné",
  number: "01",
  criteria: GENERAL_CRITERIA,
  answers: GENERAL_ANSWERS,
};

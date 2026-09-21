import { type ComparisonAnswer, type ComparisonCriterion, type ComparisonSectionData } from "./comparisonData";
import { ADDITIONAL_LIFE_SPORT_ANSWERS } from "./additionalProductData";
import { REMAINING_LIFE_SPORT_ANSWERS } from "./remainingProductData";
import { HISTORICAL_LIFE_SPORT_ANSWERS } from "./historicalLifeSportData";

export const LIFE_SPORT_CRITERIA = [
  { id: "everyday-life", title: "Činnosti vyplývající z běžného občanského života" },
  { id: "household", title: "Vedení domácnosti pojištěného" },
  { id: "recreational-sport", title: "Provozování rekreačního sportu" },
  { id: "recreational-cycling", title: "Rekreační cyklistika" },
  {
    id: "electric-vehicles",
    title: "Jízda na elektrokoloběžce, elektrokole, elektrojednokolce apod., u kterých není vyžadováno „povinné ručení“",
  },
  {
    id: "electric-vehicles-sidewalk",
    title: "Vztahuje se i na jízdu po chodníku?",
    parentId: "electric-vehicles",
    parentLabel: "Elektrovozítka",
    coverageParentId: "electric-vehicles",
  },
  {
    id: "electric-vehicles-definition",
    title: "Definice elektrického pojízdného zařízení",
    parentId: "electric-vehicles",
    parentLabel: "Elektrovozítka",
    coverageParentId: "electric-vehicles",
  },
  {
    id: "legally-held-weapons",
    title: "Škody způsobené legálně drženou zbraní (nevztahuje se na výkon práva myslivosti)",
  },
  { id: "health-insurer-recourse", title: "Regres zdravotní pojišťovny" },
  {
    id: "electronics",
    title: "Škody způsobené na elektronice, mobilních telefonech, tabletech a kuchyňských spotřebičích",
  },
  { id: "consequential-financial-loss", title: "Následná finanční škoda" },
  { id: "pure-financial-loss", title: "Čistá finanční škoda" },
] as const satisfies readonly ComparisonCriterion[];

type LifeSportCriterionId = (typeof LIFE_SPORT_CRITERIA)[number]["id"];
type LifeSportAnswers = Record<LifeSportCriterionId, ComparisonAnswer>;

const INCLUDED: ComparisonAnswer = { summary: "Ano, vztahuje", tone: "positive" };
const NOT_INCLUDED: ComparisonAnswer = { summary: "Není součástí", tone: "negative" };
const NOT_SPECIFIED: ComparisonAnswer = { summary: "Není stanoveno", tone: "positive" };

// Společné odpovědi pouze pro pět konkrétních verzí níže, nikoliv pro celý katalog.
const COMMON_ANSWERS = {
  "everyday-life": INCLUDED,
  household: INCLUDED,
  "recreational-sport": INCLUDED,
  "recreational-cycling": INCLUDED,
  "electric-vehicles": INCLUDED,
  "electric-vehicles-sidewalk": {
    summary: "Ano, ale pojistné plnění může být kráceno",
    tone: "positive",
  },
  "health-insurer-recourse": INCLUDED,
  "consequential-financial-loss": INCLUDED,
} satisfies Partial<LifeSportAnswers>;

// Přepis screenshotů dodaných uživatelem: 19. 9. 2026, 18:04:27, 18:04:40 a 18:04:46.
// Barvy zachovávají hodnocení z podkladů, včetně neutrálních odpovědí Allianz a ČSOB.
export const LIFE_SPORT_ANSWERS: Partial<Record<string, LifeSportAnswers>> = {
  ...ADDITIONAL_LIFE_SPORT_ANSWERS,
  ...REMAINING_LIFE_SPORT_ANSWERS,
  ...HISTORICAL_LIFE_SPORT_ANSWERS,
  "allianz:mujdomov-2026-06-25": {
    ...COMMON_ANSWERS,
    "electric-vehicles-definition": {
      summary: "Do 1 kW a 25 km/h",
      detail:
        "Jízdní kolo vybavené pomocným elektromotorem nebo spalovacím motorem se zdvihovým objemem válců do 50 ccm, v obou případech o celkovém (společném) výkonu do 1 kW a s konstrukční rychlostí do 25 km/hod. Stejně jako motokola se posuzují i koloběžky a tříkolky, popř. jiná vozítka vybavená pomocným motorem.",
      tone: "neutral",
    },
    "legally-held-weapons": NOT_INCLUDED,
    electronics: INCLUDED,
    "pure-financial-loss": NOT_INCLUDED,
  },
  "cpp:domex-plus-2023-10-01": {
    ...COMMON_ANSWERS,
    "electric-vehicles-definition": NOT_SPECIFIED,
    "legally-held-weapons": INCLUDED,
    electronics: {
      summary: "Možno připojistit, limit 15 %",
      detail: "Škody na kuchyňských spotřebičích jsou obsaženy v základním pojištění.",
      tone: "warning",
    },
    "pure-financial-loss": {
      summary: "Ano, limit 10 % z limitu pojištění (max. 2 000 000 Kč)",
      tone: "positive",
    },
  },
  "csob:nase-odpovednost-2025-06-16": {
    ...COMMON_ANSWERS,
    "electric-vehicles-definition": NOT_SPECIFIED,
    "legally-held-weapons": INCLUDED,
    electronics: {
      summary: "Ano, limit 3 000 Kč",
      detail:
        "Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč. Při poškození požárem, výbuchem, vodovodní škodou, pojištěným v obchodech a žákem nebo studentem ve škole nebo na praxi je limitem sjednaný limit na občanskou odpovědnost.",
      tone: "neutral",
    },
    "pure-financial-loss": INCLUDED,
  },
  "direct:majetkove-pojisteni-2025-10-16": {
    ...COMMON_ANSWERS,
    "electric-vehicles-definition": NOT_SPECIFIED,
    "legally-held-weapons": NOT_INCLUDED,
    electronics: {
      summary: "Možno připojistit",
      detail:
        "Možno připojistit pro elektroniku, mobilní telefony a tablety. Kuchyňské spotřebiče jsou kryty základním pojištěním.",
      tone: "warning",
    },
    "pure-financial-loss": NOT_INCLUDED,
  },
  "generali:muj-majetek-2-0-2026-06-13": {
    ...COMMON_ANSWERS,
    "electric-vehicles-definition": NOT_SPECIFIED,
    "legally-held-weapons": INCLUDED,
    electronics: INCLUDED,
    "pure-financial-loss": NOT_INCLUDED,
  },
};

export const LIFE_SPORT_SECTION: ComparisonSectionData = {
  id: "life-sport",
  title: "Život a sport",
  number: "02",
  criteria: LIFE_SPORT_CRITERIA,
  answers: LIFE_SPORT_ANSWERS,
};

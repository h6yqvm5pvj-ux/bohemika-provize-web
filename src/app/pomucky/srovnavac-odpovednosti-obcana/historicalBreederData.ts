import { createScreenshotAnswers, included, excluded } from "./screenshotData";

// Pořadí sloupců screenshotů z 21. 9. 2026, 9:31:15 a 9:31:21.
const PRODUCT_IDS = [
  "cpp:domex-plus-2019-01-01",
  "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01",
  "kooperativa:pojisteni-odpovednosti-2021-05-01",
] as const;

const CPP_KOOPERATIVA_ANSWERS = createScreenshotAnswers(PRODUCT_IDS, {
  dog: [included, included, included, included],
  "multiple-dogs": [included, included, included, included],
  cats: [included, included, included, included],
  "other-pets": [included, included, included, included],
  "dangerous-animals": [included, included, excluded, excluded],
  "commercial-animals": [excluded, excluded, excluded, excluded],
  "exotic-animals": [included, included, excluded, included],
  livestock: [included, included, included, included],
  "animal-plant-damage": [included, included, included, included],
});

// Pořadí sloupců screenshotů z 21. 9. 2026, 10:08:24 a 10:08:30.
const CSOB_MAXIMA_PRODUCT_IDS = [
  "csob:nase-odpovednost-2018-04-01",
  "csob:nase-odpovednost-2020-03-01",
  "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18",
  "maxima:maxdomov-3-1-2023-01-16",
] as const;

const CSOB_MAXIMA_ANSWERS = createScreenshotAnswers(CSOB_MAXIMA_PRODUCT_IDS, {
  dog: [included, included, included, included, included],
  "multiple-dogs": [included, included, included, included, included],
  cats: [included, included, included, included, included],
  "other-pets": [included, included, included, included, included],
  "dangerous-animals": [included, included, included, included, included],
  "commercial-animals": [excluded, excluded, excluded, excluded, excluded],
  "exotic-animals": [included, included, included, included, included],
  livestock: [included, included, included, included, included],
  "animal-plant-damage": [included, included, included, excluded, excluded],
});

export const HISTORICAL_BREEDER_ANSWERS = { ...CPP_KOOPERATIVA_ANSWERS, ...CSOB_MAXIMA_ANSWERS };

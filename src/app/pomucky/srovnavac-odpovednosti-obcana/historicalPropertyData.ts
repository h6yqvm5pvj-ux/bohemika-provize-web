import { createScreenshotAnswers, included, excluded, optional, positive } from "./screenshotData";

// Pořadí sloupců screenshotů z 21. 9. 2026, 9:35:46 a 9:35:53.
const PRODUCT_IDS = [
  "cpp:domex-plus-2019-01-01",
  "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01",
  "kooperativa:pojisteni-odpovednosti-2021-05-01",
] as const;

const czechia = positive("ČR");

// Prázdný organizační řádek „Pojištění se vztahuje na“ zastupují vazby podkritérií.
const CPP_KOOPERATIVA_ANSWERS = createScreenshotAnswers(PRODUCT_IDS, {
  "property-owner": [included, included, optional, optional],
  "listed-property": [included, included, included, included],
  "listed-property-land": [included, included, included, included],
  "other-properties": [included, included, excluded, included],
  "other-home": [included, included, excluded, included],
  "other-holiday-home": [included, included, excluded, included],
  "other-farm-building": [included, included, excluded, excluded],
  "other-business-property": [excluded, excluded, excluded, excluded],
  "other-apartment-building": [included, excluded, excluded, excluded],
  "other-property-land": [included, included, excluded, included],
  "other-separate-land": [included, excluded, excluded, excluded],
  "other-property-territory": [czechia, czechia, excluded, czechia],
  "minor-building-work": [included, included, optional, optional],
  "self-build": [included, included, optional, optional],
});

// Pořadí sloupců screenshotů z 21. 9. 2026, 10:16:11 a 10:16:19.
const CSOB_MAXIMA_PRODUCT_IDS = [
  "csob:nase-odpovednost-2018-04-01",
  "csob:nase-odpovednost-2020-03-01",
  "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18",
  "maxima:maxdomov-3-1-2023-01-16",
] as const;

const CSOB_MAXIMA_ANSWERS = createScreenshotAnswers(CSOB_MAXIMA_PRODUCT_IDS, {
  "property-owner": [included, included, included, optional, optional],
  "listed-property": [included, included, included, included, included],
  "listed-property-land": [included, included, included, excluded, included],
  "other-properties": [included, included, included, optional, optional],
  "other-home": [included, included, included, included, included],
  "other-holiday-home": [included, included, included, included, included],
  "other-farm-building": [included, included, included, excluded, excluded],
  "other-business-property": [included, included, included, excluded, excluded],
  "other-apartment-building": [included, included, included, excluded, excluded],
  "other-property-land": [included, included, included, excluded, excluded],
  "other-separate-land": [included, included, included, excluded, excluded],
  "other-property-territory": [czechia, czechia, czechia, czechia, czechia],
  "minor-building-work": [included, included, included, included, included],
  "self-build": [
    included, included, included, excluded,
    positive("Ano, vztahuje (ale jen na smlouvou pojištěné nemovitosti)"),
  ],
});

export const HISTORICAL_PROPERTY_ANSWERS = { ...CPP_KOOPERATIVA_ANSWERS, ...CSOB_MAXIMA_ANSWERS };

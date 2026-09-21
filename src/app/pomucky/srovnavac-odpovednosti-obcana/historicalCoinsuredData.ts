import { createScreenshotAnswers, excluded, positive, negative, neutral } from "./screenshotData";

// Pořadí sloupců screenshotů z 21. 9. 2026, 9:48:35, 9:48:44 a 9:48:50.
const PRODUCT_IDS = [
  "cpp:domex-plus-2019-01-01",
  "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01",
  "kooperativa:pojisteni-odpovednosti-2021-05-01",
] as const;

const yes = positive("Ano");
const childUnder26 = neutral("Ano, do 26 let věku dítěte");
const childAnyAge = positive("Ano (jakéhokoliv věku a stavu)");
const directLineOnly = negative("Není součástí, jen v přímé linii");
// Výslovné N / A ze zdroje zachováváme jako neutrální údaj.
const sourceNA = neutral("N / A");

const CPP_KOOPERATIVA_ANSWERS = createScreenshotAnswers(PRODUCT_IDS, {
  "household-members": [yes, yes, yes, yes],
  "partners": [yes, yes, yes, yes],
  "children": [childUnder26, childUnder26, childAnyAge, childAnyAge],
  "direct-relatives": [yes, yes, yes, yes],
  "limited-capacity-relative": [directLineOnly, directLineOnly, yes, yes],
  "other-paying-members": [yes, excluded, yes, yes],
  "non-paying-friends": [sourceNA, sourceNA, sourceNA, sourceNA],
  "household-helpers": [yes, yes, excluded, excluded],
  "helper-chores": [yes, yes, excluded, excluded],
  "helper-childcare": [yes, yes, excluded, excluded],
  "helper-pet-care": [yes, yes, excluded, excluded],
  "helper-property-care": [yes, yes, excluded, excluded],
  "helper-path-maintenance": [yes, yes, excluded, excluded],
  "helper-construction": [yes, yes, excluded, excluded],
  "contracted-helpers": [yes, yes, excluded, excluded],
  "contracted-helper-chores": [yes, yes, excluded, excluded],
  "contracted-helper-childcare": [yes, yes, excluded, excluded],
  "contracted-helper-pet-care": [yes, yes, excluded, excluded],
  "contracted-helper-property-care": [yes, yes, excluded, excluded],
  "contracted-helper-path-maintenance": [yes, yes, excluded, excluded],
  "contracted-helper-construction": [yes, yes, excluded, excluded],
});

// Pořadí sloupců screenshotů z 21. 9. 2026, 10:30:24, 10:30:36 a 10:30:44.
const CSOB_MAXIMA_PRODUCT_IDS = [
  "csob:nase-odpovednost-2018-04-01",
  "csob:nase-odpovednost-2020-03-01",
  "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18",
  "maxima:maxdomov-3-1-2023-01-16",
] as const;

const CSOB_MAXIMA_ANSWERS = createScreenshotAnswers(CSOB_MAXIMA_PRODUCT_IDS, {
  "household-members": [yes, yes, yes, yes, yes],
  "partners": [yes, yes, yes, yes, yes],
  "children": [childAnyAge, childAnyAge, childAnyAge, childAnyAge, childAnyAge],
  "direct-relatives": [yes, yes, yes, yes, yes],
  "limited-capacity-relative": [yes, yes, yes, yes, yes],
  "other-paying-members": [yes, yes, yes, yes, yes],
  "non-paying-friends": [sourceNA, sourceNA, yes, excluded, excluded],
  "household-helpers": [yes, yes, yes, yes, yes],
  "helper-chores": [yes, yes, yes, yes, yes],
  "helper-childcare": [yes, yes, yes, yes, yes],
  "helper-pet-care": [yes, yes, yes, yes, yes],
  "helper-property-care": [excluded, excluded, excluded, yes, yes],
  "helper-path-maintenance": [excluded, excluded, excluded, yes, yes],
  "helper-construction": [excluded, excluded, excluded, yes, yes],
  "contracted-helpers": [yes, yes, yes, yes, yes],
  "contracted-helper-chores": [yes, yes, yes, yes, yes],
  "contracted-helper-childcare": [yes, yes, yes, yes, yes],
  "contracted-helper-pet-care": [yes, yes, yes, yes, yes],
  "contracted-helper-property-care": [excluded, excluded, excluded, yes, yes],
  "contracted-helper-path-maintenance": [excluded, excluded, excluded, yes, yes],
  "contracted-helper-construction": [excluded, excluded, excluded, yes, yes],
});

export const HISTORICAL_COINSURED_ANSWERS = { ...CPP_KOOPERATIVA_ANSWERS, ...CSOB_MAXIMA_ANSWERS };

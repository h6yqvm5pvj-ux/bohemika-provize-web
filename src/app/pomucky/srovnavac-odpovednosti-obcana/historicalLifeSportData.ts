import { createScreenshotAnswers, included, excluded, optional, positive, warning, neutral } from "./screenshotData";

// Pořadí sloupců screenshotů z 21. 9. 2026, 9:30:23 a 9:30:31.
const PRODUCT_IDS = [
  "cpp:domex-plus-2019-01-01",
  "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01",
  "kooperativa:pojisteni-odpovednosti-2021-05-01",
] as const;

const sidewalk = positive("Ano, ale pojistné plnění může být kráceno");
const notSpecified = positive("Není stanoveno");
const financialLoss = positive("Ano, limit 10 % z limitu pojištění");

const CPP_KOOPERATIVA_ANSWERS = createScreenshotAnswers(PRODUCT_IDS, {
  "everyday-life": [included, included, included, included],
  household: [included, included, included, included],
  "recreational-sport": [included, included, included, included],
  "recreational-cycling": [included, included, included, included],
  "electric-vehicles": [included, included, included, included],
  "electric-vehicles-sidewalk": [sidewalk, sidewalk, sidewalk, sidewalk],
  // Kooperativa 2021 má v podkladu červené „Není součástí“ pouze u definice,
  // přestože samotná jízda na elektrovozítku je hodnocená zeleně.
  "electric-vehicles-definition": [notSpecified, notSpecified, notSpecified, excluded],
  "legally-held-weapons": [included, included, included, included],
  "health-insurer-recourse": [included, included, included, included],
  electronics: [
    optional,
    warning("Možno připojistit (škody na kuchyňských spotřebičích jsou obsaženy v základním pojištění)"),
    included,
    included,
  ],
  "consequential-financial-loss": [included, included, included, included],
  "pure-financial-loss": [financialLoss, financialLoss, excluded, excluded],
});

// Pořadí sloupců screenshotů z 21. 9. 2026, 10:00:13 a 10:00:20.
const CSOB_MAXIMA_PRODUCT_IDS = [
  "csob:nase-odpovednost-2018-04-01",
  "csob:nase-odpovednost-2020-03-01",
  "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18",
  "maxima:maxdomov-3-1-2023-01-16",
] as const;

const electronicsLimit = "Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč.";
const csobElectronics = neutral("Ano, limit 3 000 Kč", electronicsLimit);
const CSOB_MAXIMA_ANSWERS = createScreenshotAnswers(CSOB_MAXIMA_PRODUCT_IDS, {
  "everyday-life": [included, included, included, included, included],
  household: [included, included, included, included, included],
  "recreational-sport": [included, included, included, included, included],
  "recreational-cycling": [included, included, included, included, included],
  "electric-vehicles": [included, included, included, excluded, excluded],
  "electric-vehicles-sidewalk": [sidewalk, sidewalk, sidewalk, excluded, excluded],
  "electric-vehicles-definition": [notSpecified, notSpecified, notSpecified, excluded, excluded],
  "legally-held-weapons": [included, included, included, included, included],
  "health-insurer-recourse": [included, included, included, included, included],
  electronics: [
    csobElectronics,
    csobElectronics,
    // Podklad 2022 vyjmenovává situace, ale neurčuje pro ně další limit.
    neutral("Ano, limit 3 000 Kč", `${electronicsLimit} Při poškození požárem, výbuchem, vodovodní škodou, pojištěným v obchodech a žákem nebo studentem ve škole nebo na praxi.`),
    included,
    included,
  ],
  "consequential-financial-loss": [included, included, included, included, included],
  "pure-financial-loss": [included, included, included, excluded, excluded],
});

export const HISTORICAL_LIFE_SPORT_ANSWERS = { ...CPP_KOOPERATIVA_ANSWERS, ...CSOB_MAXIMA_ANSWERS };

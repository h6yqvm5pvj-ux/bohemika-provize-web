import { createScreenshotAnswers, included, excluded, notCovered, optional, positive, negative, warning, neutral } from "./screenshotData";

// Pořadí sloupců screenshotů z 21. 9. 2026, 9:40:06, 9:40:15, 9:40:25 a 9:40:30.
const PRODUCT_IDS = [
  "cpp:domex-plus-2019-01-01",
  "cpp:domex-plus-2022-08-01",
  "kooperativa:pojisteni-odpovednosti-2019-01-01",
  "kooperativa:pojisteni-odpovednosti-2021-05-01",
] as const;

const sharedRentalLimit = "Tento limit je společný také pro škody na pronajatém vybavení v rámci pronajaté nemovitosti.";
const unspecifiedRisks = positive("Nebezpečí nejsou specifikována");
const rentalBusinessOnly = negative("Ne, musí se jednat o podnikatele, jehož podnikatelskou činností je půjčování věcí");
const itemTypes = positive("Více informací v podkritériích");
const electronicsAddon = warning("Lze připojistit, limit 10 % z PČ domácnost");
const exceptOperation = positive("Ano (vyjma škody způsobené provozem)");
const tenThousand = positive("Ano, limit 10 000 Kč");
const twentyThousand = positive("Ano, limit 20 000 Kč");

// Zavřené detaily vybavení nejsou domýšleny. Hodnocení podkritérií zůstává podle zdroje,
// i když nadřazené krytí není součástí; tuto podmínku zobrazí vazba coverageParentId.
const CPP_KOOPERATIVA_ANSWERS = createScreenshotAnswers(PRODUCT_IDS, {
  "rented-property": [
    positive("Ano, limit 15 % z PČ nemovitost", sharedRentalLimit),
    positive("Ano, limit 15 % ze sjednaného limitu", sharedRentalLimit),
    included, included,
  ],
  "rented-property-risks": [unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, unspecifiedRisks],
  "rented-equipment": [
    positive("Ano, limit 15 % z PČ nemovitost"), positive("Ano, limit 15 % ze sjednaného limitu"),
    tenThousand, excluded,
  ],
  "rented-equipment-risks": [unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, unspecifiedRisks],
  "borrowed-items": [
    positive("Ano, limit 10 % z PČ domácnost"), positive("Ano, limit 10 % ze sjednaného limitu"),
    tenThousand, twentyThousand,
  ],
  "item-lender": [rentalBusinessOnly, rentalBusinessOnly, rentalBusinessOnly, rentalBusinessOnly],
  "borrowed-item-types": [itemTypes, itemTypes, itemTypes, itemTypes],
  "borrowed-tools": [included, included, included, included],
  "borrowed-sports-equipment": [included, included, included, included],
  "borrowed-animals": [included, included, included, included],
  "borrowed-electronics": [electronicsAddon, electronicsAddon, included, included],
  "borrowed-vehicle": [exceptOperation, exceptOperation, notCovered, notCovered],
  "rental-vehicle-deductible": [included, included, notCovered, twentyThousand],
  "borrowed-motorboat": [
    notCovered,
    positive("Ano, vztahuje (pouze na malé plavidlo o délce max. 20 m a max. pro 12 osob nebo vodní skútr do délky 4 m)"),
    notCovered, notCovered,
  ],
  "borrowed-drone": [
    positive("Ano (vztahuje se jen na provoz na vhodných nebo přesně určených plochách)"),
    positive("Ano (vztahuje se na drony do 25 kg)"),
    notCovered, notCovered,
  ],
  "borrowed-aircraft": [
    notCovered,
    positive("Ano (ale pouze mimo veřejná prostranství a plochy s častým pohybem osob, zvířat a věcí)"),
    notCovered, notCovered,
  ],
  "landlord-tenant-belongings": [
    included, included, optional,
    warning("Lze připojistit jako pojištění odpovědnosti z vlastnictví nemovitosti, limit 30 000 000 Kč"),
  ],
  "tenant-damage-to-landlord": [excluded, excluded, included, included],
  "maximum-rental-income": [excluded, excluded, excluded, excluded],
  "rental-without-address": [excluded, excluded, excluded, excluded],
  "landlord-territory": [excluded, excluded, excluded, excluded],
});

// Pořadí sloupců screenshotů z 21. 9. 2026, 10:25:09, 10:25:18 a 10:25:24.
const CSOB_MAXIMA_PRODUCT_IDS = [
  "csob:nase-odpovednost-2018-04-01",
  "csob:nase-odpovednost-2020-03-01",
  "csob:nase-odpovednost-2022-10-01",
  "maxima:maxdomov-3-2021-10-18",
  "maxima:maxdomov-3-1-2023-01-16",
] as const;

const yes = positive("Ano");
const namedRisks = neutral("Požár, výbuch, vodovodní škoda");
const borrowedElectronics = positive("Ano, limit 3 000 Kč", "Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč.");
const incomeNotStated = positive("Není uvedeno");
const threeLocations = negative("Ne, max. 3 místa pojištění");
const czechia = positive("ČR");

const CSOB_MAXIMA_ANSWERS = createScreenshotAnswers(CSOB_MAXIMA_PRODUCT_IDS, {
  "rented-property": [included, included, included, optional, included],
  "rented-property-risks": [unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, namedRisks, namedRisks],
  "rented-equipment": [included, included, included, excluded, excluded],
  "rented-equipment-risks": [unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, excluded, excluded],
  "borrowed-items": [included, included, included, excluded, excluded],
  "item-lender": [yes, yes, yes, excluded, excluded],
  "borrowed-item-types": [itemTypes, itemTypes, itemTypes, excluded, excluded],
  "borrowed-tools": [included, included, included, notCovered, notCovered],
  "borrowed-sports-equipment": [included, included, included, notCovered, notCovered],
  "borrowed-animals": [included, included, included, notCovered, notCovered],
  "borrowed-electronics": [borrowedElectronics, borrowedElectronics, borrowedElectronics, notCovered, notCovered],
  "borrowed-vehicle": [notCovered, notCovered, notCovered, notCovered, notCovered],
  "rental-vehicle-deductible": [notCovered, notCovered, notCovered, notCovered, notCovered],
  "borrowed-motorboat": [notCovered, notCovered, notCovered, notCovered, notCovered],
  "borrowed-drone": [notCovered, notCovered, notCovered, notCovered, notCovered],
  "borrowed-aircraft": [notCovered, notCovered, notCovered, notCovered, notCovered],
  "landlord-tenant-belongings": [included, included, included, included, optional],
  "tenant-damage-to-landlord": [optional, optional, optional, excluded, excluded],
  "maximum-rental-income": [incomeNotStated, incomeNotStated, incomeNotStated, excluded, excluded],
  // Maxima má podle zdroje připojištění bez adresy a území ČR i pod vyloučeným
  // nadřazeným krytím. Zachováváme obojí; zavřené podrobnosti nedoplňujeme.
  "rental-without-address": [threeLocations, threeLocations, threeLocations, optional, optional],
  "landlord-territory": [czechia, czechia, czechia, czechia, czechia],
});

export const HISTORICAL_TENANCY_ANSWERS = { ...CPP_KOOPERATIVA_ANSWERS, ...CSOB_MAXIMA_ANSWERS };

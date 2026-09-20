import { createScreenshotAnswers, included, excluded, notCovered, optional, positive, negative, neutral, warning } from "./screenshotData";

// Druhá sada screenshotů dodaná uživatelem 20. 9. 2026.
// Pořadí: Komerční pojišťovna, Kooperativa, Maxima, UNIQA PLUS, UNIQA EXTRA.
// Hodnocení přebíráme z podkladu, včetně zdánlivých rozporů mezi rodičem a podkritériem.
export const ADDITIONAL_PRODUCT_IDS = [
  "komercni-pojistovna:majetek-2024-2024-10-13",
  "kooperativa:pojisteni-odpovednosti-2023-04-24",
  "maxima:maxdomov-4-0-2025-07-15",
  "uniqa:domov-bezpeci-plus-2026-01-01",
  "uniqa:domov-bezpeci-extra-2026-01-01",
] as const;

const statutoryStandard = positive("Ve vztahu k nedbalostnímu jednání se užije zákonný standard.");
const notDefined = positive("Není definováno");
const undefinedPosition = positive("Není definováno, nezhoršuje.");
const unchangedPosition = positive("Definice nezhoršuje postavení pojištěného.");
const reductionOnly = positive("Pouze snížit pojistné plnění");
const refusal = negative("Ano, výluka");
const uniqaNegligence = negative("Nedbalostní jednání (např. hrubá nedbalost) je ve výluce, nadto definice rozšiřuje okruh situací, na které se výluka aplikuje.");
const uniqaNegligenceDefinition = neutral("Nedbalost nejvyšší intenzity",
  "Nedbalost nejvyšší intenzity, která svědčí o lehkomyslném přístupu k plnění povinností, kdy je zanedbán požadavek náležité opatrnosti takovým způsobem, že to svědčí o zřejmé bezohlednosti jednající osoby k zájmům jiných osob.");

// 9:05:12 a 9:05:19 – Obecné.
export const ADDITIONAL_GENERAL_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  "maximum-limit": [
    positive("Max. 20 000 000 Kč"),
    positive("Max. 50 000 000 Kč", "V dalších variantách 1, 2, 5, 10, 15, 20 a 30 mil. Kč. Pokud je sjednán nižší limit, jsou nižší (ve výši sjednaného limitu) také všechny uvedené limity."),
    positive("Max. 50 000 000 Kč", "Varianty limitu: 1; 2,5; 5; 10; 20 a 50 mil. Kč."),
    positive("Max. 50 000 000 Kč", "UCZ / PMO / 21, Část C3., odst. 4 a) (str. 37)"),
    // V podkladu není u dalších variant uvedena jednotka; nepřidáváme ji odhadem.
    positive("Max. 50 000 000 Kč", "V dalších variantách 1, 5, 10, 25, 50."),
  ],
  territory: [
    positive("Evropa, Turecko, Izrael, Tunisko, Egypt, Madeira, Kanárské a Azorské ostrovy"),
    positive("Celý svět"),
    positive("Evropa + Turecko"),
    positive("Celý svět vyjma USA, Kanady a Austrálie", "Odpovědnost nájemce a pronajímatele: ČR."),
    positive("Celý svět vyjma USA, Kanady a Austrálie", "Odpovědnost z chovu hospodářských zvířat: ČR. Odpovědnost z provozu dronu: Evropa v geografickém smyslu, mimoevropské přímořské státy ve Středozemí a Kanárské ostrovy. Odpovědnost nájemníka a pronajímatele: ČR."),
  ],
  negligence: [statutoryStandard, statutoryStandard,
    neutral("Nedbalostní jednání (např. hrubá nedbalost) je sice ve výluce, nicméně definice nedopadá na širší okruh situací."),
    uniqaNegligence, uniqaNegligence],
  "negligence-definition": [notDefined, notDefined,
    positive("Hrubá nedbalost", "Hrubou nedbalostí je jednání (konání či opomenutí), při kterém musel být vznik škody nebo jiné újmy předpokládán nebo očekáván a pojištěný věděl, že při takovém jednání nebo opomenutí škoda nebo jiná újma nastane nebo může nastat, ale bez přiměřených důvodů spoléhal, že nenastane, případně byl s jejím vznikem srozuměn nebo mu její vznik byl lhostejný."),
    uniqaNegligenceDefinition, uniqaNegligenceDefinition],
  "negligence-position": [undefinedPosition, undefinedPosition, unchangedPosition, unchangedPosition, unchangedPosition],
  "negligence-refusal": [reductionOnly, reductionOnly, refusal, refusal, refusal],
});

const mayReduce = positive("Ano, ale pojistné plnění může být kráceno");
const notSpecified = positive("Není stanoveno");
const maximaElectricVehicles = neutral("Elektrokoloběžka a elektrokolo – vymezení a limity",
  "Elektrokoloběžkou se rozumí koloběžka, která je vybavena elektrickým pohonem a akumulátorem. Za elektrokoloběžku se pro účely tohoto pojištění nepovažuje elektrokoloběžka s maximální konstrukční rychlostí vyšší než 25 km/h nebo těžší než 25 kg a rychlejší než 14 km/h.\n\nElektrokolem (jízdním kolem s pomocným elektrickým pohonem nebo také jízdní kolo EPAC) se rozumí jízdní kolo vybavené pedály a pomocným elektromotorem podle ČSN EN 15194, které však nemůže být poháněno výlučně tímto pomocným elektromotorem, vyjma pomocného režimu při spouštění. Pomocný elektrický pohon může mít maximální výkon 1 kW a maximální konstrukční rychlost nesmí přesáhnout 25 km/h a případná montáž pohonného systému – akumulátor na jízdní kolo – si nevyžádá zásah na jeho nosných částech (vyhláška č. 153/2023 Sb.).");

// 9:06:36, 9:06:46 a 9:06:54 – Život a sport.
export const ADDITIONAL_LIFE_SPORT_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  "everyday-life": [included, included, included, included, included],
  household: [included, included, included, included, included],
  "recreational-sport": [included, included, included, included, included],
  "recreational-cycling": [included, included, included, included, included],
  "electric-vehicles": [included, included, included, included, included],
  "electric-vehicles-sidewalk": [included, mayReduce, included, mayReduce, mayReduce],
  "electric-vehicles-definition": [notSpecified, notSpecified, maximaElectricVehicles, notSpecified, notSpecified],
  "legally-held-weapons": [included, included, included, included, included],
  "health-insurer-recourse": [included, included, included, included, included],
  electronics: [included, included, excluded, included, included],
  "consequential-financial-loss": [included, included, included, included, included],
  "pure-financial-loss": [excluded, excluded, excluded, positive("Ano, limit 100 000 Kč"), positive("Ano, limit 100 000 Kč")],
});

// 9:07:34 – Chovatel, nově i rozbalená podkritéria jiných domácích zvířat.
export const ADDITIONAL_BREEDER_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  dog: [included, included, included, included, included],
  "multiple-dogs": [included, included, included, included, included],
  cats: [included, included, included, included, included],
  "other-pets": [included, included, included, included, included],
  "dangerous-animals": [included, excluded, optional, excluded, excluded],
  "commercial-animals": [excluded, excluded, excluded, excluded, excluded],
  "exotic-animals": [included, included, optional, excluded, excluded],
  livestock: [included, included, included, excluded, positive("Ano, vztahuje (limit max. 10 000 000 Kč)")],
  "animal-plant-damage": [excluded, included, positive("Ano, vztahuje (vyjma škod způsobených divokými nebo exotickými zvířaty)"), included, included],
});

// 9:08:22, doplněno rozbalenými podkritérii z 9:18:17 a 9:18:27.
export const ADDITIONAL_PROPERTY_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  "property-owner": [included, optional, optional, included, included],
  "listed-property": [included, included, included, included, included],
  "listed-property-land": [included, included, included, included, included],
  "other-properties": [included, included, optional, included, included],
  "other-home": [included, included, included, included, included],
  "other-holiday-home": [included, included, included, included, included],
  "other-farm-building": [included, excluded, excluded, excluded, excluded],
  "other-business-property": [positive("Ano, pokud je méně než 50 % plochy nemovitosti k podnikání"), excluded, excluded, excluded, excluded],
  "other-apartment-building": [included, excluded, excluded, excluded, excluded],
  "other-property-land": [included, included, included, included, included],
  "other-separate-land": [included, excluded, excluded, included, included],
  "other-property-territory": [positive("ČR"), positive("ČR"), positive("ČR"), positive("ČR"), positive("ČR")],
  "minor-building-work": [included, included, included, included, included],
  "self-build": [neutral("Ano, vztahuje (ale jen drobné stavební práce)"), included,
    positive("Ano, vztahuje", "Nemovitost se musí nacházet na stejném pozemku jako pojištěná nemovitost."), included, included],
});

const unspecifiedRisks = positive("Nebezpečí nejsou specifikována");
const fireExplosionWater = neutral("Požár, výbuch, vodovodní škoda");
const fireExplosionSmokeWater = neutral("Požár, výbuch, kouř, vodovodní škoda");
const rentalBusinessOnly = negative("Ne, musí se jednat o podnikatele, jehož podnikatelskou činností je půjčování věcí");
const limit30k = positive("Ano, limit 30 000 Kč");
const limit10m = positive("Ano, limit max. 10 000 000 Kč");
const income2m = neutral("Max. 2 000 000 Kč / rok");
const max5Addresses = negative("Ne, max. 5 míst pojištění");

// 9:09:27, 9:09:41 a 9:09:48 – Nájemce a pronajímatel.
export const ADDITIONAL_TENANCY_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  "rented-property": [included, included, included, included, included],
  "rented-property-risks": [unspecifiedRisks, unspecifiedRisks, fireExplosionWater, fireExplosionSmokeWater, fireExplosionSmokeWater],
  "rented-equipment": [excluded, excluded, excluded, included, included],
  "rented-equipment-risks": [neutral("Požár, vodovodní škoda"), excluded, excluded, fireExplosionSmokeWater, fireExplosionSmokeWater],
  "borrowed-items": [excluded, limit30k, excluded, excluded, positive("Ano, limit 100 000 Kč")],
  "item-lender": [excluded, rentalBusinessOnly, excluded, excluded, rentalBusinessOnly],
  // Prázdné organizační buňky UNIQA převádíme na stejný odkaz na podkritéria.
  "borrowed-item-types": [excluded, positive("Více informací v podkritériích"), excluded, excluded, positive("Více informací v podkritériích")],
  "borrowed-tools": [notCovered, included, notCovered, excluded, included],
  "borrowed-sports-equipment": [notCovered, included, notCovered, excluded, included],
  "borrowed-animals": [notCovered, included, notCovered, excluded, included],
  "borrowed-electronics": [notCovered, included, notCovered, excluded, positive("Pouze věci zapůjčené k výuce a studiu")],
  "borrowed-vehicle": [notCovered, notCovered, notCovered, excluded, notCovered],
  "rental-vehicle-deductible": [notCovered, limit30k, notCovered, excluded, notCovered],
  "borrowed-motorboat": [notCovered, notCovered, notCovered, excluded, notCovered],
  "borrowed-drone": [notCovered, notCovered, notCovered, excluded, notCovered],
  "borrowed-aircraft": [notCovered, notCovered, notCovered, excluded, notCovered],
  "landlord-tenant-belongings": [included,
    warning("Lze připojistit jako pojištění odpovědnosti z vlastnictví nemovitosti, limit 50 000 000 Kč"),
    included, limit10m, limit10m],
  "tenant-damage-to-landlord": [excluded, included, included, limit10m, limit10m],
  "maximum-rental-income": [positive("Není uvedeno"), positive("Není uvedeno"),
    neutral("Dvacetinásobek průměrné měsíční mzdy bez záloh na energie a služby"), income2m, income2m],
  "rental-without-address": [excluded, positive("Ano"), negative("Ne"), max5Addresses, max5Addresses],
  "landlord-territory": [excluded, positive("Celý svět"), positive("ČR"), positive("ČR"), positive("ČR")],
});

const yes = positive("Ano");
const anyAge = positive("Ano (jakéhokoliv věku a stavu)");

// 9:10:34, 9:10:41 a 9:10:47 – Spolupojištěné osoby.
export const ADDITIONAL_COINSURED_ANSWERS = createScreenshotAnswers(ADDITIONAL_PRODUCT_IDS, {
  "household-members": [yes, yes, yes, yes, yes],
  partners: [yes, yes, yes, yes, yes],
  children: [anyAge, anyAge, anyAge, anyAge, anyAge],
  "direct-relatives": [yes, yes, yes, yes, yes],
  "limited-capacity-relative": [yes, yes, yes, yes, yes],
  "other-paying-members": [yes, yes, yes, yes, yes],
  "non-paying-friends": [excluded, excluded, excluded, excluded, excluded],
  "household-helpers": [yes, excluded, yes, yes, yes],
  "helper-chores": [yes, excluded, yes, yes, yes],
  "helper-childcare": [yes, excluded, yes, yes, yes],
  "helper-pet-care": [yes, excluded, yes, yes, yes],
  "helper-property-care": [yes, excluded, yes, yes, yes],
  "helper-path-maintenance": [yes, excluded, yes, yes, yes],
  "helper-construction": [yes, excluded, yes, yes, yes],
  "contracted-helpers": [yes, excluded, yes, yes, yes],
  "contracted-helper-chores": [yes, excluded, yes, yes, yes],
  "contracted-helper-childcare": [yes, excluded, yes, yes, yes],
  "contracted-helper-pet-care": [yes, excluded, yes, yes, yes],
  "contracted-helper-property-care": [yes, excluded, yes, yes, yes],
  "contracted-helper-path-maintenance": [yes, excluded, yes, yes, yes],
  "contracted-helper-construction": [yes, excluded, yes, yes, yes],
});

import { createScreenshotAnswers, included, excluded, notCovered, optional, positive, negative, neutral, warning } from "./screenshotData";

// Třetí sada screenshotů uživatele z 20. 9. 2026.
// Pořadí sloupců je jiné než v katalogu: Pillow 3×, PVZP, Slavia 3×.
export const REMAINING_PRODUCT_IDS = [
  "pillow:zakladni-2025-09-10",
  "pillow:rozsirena-2025-09-10",
  "pillow:kompletni-2025-09-10",
  "pvzp:pojisteni-odpovednosti-2025-02-28",
  "slavia:stastny-domov-zaklad-2026-02-01",
  "slavia:stastny-domov-jistota-2026-02-01",
  "slavia:stastny-domov-jubileum-2026-02-01",
] as const;

const pillowLimit = positive("Max. 50 000 000 Kč (do 2. 3. 2026 max. 25 000 000 Kč)");
const slaviaLimit = positive("Max. 40 000 000 Kč");
const pillowEurope = positive("Evropa včetně Turecka", "Vyjma Ázerbájdžánu, Běloruska, Gruzie, Kazachstánu, Kosova, Moldavska a Ruska.");
const slaviaEurope = positive("Evropa včetně Kypru, Azorských ostrovů a Madeiry", "Vyjma Albánie, Běloruska, Kosova, Ruska a Turecka.");
const statutoryStandard = positive("Ve vztahu k nedbalostnímu jednání se užije zákonný standard.");
const notDefined = positive("Není definováno");
const undefinedPosition = positive("Není definováno, nezhoršuje.");
const unchangedPosition = positive("Definice nezhoršuje postavení pojištěného.");
const reductionOnly = positive("Pouze snížit pojistné plnění");
const refusal = negative("Ano, výluka");
const slaviaNegligence = neutral("Nedbalostní jednání (např. hrubá nedbalost) je sice ve výluce, nicméně definice nedopadá na širší okruh situací.");
const slaviaDefinition = neutral("Jednání s předpokládaným nebo očekávaným vznikem škody či újmy",
  "Jednání (konání či opomenutí), při kterém musel být vznik škody nebo jiné újmy předpokládán nebo očekáván a pojištěný věděl, že při takovém jednání nebo opomenutí škoda nebo jiná újma nastane nebo může nastat, ale bez přiměřených důvodů spoléhal, že nenastane, případně byl s jejím vznikem srozuměn.");

// 10:09:29 – Obecné. Obsah zavřených detailů limitů nebyl dodán.
export const REMAINING_GENERAL_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  "maximum-limit": [pillowLimit, pillowLimit, pillowLimit, positive("Max. 50 000 000 Kč"), slaviaLimit, slaviaLimit, slaviaLimit],
  territory: [warning("ČR"), pillowEurope, pillowEurope, positive("Evropa (možno připojistit svět)"), slaviaEurope, slaviaEurope, slaviaEurope],
  negligence: [statutoryStandard, statutoryStandard, statutoryStandard, statutoryStandard, slaviaNegligence, slaviaNegligence, slaviaNegligence],
  "negligence-definition": [notDefined, notDefined, notDefined, notDefined, slaviaDefinition, slaviaDefinition, slaviaDefinition],
  "negligence-position": [undefinedPosition, undefinedPosition, undefinedPosition, undefinedPosition, unchangedPosition, unchangedPosition, unchangedPosition],
  "negligence-refusal": [reductionOnly, reductionOnly, reductionOnly, reductionOnly, refusal, refusal, refusal],
});

const pillowCycling = positive("Ano, vztahuje (limit = dvojnásobek sjednaného základního limitu)");
const sidewalkReduction = positive("Ano, ale pojistné plnění může být kráceno");
const electricNotSpecified = positive("Není stanoveno");
// Úplné znění PVZP uživatel doplnil textem k oříznutému screenshotu.
const pvzpElectricDefinition = neutral("Do 250 W a 25 km/h",
  "Elektrokolem se rozumí kolo (resp. koloběžka) vybavené přídavným elektrickým motorem s výkonem do 250 W, jehož činnost se deaktivuje při dosažení max. rychlosti 25 km/h.");
const slaviaElectricDefinition = neutral("Do 250 W a 25 km/h",
  "Dopravní prostředky, které jsou vybaveny přídavným elektrickým motorem s maximálním výkonem max. 250 W a s maximální rychlostí 25 km/h.");

// 10:49:59 a 10:50:05 – Život a sport.
// Hlavní řádek elektrovozítek u Pillow je prázdný; odpověď nedovozujeme z podkritérií.
export const REMAINING_LIFE_SPORT_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  "everyday-life": [included, included, included, included, included, included, included],
  household: [included, included, included, included, included, included, included],
  "recreational-sport": [included, included, included, included, included, included, included],
  "recreational-cycling": [pillowCycling, pillowCycling, pillowCycling, included, included, included, included],
  "electric-vehicles": [undefined, undefined, undefined, included, optional, optional, optional],
  "electric-vehicles-sidewalk": [included, included, included, included, sidewalkReduction, sidewalkReduction, sidewalkReduction],
  "electric-vehicles-definition": [electricNotSpecified, electricNotSpecified, electricNotSpecified, pvzpElectricDefinition, slaviaElectricDefinition, slaviaElectricDefinition, slaviaElectricDefinition],
  "legally-held-weapons": [excluded, excluded, included, excluded, excluded, excluded, excluded],
  "health-insurer-recourse": [included, included, included, included, excluded, included, included],
  electronics: [excluded, included, included, included, included, included, included],
  "consequential-financial-loss": [included, included, included, included, included, included, included],
  "pure-financial-loss": [excluded, excluded, excluded, excluded, included, included, included],
});

// 10:49:16 – Chovatel, včetně rozbalených podkritérií ostatních domácích zvířat.
export const REMAINING_BREEDER_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  dog: [included, included, included, included, excluded, included, included],
  "multiple-dogs": [included, included, included, included, excluded, included, included],
  cats: [included, included, included, included, excluded, included, included],
  "other-pets": [included, included, included, included, excluded, included, included],
  "dangerous-animals": [excluded, excluded, excluded, excluded, excluded, included, included],
  "commercial-animals": [excluded, excluded, excluded, excluded, excluded, excluded, excluded],
  "exotic-animals": [excluded, excluded, excluded, excluded, excluded, included, included],
  livestock: [excluded, excluded, included, included, excluded, excluded, included],
  "animal-plant-damage": [included, included, included, excluded, excluded, excluded, excluded],
});

const czechia = positive("ČR");
const pillowMinorWork = warning("Možno připojistit (v rámci občanské odpovědnosti)");
const pillowSelfBuild = neutral("Ano, vztahuje (na práce nevyžadující speciální povolení)");
const minorWorkOnly = neutral("Ano, vztahuje (ale jen drobné stavební práce)");

// 10:12:33 a 10:12:44 – Odpovědnost u nemovitosti.
export const REMAINING_PROPERTY_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  "property-owner": [optional, optional, optional, included, optional,
    warning("Možno připojistit (vztahuje se jen na vlastnictví rekreačně obývaného objektu)"), optional],
  "listed-property": [included, included, included, included, included, included, included],
  "listed-property-land": [included, included, included, included, included, included, included],
  "other-properties": [excluded, excluded, excluded, included, included, excluded, included],
  "other-home": [excluded, excluded, excluded, included, included, excluded, included],
  "other-holiday-home": [excluded, excluded, excluded, included, excluded, excluded, optional],
  "other-farm-building": [excluded, excluded, excluded, included, excluded, excluded, excluded],
  "other-business-property": [excluded, excluded, excluded, excluded, excluded, excluded, excluded],
  "other-apartment-building": [excluded, excluded, excluded, excluded, excluded, excluded, excluded],
  "other-property-land": [excluded, excluded, excluded, included, included, excluded, included],
  "other-separate-land": [excluded, excluded, excluded, excluded, included, excluded, included],
  "other-property-territory": [excluded, excluded, excluded, czechia, czechia, excluded, czechia],
  "minor-building-work": [pillowMinorWork, pillowMinorWork, pillowMinorWork, included, included, included, included],
  "self-build": [pillowSelfBuild, pillowSelfBuild, pillowSelfBuild,
    neutral("Ano, vztahuje (ale jen na stavební práce nevyžadující odbornou způsobilost)"), minorWorkOnly, minorWorkOnly, minorWorkOnly],
});

const pillowRentalRisks = neutral("Požár, kouř, výbuch, voda z vodovodního zařízení, voda z odpadního potrubí, škody na sklech a sanitě.");
const pvzpRentalRisks = neutral("Požár, výbuch, kouř, vodovodní škoda");
const slaviaRentalRisks = neutral("Požár, výbuch, vodovodní škoda");
const rentalBusinessOnly = negative("Ne, musí se jednat o podnikatele, jehož podnikatelskou činností je půjčování věcí");
const moreInformation = positive("Více informací v podkritériích");
const notStated = positive("Není uvedeno");
const no = negative("Ne");
const pvzpAircraft = positive("Ano, nevztahuje se na létající zařízení evidovaná u Úřadu pro civilní letectví");

// 10:13:40, 10:13:50 a 10:13:56 – Nájemce a pronajímatel.
export const REMAINING_TENANCY_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  "rented-property": [optional, optional, optional, included, optional, optional, optional],
  "rented-property-risks": [pillowRentalRisks, pillowRentalRisks, pillowRentalRisks, pvzpRentalRisks, slaviaRentalRisks, slaviaRentalRisks, slaviaRentalRisks],
  "rented-equipment": [optional, optional, optional, included, excluded, excluded, excluded],
  "rented-equipment-risks": [pillowRentalRisks, pillowRentalRisks, pillowRentalRisks, pvzpRentalRisks, excluded, excluded, excluded],
  "borrowed-items": [included, included, included, included, excluded, excluded, excluded],
  "item-lender": [rentalBusinessOnly, rentalBusinessOnly, rentalBusinessOnly, excluded, excluded, excluded, excluded],
  // Organizační buňka PVZP je prázdná, jednotlivá krytí uvádíme pouze v podkritériích.
  "borrowed-item-types": [moreInformation, moreInformation, moreInformation, undefined, excluded, excluded, excluded],
  "borrowed-tools": [included, included, included, included, notCovered, notCovered, notCovered],
  "borrowed-sports-equipment": [included, included, included, included, notCovered, notCovered, notCovered],
  "borrowed-animals": [included, included, included, included, notCovered, notCovered, notCovered],
  "borrowed-electronics": [notCovered, included, included, included, notCovered, notCovered, notCovered],
  "borrowed-vehicle": [notCovered, notCovered, notCovered, excluded, notCovered, notCovered, notCovered],
  "rental-vehicle-deductible": [notCovered, notCovered, notCovered, positive("Ano, limit 20 000 Kč"), notCovered, notCovered, notCovered],
  "borrowed-motorboat": [notCovered, notCovered, notCovered,
    positive("Ano, nevztahuje se na vodní skútry a na evidovaná plavidla u Státní plavební správy"), notCovered, notCovered, notCovered],
  "borrowed-drone": [notCovered, notCovered, notCovered, pvzpAircraft, notCovered, notCovered, notCovered],
  "borrowed-aircraft": [notCovered, notCovered, notCovered, pvzpAircraft, notCovered, notCovered, notCovered],
  "landlord-tenant-belongings": [optional, optional, optional, included, excluded, excluded, excluded],
  "tenant-damage-to-landlord": [optional, optional, optional, excluded, excluded, excluded, excluded],
  "maximum-rental-income": [notStated, notStated, notStated, excluded, excluded, excluded, excluded],
  "rental-without-address": [no, no, no, excluded, excluded, excluded, excluded],
  "landlord-territory": [czechia, czechia, czechia, excluded, excluded, excluded, excluded],
});

const yes = positive("Ano");
const child26 = neutral("Ano, do 26 let věku dítěte");
const slaviaRelatives = positive("Ano, pokud nemají jinou pojistnou smlouvu");
const pillowContractedHelp = neutral("Ano (ale jen pouze příležitostná činnost s příjmem osvobozeným od daně z příjmu)");

// 10:14:36, 10:14:44 a 10:14:50 – Spolupojištěné osoby.
// Děti u Slavie a obecný řádek výpomoci PVZP jsou v podkladu prázdné; údaje nedovozujeme.
export const REMAINING_COINSURED_ANSWERS = createScreenshotAnswers(REMAINING_PRODUCT_IDS, {
  "household-members": [yes, yes, yes, yes, yes, yes, yes],
  partners: [yes, yes, yes, yes, yes, yes, yes],
  children: [child26, child26, child26, positive("Ano (jakéhokoliv věku a stavu)"), undefined, undefined, undefined],
  "direct-relatives": [yes, yes, yes, yes, slaviaRelatives, slaviaRelatives, slaviaRelatives],
  "limited-capacity-relative": [yes, yes, yes, yes, excluded, excluded, excluded],
  "other-paying-members": [yes, yes, yes, excluded, excluded, excluded, excluded],
  "non-paying-friends": [excluded, excluded, excluded, excluded, excluded, excluded, excluded],
  "household-helpers": [yes, yes, yes, undefined, yes, yes, yes],
  "helper-chores": [yes, yes, yes, yes, yes, yes, yes],
  "helper-childcare": [yes, yes, yes, yes, yes, yes, yes],
  "helper-pet-care": [yes, yes, yes, yes, yes, yes, yes],
  "helper-property-care": [yes, yes, yes, yes, yes, yes, yes],
  "helper-path-maintenance": [yes, yes, yes, yes, yes, yes, yes],
  "helper-construction": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helpers": [pillowContractedHelp, pillowContractedHelp, pillowContractedHelp, yes, yes, yes, yes],
  "contracted-helper-chores": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helper-childcare": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helper-pet-care": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helper-property-care": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helper-path-maintenance": [yes, yes, yes, yes, yes, yes, yes],
  "contracted-helper-construction": [yes, yes, yes, yes, yes, yes, yes],
});

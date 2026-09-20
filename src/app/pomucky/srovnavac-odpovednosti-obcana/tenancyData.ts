import { createScreenshotSection, included, excluded, notCovered, optional, positive, negative, neutral, warning } from "./screenshotData";
import { ADDITIONAL_TENANCY_ANSWERS } from "./additionalProductData";
import { REMAINING_TENANCY_ANSWERS } from "./remainingProductData";

const tenantInsured = positive("Ano, vztahuje (pojištěným musí být nájemce)");
const writtenAgreement = warning("Možno připojistit (podmínkou je písemná dohoda)");
const unspecifiedRisks = positive("Nebezpečí nejsou specifikována");
const rentalBusinessOnly = negative("Ne, musí se jednat o podnikatele, jehož podnikatelskou činností je půjčování věcí");
const exceptOperation = positive("Ano (vyjma škody způsobené provozem)");
const withoutLicence = positive("Ano (jen na využívání zařízení bez nutné licence)");
const borrowedItem = {
  parentId: "borrowed-item-types",
  parentLabel: "Věci (za)půjčené, vypůjčené či pronajaté",
  coverageParentId: "borrowed-items",
};
const landlordDamage = {
  parentId: "tenant-damage-to-landlord",
  parentLabel: "Pronajímatel – škoda způsobená nájemníkem",
  coverageParentId: "tenant-damage-to-landlord",
};

// Podklady uživatele z 19. 9. 2026, 18:15:27, 18:15:39 a 18:15:46.
// Zachována hodnocení i podmínky nadřazených krytí; zavřené detaily nejsou domýšleny.
export const TENANCY_SECTION = createScreenshotSection({ id: "tenancy", title: "Nájemce (nájemník) a pronajímatel", number: "05" }, [
  {
    id: "rented-property", title: "Nájemce – odpovědnost za škody na dlouhodobě pronajatých nemovitostech",
    values: [tenantInsured, optional, included, writtenAgreement, included],
  },
  {
    id: "rented-property-risks", title: "Na jaké nebezpečí se pojištění vztahuje?",
    parentId: "rented-property", parentLabel: "Dlouhodobě pronajatá nemovitost", coverageParentId: "rented-property",
    values: [positive("Nebezpečí nejsou specifikována", "Rizika musí odpovídat nebezpečím v rámci pojištění občanské odpovědnosti."), unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, unspecifiedRisks],
  },
  {
    id: "rented-equipment", title: "Nájemce – odpovědnost za škody na pronajatém vybavení v rámci dlouhodobě pronajaté nemovitosti",
    values: [tenantInsured, optional, included, writtenAgreement, included],
  },
  {
    id: "rented-equipment-risks", title: "Na jaké nebezpečí se pojištění vztahuje?",
    parentId: "rented-equipment", parentLabel: "Vybavení pronajaté nemovitosti", coverageParentId: "rented-equipment",
    values: [neutral("Požár, výbuch, voda z vodovodního zařízení, voda z odpadního potrubí"), unspecifiedRisks, unspecifiedRisks, unspecifiedRisks, neutral("Požár, výbuch, kouř, vodovodní škoda")],
  },
  {
    id: "borrowed-items", title: "Nájemce – odpovědnost za škodu na věcech (za)půjčených, vypůjčených či pronajatých (nevztahujících se k pronajaté nemovitosti)",
    values: [excluded, positive("Ano, limit 15 % ze sjednaného limitu"), included, writtenAgreement, included],
  },
  {
    id: "item-lender", title: "Může být osobou, která věc (za)půjčuje, vypůjčuje či pronajímá, kdokoliv?",
    parentId: "borrowed-items", parentLabel: "Věci (za)půjčené, vypůjčené či pronajaté", coverageParentId: "borrowed-items",
    values: [excluded, rentalBusinessOnly, positive("Ano"), positive("Ano"), rentalBusinessOnly],
  },
  {
    id: "borrowed-item-types", title: "Vztahuje se pojištění na škody způsobené na následujících věcech?",
    parentId: "borrowed-items", parentLabel: "Věci (za)půjčené, vypůjčené či pronajaté", coverageParentId: "borrowed-items",
    values: [excluded, positive("Více informací v podkritériích"), positive("Více informací v podkritériích"), positive("Více informací v podkritériích"), positive("Více informací v podkritériích")],
  },
  { id: "borrowed-tools", title: "Dílenské a jiné nářadí", ...borrowedItem, values: [notCovered, included, included, included, included] },
  { id: "borrowed-sports-equipment", title: "Sportovní náčiní a nářadí", ...borrowedItem, values: [notCovered, included, included, included, included] },
  { id: "borrowed-animals", title: "Zvířata (např. kůň zapůjčený k projížďce)", ...borrowedItem, values: [notCovered, included, included, included, included] },
  {
    id: "borrowed-electronics", title: "Mobilní telefon, tablet, notebook apod.", ...borrowedItem,
    values: [notCovered, included, positive("Ano, limit 3 000 Kč", "Pokud je základní limit alespoň 10 mil. Kč, je limit 10 000 Kč."), warning("Možno připojistit", "Nutné připojistit odpovědnost za škody na drobné elektronice."), included],
  },
  { id: "borrowed-vehicle", title: "Motorové vozidlo", ...borrowedItem, values: [notCovered, exceptOperation, notCovered, exceptOperation, notCovered] },
  {
    id: "rental-vehicle-deductible", title: "Spoluúčast z havarijního pojištění pronajatého motorového vozidla (na základě smlouvy)", ...borrowedItem,
    values: [notCovered, included, notCovered, notCovered, positive("Ano, limit 50 000 Kč")],
  },
  {
    id: "borrowed-motorboat", title: "Motorové plavidlo", ...borrowedItem,
    values: [notCovered, positive("Ano, vztahuje", "Pouze na malé plavidlo o délce max. 20 m a max. pro 12 osob nebo vodní skútr do délky 4 m."), notCovered, exceptOperation, notCovered],
  },
  { id: "borrowed-drone", title: "Dron", ...borrowedItem, values: [notCovered, positive("Ano (vztahuje se na drony do 20 kg)"), notCovered, withoutLicence, notCovered] },
  {
    id: "borrowed-aircraft", title: "Ostatní létající zařízení (např. model)", ...borrowedItem,
    values: [notCovered, positive("Ano, mimo veřejná prostranství", "Pouze mimo veřejná prostranství a plochy s častým pohybem osob, zvířat a věcí."), notCovered, withoutLicence, notCovered],
  },
  {
    id: "landlord-tenant-belongings", title: "Pronajímatel – odpovědnost za škodu na věcech nájemníka (např. praskne potrubí a vytékající voda poškodí věci nájemce)",
    values: [included, included, included, included, optional],
  },
  {
    id: "tenant-damage-to-landlord", title: "Pronajímatel – škoda způsobená nájemníkem pronajímateli na pronajaté nemovitosti",
    values: [excluded, excluded, optional, optional, excluded],
  },
  {
    id: "maximum-rental-income", title: "Jaké jsou maximální povolené roční příjmy z pronájmu pro sjednání tohoto pojištění?", ...landlordDamage,
    values: [excluded, excluded, positive("Není uvedeno"), neutral("2 000 000 Kč"), excluded],
  },
  {
    id: "rental-without-address", title: "Lze toto pojištění uzavřít bez přesné specifikace adresy nemovitosti (např. bytu)?", ...landlordDamage,
    values: [excluded, excluded, negative("Ne, max. 3 místa pojištění"), excluded, excluded],
  },
  { id: "landlord-territory", title: "Územní platnost", ...landlordDamage, values: [excluded, excluded, positive("ČR"), positive("ČR"), excluded] },
], { ...ADDITIONAL_TENANCY_ANSWERS, ...REMAINING_TENANCY_ANSWERS });

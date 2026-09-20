import { createScreenshotSection, included, excluded, optional, positive } from "./screenshotData";
import { ADDITIONAL_PROPERTY_ANSWERS } from "./additionalProductData";
import { REMAINING_PROPERTY_ANSWERS } from "./remainingProductData";

const otherProperty = {
  parentId: "other-properties",
  parentLabel: "Další nemovitosti mimo místo pojištění",
  coverageParentId: "other-properties",
};

// Podklady uživatele z 19. 9. 2026, 18:13:31 a 18:13:42.
// Prázdný organizační řádek „Pojištění se vztahuje na“ je vyjádřen vazbou podkritérií.
export const PROPERTY_SECTION = createScreenshotSection({ id: "property", title: "Odpovědnost u nemovitosti", number: "04" }, [
  {
    id: "property-owner", title: "Vlastník – odpovědnost z vlastnictví a držby nemovitosti",
    values: [included, included, included,
      positive("Ano, na jedné adrese v základním pojištění", "Jako připojištění pak u všech nemovitostí pojištěného. Nevztahuje se na krátkodobé pronájmy (např. Airbnb)."),
      positive("Ano, limit 20 % limitu pojištění odpovědnosti", "Lze navýšit až na 50 000 000 Kč."),
    ],
  },
  {
    id: "listed-property", title: "Pojištění se vztahuje na nemovitost uvedenou v pojistné smlouvě",
    parentId: "property-owner", parentLabel: "Vlastnictví a držba nemovitosti", coverageParentId: "property-owner",
    values: [included, included, included, included, included],
  },
  {
    id: "listed-property-land", title: "Pojištění se vztahuje i na pozemek, na kterém nemovitost leží",
    parentId: "listed-property", parentLabel: "Nemovitost uvedená v pojistné smlouvě", coverageParentId: "listed-property",
    values: [included, included, included, included, included],
  },
  {
    id: "other-properties", title: "Pojištění se vztahuje i na další nemovitosti ve vlastnictví pojištěného (mimo místo pojištění uvedené v pojistné smlouvě)",
    parentId: "property-owner", parentLabel: "Vlastnictví a držba nemovitosti", coverageParentId: "property-owner",
    values: [excluded, included, included, optional, included],
  },
  { id: "other-home", title: "Nemovitost k trvalému bydlení", ...otherProperty, values: [excluded, included, included, included, included] },
  { id: "other-holiday-home", title: "Rekreační stavba", ...otherProperty, values: [excluded, included, included, included, included] },
  { id: "other-farm-building", title: "Samostatná hospodářská budova", ...otherProperty, values: [excluded, included, included, excluded, included] },
  {
    id: "other-business-property", title: "Nemovitost určená k podnikání", ...otherProperty,
    values: [excluded, excluded, included, positive("Ano, pokud je méně než 50 % plochy nemovitosti k podnikání"), excluded],
  },
  { id: "other-apartment-building", title: "Bytový dům", ...otherProperty, values: [excluded, excluded, included, excluded, excluded] },
  {
    id: "other-property-land", title: "Pozemek, na kterém leží nemovitost, které se pojištění odpovědnosti týká", ...otherProperty,
    values: [excluded, included, included, included, included],
  },
  {
    id: "other-separate-land", title: "Samostatný pozemek", ...otherProperty,
    values: [excluded, excluded, included, positive("Ano, vyjma lesů, polí a vodních ploch"), excluded],
  },
  { id: "other-property-territory", title: "Územní platnost pojištění", ...otherProperty, values: [excluded, positive("ČR"), positive("ČR"), positive("ČR"), positive("ČR")] },
  {
    id: "minor-building-work", title: "Vlastník – svépomocné provádění drobných stavebních prací",
    values: [included, included, included, positive("Ano, limit max. 100 000 000 Kč"), included],
  },
  { id: "self-build", title: "Stavební činnost svépomocí", values: [excluded, included, included, excluded, excluded] },
], { ...ADDITIONAL_PROPERTY_ANSWERS, ...REMAINING_PROPERTY_ANSWERS });

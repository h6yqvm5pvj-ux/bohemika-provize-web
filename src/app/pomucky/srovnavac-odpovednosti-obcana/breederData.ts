import { createScreenshotSection, included, excluded, optional } from "./screenshotData";
import { ADDITIONAL_BREEDER_ANSWERS } from "./additionalProductData";
import { REMAINING_BREEDER_ANSWERS } from "./remainingProductData";
import { HISTORICAL_BREEDER_ANSWERS } from "./historicalBreederData";

const otherPets = { parentId: "other-pets", parentLabel: "Chov jiných domácích zvířat", coverageParentId: "other-pets" };

// Podklad uživatele z 19. 9. 2026, 18:10:50. Skrytá podkritéria první sady nebyla dodána.
export const BREEDER_SECTION = createScreenshotSection({ id: "breeder", title: "Chovatel", number: "03" }, [
  { id: "dog", title: "Chov psa", values: [included, included, included, optional, included] },
  { id: "multiple-dogs", title: "Chov více psů", values: [included, included, included, optional, included] },
  { id: "cats", title: "Chov koček", values: [included, included, included, optional, included] },
  { id: "other-pets", title: "Chov jiných domácích zvířat", values: [included, included, included, optional, included] },
  { id: "dangerous-animals", title: "Nebezpečná zvířata", ...otherPets, values: [undefined, undefined, undefined, undefined, undefined] },
  { id: "commercial-animals", title: "Zvířata k výdělečným účelům", ...otherPets, values: [undefined, undefined, undefined, undefined, undefined] },
  { id: "exotic-animals", title: "Exotická zvířata", ...otherPets, values: [undefined, undefined, undefined, undefined, undefined] },
  { id: "livestock", title: "Chov hospodářských zvířat", values: [included, included, included, optional, included] },
  {
    id: "animal-plant-damage",
    title: "Škody způsobené zvířaty na rostlinách (porostech a zemědělských kulturách)",
    values: [excluded, included, included, excluded, included],
  },
], { ...ADDITIONAL_BREEDER_ANSWERS, ...REMAINING_BREEDER_ANSWERS, ...HISTORICAL_BREEDER_ANSWERS });

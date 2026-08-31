import { describe, expect, it } from "vitest";

import { DEFAULT_DIRECTORY_CONTACTS } from "@/app/lib/contactDirectory";
import { TOOL_CATALOG } from "@/app/pomucky/toolCatalog";
import { TOOL_HUB_TOOL_KEYS } from "@/app/pomucky/toolHub";

import {
  findContactSearchResults,
  findToolSearchResults,
} from "./globalSearchData";

describe("globalSearchData", () => {
  it("obsahuje v katalogu každou pomůcku právě jednou", () => {
    const catalogKeys = TOOL_CATALOG.map((tool) => tool.key);
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
    expect([...catalogKeys].sort()).toEqual([...TOOL_HUB_TOOL_KEYS].sort());
  });

  it("najde kontakt i při opačném pořadí hledaných slov", () => {
    const results = findContactSearchResults(
      DEFAULT_DIRECTORY_CONTACTS,
      "storno Allianz",
    );

    expect(results.map((contact) => contact.id)).toContain("allianz-storno");
  });

  it("hledá také v osobách, rolích a e-mailových adresách", () => {
    expect(
      findContactSearchResults(DEFAULT_DIRECTORY_CONTACTS, "Eliška KAM")[0]?.id,
    ).toBe("allianz-eliska-stastna");
    expect(
      findContactSearchResults(DEFAULT_DIRECTORY_CONTACTS, "podporasever")[0]?.id,
    ).toBe("kooperativa");
  });

  it("najde pomůcky z úplného katalogu bez ohledu na diakritiku", () => {
    expect(findToolSearchResults("nahrada smlouvy")[0]?.key).toBe(
      "nahrada-smlouvy",
    );
    expect(findToolSearchResults("proklepka vozidla")[0]?.key).toBe(
      "proklepka-vozidla",
    );
  });
});

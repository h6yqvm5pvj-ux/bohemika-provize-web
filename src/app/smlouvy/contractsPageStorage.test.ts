// @vitest-environment happy-dom
import { clearPrivateMemory, privateMemory } from "@/app/lib/privateMemory";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyContractFilterSelection } from "./contractFilterSelection";
import { CONTRACTS_VIEW_STATE_KEY, readContractsViewState, writeContractsViewState } from "./contractsPageStorage";

const email = "owner@example.test";
beforeEach(() => { sessionStorage.clear(); clearPrivateMemory(); });
describe("saved contract position filters", () => {
  it("restores multiple positions together with other filters and scroll position", () => {
    writeContractsViewState(email, { ...emptyContractFilterSelection(), showTeam: false, searchText: "Novák", scrollY: 640,
      selectedPositions: ["poradce2", "manazer4"], selectedInstitutions: ["cpp"] });
    expect(readContractsViewState(email)).toMatchObject({ selectedPositions: ["poradce2", "manazer4"], selectedInstitutions: ["cpp"], scrollY: 640 });
    expect(readContractsViewState("other@example.test")).toBeNull();
  });

  it("validates in-memory views and ignores duplicate or unknown positions", () => {
    const key = `${CONTRACTS_VIEW_STATE_KEY}:${email}`;
    privateMemory.setItem(key, JSON.stringify({ selectedCategories: ["auto"] }));
    expect(readContractsViewState(email)).toMatchObject({ selectedPositions: [], selectedCategories: ["auto"] });
    privateMemory.setItem(key, JSON.stringify({ selectedPositions: ["invalid", "poradce2", "poradce2", null] }));
    expect(readContractsViewState(email)?.selectedPositions).toEqual(["poradce2"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  buildUniversalTerminationPdfFilename,
  formatLocalDateForTerminationLetter,
  formatLocalDateInput,
  getMissingUniversalTerminationFields,
  getTerminationReasonsForSelection,
  getUniversalLetterDefinition,
  getUniversalLetterForSelection,
  getUniversalTerminationReasons,
  isTravelTerminationProduct,
  shouldShowContractTerminationAction,
} from "./universalTermination";

describe("formatLocalDateInput", () => {
  it("formats the current local calendar day for a date input", () => {
    expect(formatLocalDateInput(new Date(2026, 7, 26, 23, 45))).toBe(
      "2026-08-26"
    );
  });
});

describe("formatLocalDateForTerminationLetter", () => {
  it("formátuje datum podpisu jako DD . MM . RRRR", () => {
    expect(
      formatLocalDateForTerminationLetter(new Date(2026, 7, 26, 23, 45)),
    ).toBe("26 . 08 . 2026");
  });
});

describe("getMissingUniversalTerminationFields", () => {
  const completeFields = {
    contractNumber: "123456789",
    policyholderName: "Testovací klient",
    personalId: "identifikátor",
    email: "klient@example.cz",
    place: "Praha",
    signedDate: "31 . 08 . 2026",
  };

  it("nevrátí chybu pro kompletní důležité údaje", () => {
    expect(getMissingUniversalTerminationFields(completeFields)).toEqual([]);
  });

  it("najde prázdná důležitá pole", () => {
    expect(
      getMissingUniversalTerminationFields({
        ...completeFields,
        personalId: " ",
        place: "",
      }).map((item) => item.key),
    ).toEqual(["personalId", "place"]);
  });

  it("vyžaduje text pouze u varianty s jiným důvodem", () => {
    expect(getMissingUniversalTerminationFields(completeFields)).toEqual([]);
    expect(
      getMissingUniversalTerminationFields(completeFields, true).map(
        (item) => item.key,
      ),
    ).toEqual(["otherReason"]);
  });
});

describe("buildUniversalTerminationPdfFilename", () => {
  it("sestaví bezpečný název z produktu a jména pojistníka", () => {
    expect(
      buildUniversalTerminationPdfFilename("Allianz Auto", "Jan Novák"),
    ).toBe("vypoved_allianz_auto_jan_novak.pdf");
  });

  it("použije obecné hodnoty, pokud produkt nebo jméno chybí", () => {
    expect(buildUniversalTerminationPdfFilename("", " ")).toBe(
      "vypoved_produkt_klient.pdf",
    );
  });
});

describe("getUniversalTerminationReasons", () => {
  it("offers the two standard variants for life insurance", () => {
    expect(getUniversalTerminationReasons("life").map((item) => item.id)).toEqual([
      "anniversary",
      "twoMonths",
    ]);
  });

  it("offers all universal variants for non-life insurance", () => {
    expect(
      getUniversalTerminationReasons("nonLife").map((item) => item.id)
    ).toEqual(["periodEnd", "twoMonths", "postClaim", "otherReason"]);
  });

  it("nabídne dohodu pouze pro životní pojištění ČPP", () => {
    expect(
      getTerminationReasonsForSelection("life", "ČPP").map((item) => item.id),
    ).toEqual(["anniversary", "twoMonths", "agreement"]);
    expect(
      getTerminationReasonsForSelection("life", "Kooperativa").map(
        (item) => item.id,
      ),
    ).toEqual(["anniversary", "twoMonths"]);
  });

  it.each(["cppcestovko", "koopcestovko", "axacestovko"] as const)(
    "nabídne u cestovního produktu %s pouze výpověď do dvou měsíců",
    (product) => {
      expect(isTravelTerminationProduct(product)).toBe(true);
      expect(
        getTerminationReasonsForSelection("nonLife", "ČPP", product),
      ).toEqual([
        {
          id: "twoMonths",
          label: "Do 2 měsíců od uzavření s 8 denní výpovědní lhůtou",
        },
      ]);
    },
  );

  it("nepovažuje zdravotní pojištění cizinců za cestovní produkt", () => {
    expect(isTravelTerminationProduct("maxcizinkomplex")).toBe(false);
  });

  it("zobrazí výpověď cestovního pojištění pouze před jeho počátkem", () => {
    expect(
      shouldShowContractTerminationAction({
        product: "cppcestovko",
        policyStartDay: "2026-09-01",
        today: "2026-08-31",
      }),
    ).toBe(true);
    expect(
      shouldShowContractTerminationAction({
        product: "cppcestovko",
        policyStartDay: "2026-08-31",
        today: "2026-08-31",
      }),
    ).toBe(false);
    expect(
      shouldShowContractTerminationAction({
        product: "cppcestovko",
        policyStartDay: "2026-08-30",
        today: "2026-08-31",
      }),
    ).toBe(false);
    expect(
      shouldShowContractTerminationAction({
        product: "cppcestovko",
        policyStartDay: "",
        today: "2026-08-31",
      }),
    ).toBe(false);
  });

  it("ponechá tlačítko u necestovních produktů beze změny", () => {
    expect(
      shouldShowContractTerminationAction({
        product: "domex",
        policyStartDay: "",
        today: "2026-08-31",
      }),
    ).toBe(true);
  });
});

describe("getUniversalLetterForSelection", () => {
  it.each([
    "Kooperativa",
    "Allianz",
    "UNIQA",
    "ČSOB",
    "Generali",
    "MetLife",
    "NN",
    "Maxima",
    "Simplea",
  ])("creates the universal letter for %s", (insurer) => {
    expect(
      getUniversalLetterForSelection({
        insurer,
        insuranceType: "nonLife",
        reason: "twoMonths",
      })
    ).not.toBeNull();
  });

  it("keeps ČPP outside the universal workflow", () => {
    expect(
      getUniversalLetterForSelection({
        insurer: "ČPP",
        insuranceType: "life",
        reason: "twoMonths",
      })
    ).toBeNull();
  });

  it("umožní univerzální výpověď pro neživotní smlouvu ČPP", () => {
    expect(
      getUniversalLetterForSelection({
        insurer: "ČPP",
        insuranceType: "nonLife",
        reason: "periodEnd",
      }),
    ).not.toBeNull();
  });

  it("rejects a reason that does not belong to the selected insurance type", () => {
    expect(
      getUniversalLetterForSelection({
        insurer: "Allianz",
        insuranceType: "life",
        reason: "postClaim",
      })
    ).toBeNull();
  });

  it.each([
    "Kooperativa",
    "Allianz",
    "UNIQA",
    "ČSOB",
    "Generali",
    "MetLife",
    "NN",
    "Maxima",
    "Simplea",
  ])("uses a monthly anniversary for %s life insurance", (insurer) => {
    expect(
      getUniversalLetterForSelection({
        insurer,
        insuranceType: "life",
        reason: "anniversary",
      })
    ).toMatchObject({
      calculator: "monthlyAnniversary",
      terminationSentence:
        "K nejbližšímu měsíčnímu výročí s 6 týdenní výpovědní lhůtou.",
    });
  });

  it("keeps an annual period-end calculation for non-life insurance", () => {
    expect(
      getUniversalLetterForSelection({
        insurer: "Allianz",
        insuranceType: "nonLife",
        reason: "periodEnd",
      })
    ).toMatchObject({ calculator: "annualAnniversary" });
  });
});

describe("getUniversalLetterDefinition", () => {
  it("defines every life anniversary as monthly", () => {
    expect(getUniversalLetterDefinition("anniversary")).toMatchObject({
      calculator: "monthlyAnniversary",
      terminationSentence:
        "K nejbližšímu měsíčnímu výročí s 6 týdenní výpovědní lhůtou.",
    });
  });

  it("always adds the refund account sentence to the two-month variant", () => {
    expect(getUniversalLetterDefinition("twoMonths")).toMatchObject({
      calculator: "twoMonths",
      refundAccountSentence:
        "Případný přeplatek na pojistném prosím zaslat na účet:",
    });
  });

  it("provides content for every universal reason", () => {
    for (const reason of [
      "anniversary",
      "periodEnd",
      "twoMonths",
      "postClaim",
      "otherReason",
    ] as const) {
      expect(getUniversalLetterDefinition(reason)).not.toBeNull();
    }
  });

  it("does not create a universal letter for the ČPP-only agreement", () => {
    expect(getUniversalLetterDefinition("agreement")).toBeNull();
  });
});

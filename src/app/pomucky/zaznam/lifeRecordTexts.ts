export type ClientGender = "male" | "female";

export const IMPACT_HEADING_PREFIX = "[[heading]]:";

function buildLifeRecordTexts(gender: ClientGender) {
  const female = gender === "female";
  const client = female ? "klientka" : "klient";
  const Client = female ? "Klientka" : "Klient";
  const informed = female ? "byla seznámena" : "byl seznámen";
  const warned = female ? "byla upozorněna" : "byl upozorněn";
  const possessive = female ? "její" : "jeho";
  const recipient = female ? "jí" : "mu";
  const insured = female ? "pojištěné" : "pojištěného";
  const comparison = (contract: string, capitalized = false) =>
    `${capitalized ? Client : client} ${informed} s konkrétním porovnáním a rozdíly mezi nastavením ${possessive} stávající a ${contract} smlouvy, po předložení modelace ke stávající smlouvě ${recipient} byla k posouzení rozdílů před sjednáním nové smlouvy odeslána na ${possessive} mailovou adresu modelace nová.`;
  const comparisonConclusion = (capitalized = false) =>
    `${capitalized ? "Na" : "na"} základě porovnání modelací ${client} ${female ? "vyhodnotila" : "vyhodnotil"} novou variantu jako odpovídající ${female ? "jejím" : "jeho"} aktuálním potřebám.`;

  return {
    clientAccusative: female ? "klientku" : "klienta",
    clientInstrumental: female ? "klientkou" : "klientem",
    customerCapitalized: female ? "Zákaznice" : "Zákazník",
    customerGenitive: female ? "zákaznice" : "zákazníka",
    mandatoryImpacts: [
      `${Client} ${informed} s rozsahem krytí, výší pojistných částek a pojistného, s hlavními výlukami/čekacími dobami a principem likvidace pojistné události dle pojistných podmínek, doporučení pravidelné aktualizace smlouvy a nutnosti hlásit změny jako například změna povolání.`,
    ],
    additionalRequirement:
      `${Client} ${female ? "vyžadovala" : "vyžadoval"} vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění.`,
    discrepanciesInstruction:
      `Pokud byly po ocenění zdravotního stavu ${female ? "klientce" : "klientovi"} stanoveny RIZIKOVÉ PŘIRÁŽKY nebo VÝLUKY, uveď je zde.`,
    existingContract:
      `Protože jsi zvolil, že ${client} má již smlouvu se stejným pojistným zájmem, uveď, že ${client} má již uzavřenou smlouvu / smlouvy životního pojištění u pojišťovny ______ a co s nimi má v plánu. Např.: ${Client} má již uzavřenou smlouvu ŽP u pojišťovny Kooperativa a.s., ${client} ji chce vypovědět.`,
    invalidityDeclined:
      `${female ? "Klientce" : "Klientovi"} bylo vysvětleno, proč by ${female ? "měla" : "měl"} mít připojištěnou invaliditu, přesto si ji nepřeje.`,
    lowInvalidityAmount:
      `${Client} ${warned}, že požadované částky na invaliditu mohou být nedostačující.`,
    criticalIllness:
      `${Client} ${warned}, že se připojištění Závažná onemocnění a poranění vztahuje pouze na diagnózy uvedené v pojistných podmínkách.`,
    seriousIllness:
      `${Client} ${warned}, že se připojištění Vážná onemocnění (Pro něj / Pro ni) vztahuje pouze na diagnózy uvedené v pojistných podmínkách.`,
    dailyBenefitsIncome: (list: string) =>
      `${Client} požaduje následující denní dávky: ${list} a ${informed} s tím, že při pojistné události je nutné doložit příjem, dále ${informed} s tabulkou maximálních pojistných částek denního odškodného ve vztahu k příjmu.`,
    healthDisclosure:
      `${Client} ${female ? "byla poučena" : "byl poučen"} o povinnosti uvádět pravdivé a úplné informace ve zdravotním dotazníku a o možných důsledcích nepravdivých údajů (krácení/odmítnutí plnění).`,
    changeExistingContractHeadingOne: `${IMPACT_HEADING_PREFIX}Dopady na změnu/vyjmutí připojištění bez ukončení stávající smlouvy:`,
    changeExistingContractHeadingTwo: `${IMPACT_HEADING_PREFIX}Dopady na změnu/vyjmutí připojištění ze stávající smlouvy z důvodu sjednání připojištění v nové pojistné smlouvě:`,
    changeExistingContractImpactsOne: [
      "ukončení pojistného krytí a nepřipsání bonusů definovaných v pojistných podmínkách.",
    ],
    changeExistingContractImpactsTwo: [
      "uplatnění nové čekací doby pro nárok na pojistné plnění z některých pojištěných rizik.",
      `nové oceňování zdravotního stavu ${insured}, které může znamenat zhoršení podmínek v rámci nově sjednaného pojištění.`,
      `vyšší rizikové pojistné s ohledem na věk ${insured}.`,
      comparison("nové navrhované"),
      comparisonConclusion(),
    ],
    refreshHeading: `${IMPACT_HEADING_PREFIX}Refresh / Renovace - S čím ${female ? "byla klientka seznámena" : "byl klient seznámen"}?`,
    refreshImpacts: [
      "přechod na nové pojistné podmínky.",
      "uplatnění nové čekací doby pro nárok na pojistné plnění z navýšených nebo nově zahrnutých pojištěných rizik.",
      `nové oceňování zdravotního stavu ${insured}.`,
      `vyšší rizikové pojistné s ohledem na věk a zdravotní ocenění ${insured} a tím i vyšší celkově pravidelně placené pojistné.`,
      "ukončení pravidelně připisovaných bonusů dle původních pojistných podmínek.",
      "nemožnost sjednat některá z původních připojištění (viz. modelace pojištění „Náhled původní smlouvy“).",
      "v případě volby daňově neodečitatelné náhrady (Refreshe/Renovace) povinnost dodanění uplatněných odpočtů zaplaceného pojistného od základu daně z příjmů, včetně případných příspěvků zaměstnavatele, pokud dojde k porušení podmínek pro tyto odpočty.",
      comparison("nově nahrazované"),
      comparisonConclusion(),
    ],
    terminationLabel: "Výpověď stávající smlouvy z důvodu sjednání nové",
    terminationImpact: [
      `Protože ${client} požaduje vypovězení aktuální smlouvy a sjednání nové, ${informed} s následujícími dopady z ukončení: opětovná úhrada počátečních nákladů na sjednání pojištění, uplatnění nových čekacích dob pro nárok na pojistné plnění z některých pojištěných rizik, nové oceňování zdravotního stavu ${insured}, které může znamenat zhoršení podmínek v rámci nově sjednaného pojištění v podobě výluk nebo rizikových přirážek za zdravotní stav, vyšší rizikové pojistné s ohledem na věk ${insured} a zdravotní stav a tím i vyšší celkově pravidelně placené pojistné.`,
      `${comparison("nové navrhované", true)} ${comparisonConclusion(true)}`,
    ].join("\n\n"),
  };
}

const LIFE_RECORD_TEXTS = {
  male: buildLifeRecordTexts("male"),
  female: buildLifeRecordTexts("female"),
};

export function getLifeRecordTexts(gender?: ClientGender) {
  // Older drafts without a gender keep their original wording.
  return LIFE_RECORD_TEXTS[gender === "female" ? "female" : "male"];
}

"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  PRODUCT_CAPABILITIES,
  type CapabilityEntry,
  type ProductKey,
} from "../productCapabilities";

type LifeResultInput = {
  hasInvalidity: boolean;
  totalInvalidity: number;
  hasCriticalIllness: boolean;
  hasSeriousIllness: boolean;
  hasExistingContract?: boolean;
  isChangeOnExistingContract?: boolean;
  isRefreshOrRenovation?: boolean;
  isContractTerminationDueToNewOne?: boolean;
  selectedBenefits?: SelectedBenefit[];
};

type SelectedBenefit =
  | {
      key: "death" | "terminal" | "extraDeath" | "survivorPension";
      amount?: number;
    }
  | {
      key: "waiver";
      invalidity: boolean;
      scope?: "twoAndThree" | "threeOnly";
      jobLoss: boolean;
    }
  | {
      key: "invalidity";
      degrees: "all" | "twoAndThree" | "threeOnly";
      amount1?: number;
      amount2?: number;
      amount3?: number;
      type: "constant" | "linear" | "interest";
    }
  | {
      key: "criticalIllness";
      amount?: number;
      repeat?: boolean;
    }
  | {
      key: "seriousIllnessHim" | "seriousIllnessHer";
      amount?: number;
    }
  | {
      key:
        | "diabetes"
        | "vaccination"
        | "deathAccident"
        | "bodilyInjury"
        | "healthSocial"
        | "assistedReproduction"
        | "careDependence"
        | "fullCare"
        | "specialAid"
        | "childOperation"
        | "childrenAccident";
      amount?: number;
      extra?: string;
    }
  | {
      key: "permanentInjury";
      amount?: number;
      progress: "none" | "x4" | "x5" | "x10";
      from: "from0" | "from0001" | "from05" | "from10";
    }
  | {
      key: "dailyAllowance";
      amount?: number;
      from: "from1" | "from22" | "from29";
      progress: "none" | "with";
    }
  | {
      key: "sickLeave";
      amount?: number;
      from: "day15" | "day29" | "day57" | "day60";
      variant: "retroFrom1" | "nonRetro";
      accident: boolean;
      illness: boolean;
    }
  | {
      key: "hospitalization";
      accident: boolean;
      illness: boolean;
      progressive: boolean;
      amountAccident?: number;
      amountIllness?: number;
    };

function findCapability(entries: CapabilityEntry[], key: CapabilityEntry["key"]) {
  return entries.find((e) => e.key === key);
}

function supportsBenefit(
  benefit: SelectedBenefit,
  entries: CapabilityEntry[]
): boolean {
  switch (benefit.key) {
    case "death":
      return !!findCapability(entries, "death");
    case "terminal":
      return !!findCapability(entries, "terminal");
    case "waiver":
      if (benefit.jobLoss && !findCapability(entries, "waiverJobLoss")) {
        return false;
      }
      if (benefit.invalidity && !findCapability(entries, "waiverInvalidity")) {
        return false;
      }
      return benefit.jobLoss || benefit.invalidity;
    case "invalidity":
      return !!findCapability(entries, "invalidity");
    case "criticalIllness":
      return !!findCapability(entries, "criticalIllness");
    case "seriousIllnessHim":
    case "seriousIllnessHer":
      return !!findCapability(entries, "seriousIllness");
    case "diabetes":
      return !!findCapability(entries, "diabetes");
    case "vaccination":
      return !!findCapability(entries, "vaccination");
    case "deathAccident":
      return !!findCapability(entries, "deathAccident");
    case "permanentInjury": {
      const cap = findCapability(entries, "permanentInjury");
      if (!cap?.permanentInjury) return false;
      const okProgress = cap.permanentInjury.progressions.includes(
        benefit.progress
      );
      const okThreshold =
        cap.permanentInjury.thresholds.includes(benefit.from) ||
        // tolerujeme from0001 jako from0 (Kooperativa umí od 0 %)
        (benefit.from === "from0001" &&
          cap.permanentInjury.thresholds.includes("from0"));
      return okProgress && okThreshold;
    }
    case "dailyAllowance": {
      const cap = findCapability(entries, "dailyAllowance");
      if (!cap?.dailyAllowance) return false;
      return (
        cap.dailyAllowance.starts.includes(benefit.from) &&
        cap.dailyAllowance.progressions.includes(benefit.progress)
      );
    }
    case "bodilyInjury":
      return !!findCapability(entries, "bodilyInjury");
    case "sickLeave": {
      const cap = findCapability(entries, "sickLeave");
      if (!cap?.sickLeave) return false;
      return cap.sickLeave.options.some((opt) => {
        if (opt.start !== benefit.from) return false;
        if (benefit.variant === "retroFrom1") {
          if (benefit.accident && !opt.allowRetroAccident) return false;
          if (benefit.illness && !opt.allowRetroIllness) return false;
        } else {
          if (benefit.accident && !opt.allowNonRetroAccident) return false;
          if (benefit.illness && !opt.allowNonRetroIllness) return false;
        }
        return true;
      });
    }
    case "hospitalization": {
      const cap = findCapability(entries, "hospitalization");
      if (!cap?.hospitalization) return false;
      if (benefit.accident && !cap.hospitalization.accident) return false;
      if (benefit.illness && !cap.hospitalization.illness) return false;
      return true;
    }
    case "healthSocial":
      return !!findCapability(entries, "healthSocial");
    case "childOperation":
      return !!findCapability(entries, "childOperation");
    case "childrenAccident":
      return !!findCapability(entries, "childrenAccident");
    case "assistedReproduction":
      return !!findCapability(entries, "assistedReproduction");
    case "careDependence":
      return !!findCapability(entries, "careDependence");
    case "fullCare":
      return !!findCapability(entries, "fullCare");
    case "specialAid":
      return !!findCapability(entries, "specialAid");
    case "extraDeath":
    case "survivorPension":
      // Tyto doplňky zatím nevyhodnocujeme podle schopností → vynecháme
      return false;
    default:
      return false;
  }
}

function describeBenefit(benefit: SelectedBenefit): string | null {
  switch (benefit.key) {
    case "death":
      return "Smrt";
    case "terminal":
      return "Smrt – terminální stádium";
    case "waiver": {
      const parts: string[] = [];
      if (benefit.invalidity) {
        parts.push(
          benefit.scope === "threeOnly"
            ? "zproštění při invaliditě (3. stupeň)"
            : "zproštění při invaliditě (2. a 3. stupeň)"
        );
      }
      if (benefit.jobLoss) {
        parts.push("zproštění při ztrátě zaměstnání");
      }
      if (parts.length === 0) return null;
      return `Zproštění od placení pojistného – ${parts.join(", ")}`;
    }
    case "invalidity":
      return "Invalidita";
    case "criticalIllness":
      return "Závažná onemocnění a poranění";
    case "seriousIllnessHim":
      return "Vážná onemocnění – Pro něj";
    case "seriousIllnessHer":
      return "Vážná onemocnění – Pro ni";
    case "diabetes":
      return "Cukrovka a její komplikace";
    case "vaccination":
      return "Závažné následky očkování";
    case "deathAccident":
      return "Smrt úrazem";
    case "permanentInjury": {
      const progressLabel =
        benefit.progress === "none"
          ? "bez progrese"
          : `${benefit.progress.replace("x", "")}× progrese`;
      const fromLabel =
        benefit.from === "from0001"
          ? "plnění od 0,001 %"
          : benefit.from === "from0"
          ? "plnění od 0 %"
          : benefit.from === "from05"
          ? "plnění od 0,5 %"
          : "plnění od 10 %";
      return `Trvalé následky úrazu ${progressLabel}, ${fromLabel}`;
    }
    case "dailyAllowance": {
      const fromLabel =
        benefit.from === "from1"
          ? "od 1. dne"
          : benefit.from === "from22"
          ? "od 22. dne"
          : "od 29. dne";
      const prog = benefit.progress === "with" ? "s progresí" : "bez progrese";
      return `Denní odškodné po úrazu ${fromLabel}, ${prog}`;
    }
    case "bodilyInjury": {
      const fromLabel =
        benefit.extra === "from6" ? "plnění od 6 %" : "plnění od 0 %";
      return `Tělesné poškození (${fromLabel})`;
    }
    case "sickLeave": {
      const startLabel =
        benefit.from === "day15"
          ? "od 15. dne"
          : benefit.from === "day29"
          ? "od 29. dne"
          : benefit.from === "day57"
          ? "od 57. dne"
          : "od 60. dne";
      const retroLabel =
        benefit.variant === "retroFrom1" ? "se zpětným plněním" : "bez zpětného plnění";
      const causes =
        benefit.accident && benefit.illness
          ? "úraz i nemoc"
          : benefit.accident
          ? "úraz"
          : benefit.illness
          ? "nemoc"
          : "";
      const causeSuffix = causes ? ` (${causes})` : "";
      return `Pracovní neschopnost ${startLabel}, ${retroLabel}${causeSuffix}`;
    }
    case "hospitalization": {
      const parts: string[] = [];
      if (benefit.accident) parts.push("úraz");
      if (benefit.illness) parts.push("nemoc");
      const prog = benefit.progressive ? ", progresivní plnění" : "";
      return `Hospitalizace (${parts.join(" + ")}${prog})`;
    }
    case "healthSocial":
      return "Zdravotní a sociální asistence";
    case "childOperation":
      return "Operace dítěte s vrozenou vadou";
    case "childrenAccident":
      return "Připojištění dětí v rámci úrazového pojištění dospělé osoby";
    case "assistedReproduction":
      return "Náklady asistované reprodukce";
    case "careDependence":
      return "Závislost na péči II.–IV. stupně";
    case "fullCare":
      return "Celodenní ošetřování pojištěného";
    case "specialAid":
      return "Příspěvek na pořízení zvláštní pomůcky";
    default:
      return null;
  }
}

function buildRecommendation(
  productKey: ProductKey,
  selected: SelectedBenefit[]
): string | null {
  const capability = PRODUCT_CAPABILITIES[productKey];
  const texts: string[] = [];

  selected.forEach((benefit) => {
    // Speciální případ: Kooperativa FLEXI umí u PN od 15. dne zpětně jen pro úraz.
    if (
      productKey === "kooperativaFlexi" &&
      benefit.key === "sickLeave" &&
      benefit.from === "day15" &&
      benefit.variant === "retroFrom1" &&
      benefit.accident &&
      benefit.illness
    ) {
      texts.push(
        "Pracovní neschopnost od 15. dne, se zpětným plněním pouze pro úraz."
      );
      return;
    }

    if (supportsBenefit(benefit, capability.entries)) {
      let t = describeBenefit(benefit);
      if (
        productKey === "kooperativaFlexi" &&
        benefit.key === "permanentInjury" &&
        benefit.from === "from0001" &&
        t?.includes("0,001 %")
      ) {
        t = t.replace("0,001 %", "0 %");
      }
      if (t) texts.push(t);
    }
  });

  if (texts.length === 0) return null;
  return `Pojišťovna umožňuje pojistit rizika: ${texts.join(", ")}.`;
}

const MANDATORY_IMPACT_TEXTS: string[] = [
  "Klient byl seznámen s rozsahem krytí, výší pojistných částek a pojistného, s hlavními výlukami/čekacími dobami a principem likvidace pojistné události dle pojistných podmínek, doporučení pravidelné aktualizace smlouvy a nutnosti hlásit změny jako například změna povolání.",
];
const EXISTING_CONTRACT_EXTRA_TEXT =
  "Protože jsi zvolil, že klient má již smlouvu se stejným pojistným zájmem, uveď, že klient má již uzavřenou smlouvu / smlouvy životního pojištění u pojišťovny ______ a co s nimi má v plánu. Např.: Klient má již uzavřenou smlouvu ŽP u pojišťovny Kooperativa a.s., klient ji chce vypovědět.";
const IMPACT_HEADING_PREFIX = "[[heading]]:";
const CHANGE_EXISTING_CONTRACT_HEADING_ONE = `${IMPACT_HEADING_PREFIX}Dopady na změnu/vyjmutí připojištění bez ukončení stávající smlouvy:`;
const CHANGE_EXISTING_CONTRACT_HEADING_TWO = `${IMPACT_HEADING_PREFIX}Dopady na změnu/vyjmutí připojištění ze stávající smlouvy z důvodu sjednání připojištění v nové pojistné smlouvě:`;
const CHANGE_EXISTING_CONTRACT_IMPACT_LINES_ONE: string[] = [
  "ukončení pojistného krytí a nepřipsání bonusů definovaných v pojistných podmínkách.",
];
const CHANGE_EXISTING_CONTRACT_IMPACT_LINES_TWO: string[] = [
  "uplatnění nové čekací doby pro nárok na pojistné plnění z některých pojištěných rizik.",
  "nové oceňování zdravotního stavu pojištěného, které může znamenat zhoršení podmínek v rámci nově sjednaného pojištění.",
  "vyšší rizikové pojistné s ohledem na věk pojištěného.",
  "klient byl seznámen s konkrétním porovnáním a rozdíly mezi nastavením jeho stávající a nové navrhované smlouvy, po předložení modelace ke stávající smlouvě mu byla k posouzení rozdílů před sjednáním nové smlouvy odeslána na jeho mailovou adresu modelace nová.",
  "na základě porovnání modelací klient vyhodnotil novou variantu jako odpovídající jeho aktuálním potřebám.",
];
const REFRESH_RENOVATION_HEADING = `${IMPACT_HEADING_PREFIX}Refresh / Renovace - S čím byl klient seznámen?`;
const REFRESH_RENOVATION_IMPACT_LINES: string[] = [
  "přechod na nové pojistné podmínky.",
  "uplatnění nové čekací doby pro nárok na pojistné plnění z navýšených nebo nově zahrnutých pojištěných rizik.",
  "nové oceňování zdravotního stavu pojištěného.",
  "vyšší rizikové pojistné s ohledem na věk a zdravotní ocenění pojištěného a tím i vyšší celkově pravidelně placené pojistné.",
  "ukončení pravidelně připisovaných bonusů dle původních pojistných podmínek.",
  "nemožnost sjednat některá z původních připojištění (viz. modelace pojištění „Náhled původní smlouvy“).",
  "v případě volby daňově neodečitatelné náhrady (Refreshe/Renovace) povinnost dodanění uplatněných odpočtů zaplaceného pojistného od základu daně z příjmů, včetně případných příspěvků zaměstnavatele, pokud dojde k porušení podmínek pro tyto odpočty.",
  "klient byl seznámen s konkrétním porovnáním a rozdíly mezi nastavením jeho stávající a nově nahtazované smlouvy, po předložení modelace ke stávající smlouvě mu byla k posouzení rozdílů před sjednáním nové smlouvy odeslána na jeho mailovou adresu modelace nová.",
  "na základě porovnání modelací klient vyhodnotil novou variantu jako odpovídající jeho aktuálním potřebám",
];
const TERMINATION_DUE_TO_NEW_CONTRACT_HEADING = `${IMPACT_HEADING_PREFIX}Ukončení z důvodu sjednání nové pojistné smlouvy:`;
const TERMINATION_DUE_TO_NEW_CONTRACT_IMPACT_LINES: string[] = [
  "opětovná úhrada počátečních nákladů na sjednání pojištění.",
  "uplatnění nových čekacích dob pro nárok na pojistné plnění z některých pojištěných rizik.",
  "nové oceňování zdravotního stavu pojištěného, které může znamenat zhoršení podmínek v rámci nově sjednaného pojištění v podobě výluk nebo rizikových přirážek za zdravotní stav.",
  "vyšší rizikové pojistné s ohledem na věk pojištěného a zdravotní stav a tím i vyšší celkově pravidelně placené pojistné.",
  "klient byl seznámen s konkrétním porovnáním a rozdíly mezi nastavením jeho stávající a nové navrhované smlouvy, po předložení modelace ke stávající smlouvě mu byla k posouzení rozdílů před sjednáním nové smlouvy odeslána na jeho mailovou adresu modelace nová.",
  "na základě porovnání modelací klient vyhodnotil novou variantu jako odpovídající jeho aktuálním potřebám.",
];

export default function RecordResultsPage() {
  const router = useRouter();
  const [lines, setLines] = useState<string[] | null>(null);
  const [additional, setAdditional] = useState<string[] | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const [productRecs, setProductRecs] = useState<
    { label: string; text: string | null }[]
  >([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      window.setTimeout(() => setCopiedText(null), 1500);
    } catch (err) {
      console.error("Copy failed", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem("lifeRecordResultInput");
    if (!raw) {
      setLines([...MANDATORY_IMPACT_TEXTS]);
      return;
    }

    try {
      const data: LifeResultInput = JSON.parse(raw);
      const recs: string[] = [...MANDATORY_IMPACT_TEXTS];
      const extras: string[] = [];

      // 1) Invalidita
      if (!data.hasInvalidity) {
        recs.push(
          "Klientovi bylo vysvětleno, proč by měl mít připojištěnou invaliditu, přesto si ji nepřeje."
        );
      } else if (
        data.totalInvalidity > 0 &&
        data.totalInvalidity < 1_000_000
      ) {
        recs.push(
          "Klient byl upozorněn, že požadované částky na invaliditu mohou být nedostačující."
        );
      }

      // 2) Závažná onemocnění a poranění
      if (data.hasCriticalIllness) {
        recs.push(
          "Klient byl upozorněn, že se připojištění Závažná onemocnění a poranění vztahuje pouze na diagnózy uvedené v pojistných podmínkách."
        );
      }

      // 3) Vážná onemocnění Pro něj / Pro ni
      if (data.hasSeriousIllness) {
        recs.push(
          "Klient byl upozorněn, že se připojištění Vážná onemocnění (Pro něj / Pro ni) vztahuje pouze na diagnózy uvedené v pojistných podmínkách."
        );
      }
      if (data.hasExistingContract) {
        extras.push(EXISTING_CONTRACT_EXTRA_TEXT);
      }

      const selectedBenefits = data.selectedBenefits ?? [];

      const productTexts = [
        {
          label: "ČPP NEON Life / Risk",
          text: buildRecommendation("cppNeon", selectedBenefits),
        },
        {
          label: "KOOPERATIVA FLEXI",
          text: buildRecommendation("kooperativaFlexi", selectedBenefits),
        },
        {
          label: "ALLIANZ Životní Pojištění",
          text: null, // doplníme později
        },
      ];

      recs.push(
        "Negativním dopadem může být nevyužití dalších doporučených připojištění a vyšších pojistných částek."
      );
      recs.push(
        "Klient byl poučen o povinnosti uvádět pravdivé a úplné informace ve zdravotním dotazníku a o možných důsledcích nepravdivých údajů (krácení/odmítnutí plnění)."
      );
      if (data.isChangeOnExistingContract) {
        recs.push(CHANGE_EXISTING_CONTRACT_HEADING_ONE);
        recs.push(...CHANGE_EXISTING_CONTRACT_IMPACT_LINES_ONE);
        recs.push(CHANGE_EXISTING_CONTRACT_HEADING_TWO);
        recs.push(...CHANGE_EXISTING_CONTRACT_IMPACT_LINES_TWO);
      }
      if (data.isRefreshOrRenovation) {
        recs.push(REFRESH_RENOVATION_HEADING);
        recs.push(...REFRESH_RENOVATION_IMPACT_LINES);
      }
      if (data.isContractTerminationDueToNewOne) {
        recs.push(TERMINATION_DUE_TO_NEW_CONTRACT_HEADING);
        recs.push(...TERMINATION_DUE_TO_NEW_CONTRACT_IMPACT_LINES);
      }

      setLines(recs);
      setAdditional(extras);
      setProductRecs(productTexts);
    } catch (err) {
      console.error(err);
      setLines([...MANDATORY_IMPACT_TEXTS]);
      setAdditional([]);
      setProductRecs([]);
    }
  }, []);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-4xl space-y-6">
        <header>
          <button
            type="button"
            onClick={() => router.push("/pomucky/zaznam")}
            className="mb-3 inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-900 transition hover:border-slate-500 hover:bg-slate-200"
          >
            Zpět
          </button>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Doporučení do dopadů
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Texty, které můžeš využít v části „Dopady na klienta“ v záznamu
            z jednání. Další pravidla budeme postupně doplňovat.
          </p>
        </header>

        <div className="space-y-3">
          <div className="text-lg font-semibold text-slate-900">
            Další požadavky, potřeby a cíle zákazníka
          </div>
          <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-3 text-sm text-slate-900">
            <div className="flex items-start gap-3 leading-relaxed">
              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    "Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění."
                  )
                }
                className="mt-[1px] inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-[3px] text-[11px] font-medium text-slate-900 transition hover:border-emerald-300/60 hover:text-emerald-800"
              >
                {copiedText ===
                "Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění."
                  ? "Zkopírováno"
                  : "Kopírovat"}
              </button>
              <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
              <span className="flex-1">
                Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v
                pojistných podmínkách k požadovanému typu pojištění.
              </span>
            </div>
            {additional === null ? (
              <p className="text-sm text-slate-600">Načítám…</p>
            ) : (
              <div className="space-y-2 text-sm text-slate-900">
                {additional.map((line, idx) => {
                  const showCopyButton =
                    line !== EXISTING_CONTRACT_EXTRA_TEXT;
                  const copySlotClass =
                    "mt-[1px] inline-flex min-w-[78px] items-center justify-center rounded-full border border-slate-300 bg-slate-100 px-2 py-[3px] text-[11px] font-medium text-slate-900";
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 leading-relaxed"
                    >
                      {showCopyButton && (
                        <button
                          type="button"
                          onClick={() => handleCopy(line)}
                          className={`${copySlotClass} transition hover:border-emerald-300/60 hover:text-emerald-800`}
                        >
                          {copiedText === line ? "Zkopírováno" : "Kopírovat"}
                        </button>
                      )}
                      {!showCopyButton && (
                        <span
                          aria-hidden="true"
                          className={`${copySlotClass} invisible`}
                        >
                          Kopírovat
                        </span>
                      )}
                      <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="flex-1">{line}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <div className="text-lg font-semibold text-slate-900">
            Popis dopadů sjednání pojištění/změny pojištění
          </div>
          <section className="rounded-3xl border border-slate-900 bg-white  px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            {lines === null ? (
              <p className="text-sm text-slate-600">Načítám doporučení…</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-slate-600">
                Zatím tu nemám žádná konkrétní doporučení. Vyplň nejdřív krytí
                na stránce „Záznam z jednání – Život“ a znovu klikni na{" "}
                <strong>Výsledky</strong>.
              </p>
            ) : (
              <ul className="space-y-3 text-sm text-slate-900">
                {lines.map((line, idx) => {
                  const isHeading = line.startsWith(IMPACT_HEADING_PREFIX);
                  if (isHeading) {
                    return (
                      <li key={idx} className="pt-1 text-base font-semibold text-slate-900">
                        {line.slice(IMPACT_HEADING_PREFIX.length)}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={idx}
                      className="flex items-start gap-3 leading-relaxed"
                    >
                      <button
                        type="button"
                        onClick={() => handleCopy(line)}
                        className="mt-[1px] inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-[3px] text-[11px] font-medium text-slate-900 transition hover:border-emerald-300/60 hover:text-emerald-800"
                      >
                        {copiedText === line ? "Zkopírováno" : "Kopírovat"}
                      </button>
                      <span className="mt-[6px] block h-[10px] w-[10px] rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="flex-1">{line}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-slate-900">
              Doporučení pojistného produktu
            </div>
            <button
              type="button"
              onClick={() => setShowProductInfo((v) => !v)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[11px] text-slate-800 hover:border-emerald-300/60 hover:text-emerald-800 transition"
              aria-label="Zobrazit vysvětlení doporučení pojistného produktu"
            >
              i
            </button>
          </div>
          {showProductInfo && (
            <div className="relative">
              <div className="absolute -left-4 top-1 h-3 w-3 rotate-45 bg-white border-l border-t border-slate-900 blur-[0.5px]" />
              <div className="rounded-2xl border border-slate-900 bg-white  px-4 py-3 text-sm text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                <span className="font-medium text-slate-900">
                  Doporučení pojistného produktu
                </span>{" "}
                – Vždy by jsi měl/a doporučit 2-3 produkty.{" "}
                <span className="font-medium text-slate-900">Důvody, na kterých je doporučení založeno:</span>{" "}
                Zde vypiš, co doporučená pojišťovna umožnuje pojistit z rizik který klient požaduje.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {productRecs.map(({ label, text }) => (
              <section
                key={label}
                className="flex h-full flex-col rounded-3xl border border-slate-900 bg-white  px-4 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
              >
                <div className="text-base font-semibold text-slate-900">
                  {label}
                </div>
                {text ? (
                  <>
                    <div className="mt-2 text-sm text-slate-800 leading-relaxed flex-1">
                      {text}
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleCopy(text)}
                        className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-[6px] text-[11px] font-medium text-slate-900 transition hover:border-emerald-300/60 hover:text-emerald-800"
                      >
                        {copiedText === text ? "Zkopírováno" : "Kopírovat"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-slate-800 leading-relaxed flex-1">
                    <span className="text-slate-500">
                      Doplníme po zadání parametrů této pojišťovny.
                    </span>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCopy,
  Info,
  Sparkles,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import {
  PRODUCT_CAPABILITIES,
  type CapabilityEntry,
  type ProductKey,
} from "../productCapabilities";

type LifeResultInput = {
  savedAt?: number;
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

const LIFE_RECORD_RESULT_INPUT_KEY = "lifeRecordResultInput";
const LIFE_RECORD_RESULT_INPUT_TTL_MS = 20 * 60 * 1000;

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

function shouldMentionCppAccidentPlus(selected: SelectedBenefit[]): boolean {
  return selected.some((benefit) => {
    if (benefit.key === "permanentInjury") return true;
    if (benefit.key === "dailyAllowance") return true;
    if (benefit.key === "sickLeave") return benefit.accident;
    return false;
  });
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
  if (productKey === "cppNeon" && shouldMentionCppAccidentPlus(selected)) {
    texts.unshift("Úraz PLUS");
  }
  return `Pojišťovna umožňuje pojistit rizika: ${texts.join(", ")}.`;
}

function formatCzkAmount(amount: number): string {
  return `${amount.toLocaleString("cs-CZ")} Kč`;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} a ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}

const MANDATORY_IMPACT_TEXTS: string[] = [
  "Klient byl seznámen s rozsahem krytí, výší pojistných částek a pojistného, s hlavními výlukami/čekacími dobami a principem likvidace pojistné události dle pojistných podmínek, doporučení pravidelné aktualizace smlouvy a nutnosti hlásit změny jako například změna povolání.",
];
const BASE_ADDITIONAL_REQUIREMENT_TEXT =
  "Klient vyžadoval vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění.";
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

type CopyHandler = (text: string) => void;

function formatLineNumber(index: number): string {
  return String(index).padStart(2, "0");
}

function formatTextCount(count: number): string {
  if (count === 1) return "1 text";
  if (count > 1 && count < 5) return `${count} texty`;
  return `${count} textů`;
}

function normalizeImpactLineForCopy(line: string): string {
  return line.startsWith(IMPACT_HEADING_PREFIX)
    ? line.slice(IMPACT_HEADING_PREFIX.length)
    : line;
}

function CopyAction({
  text,
  copiedText,
  onCopy,
  variant = "light",
  label = "Kopírovat",
}: {
  text: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  variant?: "light" | "dark";
  label?: string;
}) {
  const copied = copiedText === text;
  const variantClass =
    variant === "dark"
      ? "border-violet-300/45 bg-white/[0.08] text-violet-50 hover:border-violet-200/70 hover:bg-white/[0.14]"
      : "border-violet-200 bg-violet-50 text-violet-900 hover:border-violet-400 hover:bg-violet-100";

  return (
    <button
      type="button"
      onClick={() => onCopy(text)}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${variantClass}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <ClipboardCopy className="h-3.5 w-3.5" />
      )}
      <span>{copied ? "Zkopírováno" : label}</span>
    </button>
  );
}

function ResultSection({
  eyebrow,
  title,
  description,
  countLabel,
  copyText,
  copiedText,
  onCopy,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  countLabel?: string;
  copyText?: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-200/75 bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_100%)] shadow-[0_18px_44px_rgba(42,20,72,0.12)]">
      <div className="border-b border-violet-100/80 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950 sm:text-xl">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {countLabel ? (
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-900">
                {countLabel}
              </span>
            ) : null}
            {copyText ? (
              <CopyAction
                text={copyText}
                copiedText={copiedText}
                onCopy={onCopy}
                label="Kopírovat vše"
              />
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function ResultTextRow({
  index,
  text,
  copiedText,
  onCopy,
  copyable = true,
}: {
  index: number;
  text: string;
  copiedText: string | null;
  onCopy: CopyHandler;
  copyable?: boolean;
}) {
  return (
    <article className="grid gap-3 rounded-[22px] border border-violet-200/70 bg-white/95 p-3 shadow-[0_8px_22px_rgba(42,20,72,0.08)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[11px] font-black text-violet-900">
        {formatLineNumber(index)}
      </span>
      <p className="text-sm leading-relaxed text-slate-800">{text}</p>
      {copyable ? (
        <CopyAction text={text} copiedText={copiedText} onCopy={onCopy} />
      ) : (
        <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900">
          doplnit ručně
        </span>
      )}
    </article>
  );
}

function ImpactSubheading({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-violet-300/45 bg-[linear-gradient(135deg,#ede9fe_0%,#faf5ff_100%)] px-4 py-3 text-sm font-semibold text-violet-950 shadow-[0_8px_20px_rgba(88,28,135,0.1)]">
      {text}
    </div>
  );
}

function ProductRecommendationCard({
  label,
  text,
  copiedText,
  onCopy,
}: {
  label: string;
  text: string | null;
  copiedText: string | null;
  onCopy: CopyHandler;
}) {
  return (
    <section className="relative isolate flex min-h-[230px] flex-col overflow-hidden rounded-[26px] border border-[#653493] bg-[#150e1f] px-4 py-5 shadow-[0_18px_34px_rgba(20,8,32,0.38)] ring-1 ring-[#7a35a7]/22">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(66,30,100,0.54)_0%,rgba(29,18,45,0.8)_44%,rgba(18,12,27,0.99)_100%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(168,85,247,0),rgba(192,132,252,0.74),rgba(217,180,254,0.9),rgba(192,132,252,0.74),rgba(168,85,247,0))]"
      />
      <div className="relative z-[1] flex h-full flex-col">
        <span className="inline-flex w-fit items-center rounded-xl border border-violet-200/70 bg-[linear-gradient(135deg,#c084fc_0%,#a855f7_100%)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#1d1138] shadow-[0_10px_24px_rgba(168,85,247,0.38)]">
          Produkt
        </span>
        <h3 className="mt-3 text-lg font-semibold leading-tight text-[#fbf7ff]">
          {label}
        </h3>
        {text ? (
          <>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-violet-100/82">
              {text}
            </p>
            <div className="mt-5">
              <CopyAction
                text={text}
                copiedText={copiedText}
                onCopy={onCopy}
                variant="dark"
              />
            </div>
          </>
        ) : (
          <p className="mt-3 flex-1 text-sm leading-relaxed text-violet-100/62">
            Doplníme po zadání parametrů této pojišťovny.
          </p>
        )}
      </div>
    </section>
  );
}

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

    const raw = window.localStorage.getItem(LIFE_RECORD_RESULT_INPUT_KEY);
    if (!raw) {
      setLines([...MANDATORY_IMPACT_TEXTS]);
      setAdditional([]);
      setProductRecs([]);
      return;
    }

    try {
      const data: LifeResultInput = JSON.parse(raw);
      const savedAt = typeof data.savedAt === "number" ? data.savedAt : 0;
      if (!savedAt || Date.now() - savedAt > LIFE_RECORD_RESULT_INPUT_TTL_MS) {
        window.localStorage.removeItem(LIFE_RECORD_RESULT_INPUT_KEY);
        setLines([...MANDATORY_IMPACT_TEXTS]);
        setAdditional([]);
        setProductRecs([]);
        return;
      }
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
      const highDailyBenefits: string[] = [];

      selectedBenefits.forEach((benefit) => {
        if (benefit.key === "dailyAllowance") {
          if (typeof benefit.amount === "number" && benefit.amount > 600) {
            highDailyBenefits.push(
              `denní odškodné po úrazu (${formatCzkAmount(benefit.amount)})`
            );
          }
          return;
        }

        if (benefit.key === "sickLeave") {
          if (typeof benefit.amount !== "number") return;

          const isAboveLimit =
            ((benefit.from === "day15" || benefit.from === "day29") &&
              benefit.amount > 600) ||
            (benefit.from === "day60" && benefit.amount > 800);

          if (!isAboveLimit) return;

          const fromLabel =
            benefit.from === "day15"
              ? "od 15. dne"
              : benefit.from === "day29"
              ? "od 29. dne"
              : "od 60. dne";

          highDailyBenefits.push(
            `pracovní neschopnost ${fromLabel} (${formatCzkAmount(
              benefit.amount
            )})`
          );
          return;
        }

        if (benefit.key === "hospitalization") {
          if (
            benefit.accident &&
            typeof benefit.amountAccident === "number" &&
            benefit.amountAccident > 600
          ) {
            highDailyBenefits.push(
              `hospitalizace při úrazu (${formatCzkAmount(
                benefit.amountAccident
              )})`
            );
          }
          if (
            benefit.illness &&
            typeof benefit.amountIllness === "number" &&
            benefit.amountIllness > 600
          ) {
            highDailyBenefits.push(
              `hospitalizace při nemoci (${formatCzkAmount(
                benefit.amountIllness
              )})`
            );
          }
        }
      });

      const uniqueHighDailyBenefits = [...new Set(highDailyBenefits)];
      if (uniqueHighDailyBenefits.length > 0) {
        const list = joinWithAnd(uniqueHighDailyBenefits);
        recs.push(
          `Klient požaduje následující denní dávky: ${list} a byl seznámen s tím, že při pojistné události je nutné doložit příjem, dále byl seznámen s tabulkou maximálních pojistných částek denního odškodného ve vztahu k příjmu.`
        );
      }

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

  const additionalLines = additional ?? [];
  const additionalCount = 1 + additionalLines.length;
  const additionalCopyText =
    additional === null
      ? undefined
      : [BASE_ADDITIONAL_REQUIREMENT_TEXT, ...additionalLines].join("\n");
  const impactTextCount =
    lines?.filter((line) => !line.startsWith(IMPACT_HEADING_PREFIX)).length ?? 0;
  const impactCopyText =
    lines && lines.length > 0
      ? lines.map(normalizeImpactLineForCopy).join("\n")
      : undefined;
  const productTextCount = productRecs.filter(({ text }) => Boolean(text)).length;
  let impactRowIndex = 0;

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-5xl space-y-6">
        <header className="relative isolate overflow-hidden rounded-[32px] border border-[#653493] bg-[#150e1f] px-5 py-5 text-white shadow-[0_24px_64px_rgba(20,8,32,0.42)] ring-1 ring-[#7a35a7]/22 sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(66,30,100,0.58)_0%,rgba(29,18,45,0.82)_44%,rgba(18,12,27,0.99)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.13)_0%,rgba(190,92,255,0)_42%,rgba(99,102,241,0.12)_100%)]" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-0 z-[1] h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(168,85,247,0),rgba(192,132,252,0.74),rgba(217,180,254,0.9),rgba(192,132,252,0.74),rgba(168,85,247,0))]"
          />
          <div className="relative z-[1]">
            <button
              type="button"
              onClick={() => router.push("/pomucky/zaznam")}
              className="inline-flex items-center gap-2 rounded-full border border-violet-300/45 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:border-violet-200/70 hover:bg-white/[0.14]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zpět na záznam
            </button>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
              <div>
                <p className="inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.06] px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-violet-100">
                  <Sparkles className="h-3.5 w-3.5" />
                  Výstup pro jednání
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#fbf7ff] sm:text-4xl">
                  Doporučení do dopadů
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-violet-100/78 sm:text-base">
                  Texty připravené pro část „Dopady na klienta“. Kopíruj celé
                  sekce nebo jednotlivé věty podle toho, co chceš do záznamu
                  vložit.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-violet-300/25 bg-white/[0.06] px-3 py-3">
                  <div className="text-2xl font-black text-[#fbf7ff]">
                    {additional === null ? "…" : additionalCount}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100/70">
                    Cíle
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-300/25 bg-white/[0.06] px-3 py-3">
                  <div className="text-2xl font-black text-[#fbf7ff]">
                    {lines === null ? "…" : impactTextCount}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100/70">
                    Dopady
                  </div>
                </div>
                <div className="rounded-2xl border border-violet-300/25 bg-white/[0.06] px-3 py-3">
                  <div className="text-2xl font-black text-[#fbf7ff]">
                    {productTextCount}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100/70">
                    Produkty
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <ResultSection
          eyebrow="Část 1"
          title="Další požadavky, potřeby a cíle zákazníka"
          description="Krátké texty pro úvodní část záznamu. Položky označené jako ruční doplnění obsahují proměnné údaje."
          countLabel={additional === null ? "Načítám" : formatTextCount(additionalCount)}
          copyText={additionalCopyText}
          copiedText={copiedText}
          onCopy={handleCopy}
        >
          <ResultTextRow
            index={1}
            text={BASE_ADDITIONAL_REQUIREMENT_TEXT}
            copiedText={copiedText}
            onCopy={handleCopy}
          />
          {additional === null ? (
            <p className="rounded-2xl border border-violet-100 bg-white/80 px-4 py-3 text-sm text-slate-600">
              Načítám…
            </p>
          ) : (
            additional.map((line, idx) => (
              <ResultTextRow
                key={idx}
                index={idx + 2}
                text={line}
                copiedText={copiedText}
                onCopy={handleCopy}
                copyable={line !== EXISTING_CONTRACT_EXTRA_TEXT}
              />
            ))
          )}
        </ResultSection>

        <ResultSection
          eyebrow="Část 2"
          title="Popis dopadů sjednání pojištění/změny pojištění"
          description="Hlavní sada vět do pole dopadů. Nadpisy oddělují zvláštní situace jako refresh, změnu nebo ukončení starší smlouvy."
          countLabel={lines === null ? "Načítám" : formatTextCount(impactTextCount)}
          copyText={impactCopyText}
          copiedText={copiedText}
          onCopy={handleCopy}
        >
          {lines === null ? (
            <p className="rounded-2xl border border-violet-100 bg-white/80 px-4 py-3 text-sm text-slate-600">
              Načítám doporučení…
            </p>
          ) : lines.length === 0 ? (
            <p className="rounded-2xl border border-violet-100 bg-white/80 px-4 py-3 text-sm text-slate-600">
              Zatím tu nemám žádná konkrétní doporučení. Vyplň nejdřív krytí na
              stránce „Záznam z jednání – Život“ a znovu klikni na{" "}
              <strong>Výsledky</strong>.
            </p>
          ) : (
            lines.map((line, idx) => {
              const isHeading = line.startsWith(IMPACT_HEADING_PREFIX);
              if (isHeading) {
                return (
                  <ImpactSubheading
                    key={idx}
                    text={line.slice(IMPACT_HEADING_PREFIX.length)}
                  />
                );
              }
              impactRowIndex += 1;
              return (
                <ResultTextRow
                  key={idx}
                  index={impactRowIndex}
                  text={line}
                  copiedText={copiedText}
                  onCopy={handleCopy}
                />
              );
            })
          )}
        </ResultSection>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
                Část 3
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950 sm:text-xl">
                Doporučení pojistného produktu
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowProductInfo((v) => !v)}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 transition hover:border-violet-400 hover:bg-violet-100"
              aria-label="Zobrazit vysvětlení doporučení pojistného produktu"
            >
              <Info className="h-3.5 w-3.5" />
              Jak použít
            </button>
          </div>
          {showProductInfo && (
            <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-[0_8px_24px_rgba(42,20,72,0.1)]">
              <span className="font-semibold text-slate-950">
                Doporučení pojistného produktu:
              </span>{" "}
              doporuč 2-3 produkty a u každého uveď, jaká požadovaná rizika
              umí pojišťovna pokrýt.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {productRecs.map(({ label, text }) => (
              <ProductRecommendationCard
                key={label}
                label={label}
                text={text}
                copiedText={copiedText}
                onCopy={handleCopy}
              />
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

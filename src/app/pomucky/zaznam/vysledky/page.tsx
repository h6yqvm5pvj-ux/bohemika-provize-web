"use client";

import styles from "../record.module.css";
import resultStyles from "../results.module.css";
import { RecordIllustration } from "../RecordIllustration";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Info,
  Sparkles,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { MeetingRecordSession } from "../MeetingRecordSession";
import { LifeDiscrepancyExamples } from "../LifeDiscrepancyExamples";
import { CopyAction, CopyFeedback, ResultSection, ResultTextRow, useRecordClipboard, type CopyHandler } from "../ResultComponents";
import { getLifeRecordTexts, IMPACT_HEADING_PREFIX, type ClientGender } from "../lifeRecordTexts";
import { readMeetingRecord, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";
import {
  PRODUCT_CAPABILITIES,
  type CapabilityEntry,
  type PermanentProgress,
  type PermanentStart,
  type ProductKey,
} from "../productCapabilities";

type LifeResultInput = {
  savedAt?: number;
  clientGender?: ClientGender;
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

const PERMANENT_PROGRESSION_VALUES: Record<PermanentProgress, number> = {
  none: 1, x4: 4, x5: 5, x10: 10,
};
const PERMANENT_THRESHOLD_VALUES: Record<PermanentStart, number> = {
  from0: 0, from0001: 0.001, from05: 0.5, from10: 10,
};

function closestSupported<T extends string>(
  requested: T,
  supported: T[],
  values: Record<T, number>
): T | undefined {
  if (!Number.isFinite(values[requested])) return undefined;
  return supported.reduce<T | undefined>((closest, candidate) =>
    closest === undefined ||
    Math.abs(values[candidate] - values[requested]) < Math.abs(values[closest] - values[requested])
      ? candidate : closest, undefined);
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
      const okThreshold = cap.permanentInjury.thresholds.includes(benefit.from);
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
  const notes = new Set<string>();

  selected.forEach((selectedBenefit) => {
    let benefit = selectedBenefit;
    if (benefit.key === "permanentInjury") {
      const permanent = findCapability(capability.entries, "permanentInjury")?.permanentInjury;
      if (!permanent) return;
      // Keep exact matches; otherwise compare the nearest available parameters.
      // Describe the insurer's actual variant without changing the saved request.
      const progress = closestSupported(benefit.progress, permanent.progressions, PERMANENT_PROGRESSION_VALUES);
      const from = closestSupported(benefit.from, permanent.thresholds, PERMANENT_THRESHOLD_VALUES);
      if (!progress || !from) return;
      benefit = { ...benefit, progress, from };
      const note = permanent.progressionNotes?.[progress];
      if (note) notes.add(`U varianty s ${progress.slice(1)}× progresí: ${note}`);
    }

    // If only progression is unavailable, show the supported nonprogressive
    // alternative while keeping the client's requested start day unchanged.
    if (
      benefit.key === "dailyAllowance" &&
      benefit.progress === "with" &&
      !supportsBenefit(benefit, capability.entries)
    ) {
      const withoutProgress = { ...benefit, progress: "none" as const };
      if (supportsBenefit(withoutProgress, capability.entries)) {
        const text = describeBenefit(withoutProgress);
        if (text) texts.push(text);
      }
      return;
    }

    // Speciální případ: Kooperativa Životní pojištění FLEXI umí u PN od 15. dne zpětně jen pro úraz.
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
      const t = describeBenefit(benefit);
      if (t) texts.push(t);
    }
  });

  if (texts.length === 0) return null;
  if (productKey === "cppNeon" && shouldMentionCppAccidentPlus(selected)) {
    texts.unshift("Úraz PLUS");
  }
  return [`Pojišťovna umožňuje pojistit rizika: ${texts.join(", ")}.`, ...notes].join(" ");
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

function ImpactSubheading({ text }: { text: string }) {
  return (
    <h3 className={resultStyles.subheading}>
      {text}
    </h3>
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
    <section className={resultStyles.productCard}>
      <span className={resultStyles.eyebrow}>Doporučení produktu</span>
      <h3>{label}</h3>
      {text ? (
        <>
          <p>{text}</p>
          <CopyAction text={text} copiedText={copiedText} onCopy={onCopy} />
        </>
      ) : <p>Doplníme po zadání parametrů této pojišťovny.</p>}
    </section>
  );
}

export default function RecordResultsPage() {
  return <MeetingRecordSession>{(owner) => <RecordResults owner={owner} />}</MeetingRecordSession>;
}

function RecordResults({ owner }: { owner: MeetingRecordContext }) {
  const router = useRouter();
  const [clientGender, setClientGender] = useState<ClientGender>("male");
  const texts = getLifeRecordTexts(clientGender);
  const [lines, setLines] = useState<string[] | null>(null);
  const [additional, setAdditional] = useState<string[] | null>(null);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const [productRecs, setProductRecs] = useState<
    { label: string; text: string | null }[]
  >([]);
  const { copiedText, feedback, handleCopy } = useRecordClipboard();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const data = readMeetingRecord<LifeResultInput>("lifeResults", owner);
    const gender = data?.clientGender === "female" ? "female" : "male";
    const texts = getLifeRecordTexts(gender);
    setClientGender(gender);
    if (!data) {
      setLines([...texts.mandatoryImpacts]);
      setAdditional([]);
      setProductRecs([]);
      return;
    }

    try {
      const recs: string[] = [...texts.mandatoryImpacts];
      const extras: string[] = [];

      // 1) Invalidita
      if (!data.hasInvalidity) {
        recs.push(texts.invalidityDeclined);
      } else if (
        data.totalInvalidity > 0 &&
        data.totalInvalidity < 1_000_000
      ) {
        recs.push(texts.lowInvalidityAmount);
      }

      // 2) Závažná onemocnění a poranění
      if (data.hasCriticalIllness) {
        recs.push(texts.criticalIllness);
      }

      // 3) Vážná onemocnění Pro něj / Pro ni
      if (data.hasSeriousIllness) {
        recs.push(texts.seriousIllness);
      }
      if (data.hasExistingContract) {
        extras.push(texts.existingContract);
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
        recs.push(texts.dailyBenefitsIncome(list));
      }

      const productTexts = [
        {
          label: "ČPP Životní pojištění NEON Life / Risk",
          text: buildRecommendation("cppNeon", selectedBenefits),
        },
        {
          label: "Kooperativa Životní pojištění FLEXI",
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
      recs.push(texts.healthDisclosure);
      if (data.isChangeOnExistingContract) {
        recs.push(texts.changeExistingContractHeadingOne);
        recs.push(...texts.changeExistingContractImpactsOne);
        recs.push(texts.changeExistingContractHeadingTwo);
        recs.push(...texts.changeExistingContractImpactsTwo);
      }
      if (data.isRefreshOrRenovation) {
        recs.push(texts.refreshHeading);
        recs.push(...texts.refreshImpacts);
      }
      if (data.isContractTerminationDueToNewOne) {
        recs.push(texts.terminationImpact);
      }

      setLines(recs);
      setAdditional(extras);
      setProductRecs(productTexts);
    } catch (err) {
      console.error(err);
      setLines([...texts.mandatoryImpacts]);
      setAdditional([]);
      setProductRecs([]);
    }
  }, [owner]);

  const additionalLines = additional ?? [];
  const additionalCount = 1 + additionalLines.length;
  const additionalCopyText =
    additional === null
      ? undefined
      : [texts.additionalRequirement, ...additionalLines].join("\n");
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
      <div className={`${styles.page} ${styles.results} ${resultStyles.page}`}>
        <button type="button" onClick={() => router.push("/pomucky/zaznam")} className={styles.back}>
          <ArrowLeft size={15} aria-hidden="true" /> Zpět na záznam
        </button>
        <header className={`${styles.hero} ${resultStyles.hero}`}>
          <div>
            <span className={styles.eyebrow}><Sparkles size={14} aria-hidden="true" /> Životní pojištění · Výsledky</span>
            <h1>Texty do záznamu z jednání</h1>
            <p>Vše připravené podle tvého zadání. Projdi jednotlivé části a zkopíruj texty, které odpovídají jednání s {texts.clientInstrumental}.</p>
          </div>
          <div className={`${styles.illustration} ${resultStyles.heroIllustration}`}><RecordIllustration complete /></div>
        </header>
        <nav className={resultStyles.navigation} aria-label="Části záznamu">
          <a href="#pozadavky"><b>1</b> Potřeby a cíle <small>{additional === null ? "…" : formatTextCount(additionalCount)}</small></a>
          <a href="#nesrovnalosti"><b>2</b> Nesrovnalosti</a>
          <a href="#dopady"><b>3</b> Dopady <small>{lines === null ? "…" : formatTextCount(impactTextCount)}</small></a>
          <a href="#produkty"><b>4</b> Produkty <small>{productTextCount}</small></a>
        </nav>

        <ResultSection
          id="pozadavky"
          eyebrow="Část 1"
          title={`Další požadavky, potřeby a cíle ${texts.customerGenitive}`}
          description="Krátké texty pro úvodní část záznamu. Položky označené jako ruční doplnění obsahují proměnné údaje."
          countLabel={additional === null ? "Načítám" : formatTextCount(additionalCount)}
          copyText={additionalCopyText}
          copiedText={copiedText}
          onCopy={handleCopy}
        >
          <ResultTextRow
            index={1}
            text={texts.additionalRequirement}
            copiedText={copiedText}
            onCopy={handleCopy}
          />
          {additional === null ? (
            <p className={resultStyles.muted}>
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
                copyable={line !== texts.existingContract}
              />
            ))
          )}
        </ResultSection>

        <ResultSection
          id="nesrovnalosti"
          eyebrow="Část 2"
          title={`Výčet případných nesrovnalostí mezi požadavky ${texts.customerGenitive} a nabízeným pojištěním`}
          copiedText={copiedText}
          onCopy={handleCopy}
        >
          <p className={resultStyles.notice}>
            {texts.discrepanciesInstruction}
          </p>
          <LifeDiscrepancyExamples />
        </ResultSection>

        <ResultSection
          id="dopady"
          eyebrow="Část 3"
          title="Popis dopadů sjednání pojištění/změny pojištění"
          description="Hlavní sada vět do pole dopadů. Nadpisy oddělují zvláštní situace jako refresh, změnu nebo ukončení starší smlouvy."
          countLabel={lines === null ? "Načítám" : formatTextCount(impactTextCount)}
          copyText={impactCopyText}
          copiedText={copiedText}
          onCopy={handleCopy}
        >
          {lines === null ? (
            <p className={resultStyles.muted}>
              Načítám doporučení…
            </p>
          ) : lines.length === 0 ? (
            <p className={resultStyles.muted}>
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

        <section id="produkty" className={resultStyles.productSection} aria-labelledby="produkty-heading">
          <div className={resultStyles.productHeading}>
            <div className={resultStyles.sectionHeading}>
              <p className={resultStyles.eyebrow}>
                Část 4
              </p>
              <h2 id="produkty-heading">
                Doporučení pojistného produktu
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowProductInfo((v) => !v)}
              className={resultStyles.copyAction}
              aria-label="Zobrazit vysvětlení doporučení pojistného produktu"
              aria-expanded={showProductInfo}
              aria-controls="product-info"
            >
              <Info size={15} aria-hidden="true" />
              Jak použít
            </button>
          </div>
          {showProductInfo && (
            <div id="product-info" className={`${resultStyles.notice} mb-4`}>
              <span className="font-semibold text-slate-950">
                Doporučení pojistného produktu:
              </span>{" "}
              doporuč 2-3 produkty a u každého uveď, jaká požadovaná rizika
              umí pojišťovna pokrýt.
            </div>
          )}

          <div className={resultStyles.productGrid}>
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
        <div className={resultStyles.footer}>
          <Link href="/pomucky/zaznam" className={resultStyles.copyAction}><ArrowLeft size={15} aria-hidden="true" /> Upravit zadání</Link>
        </div>
        <CopyFeedback feedback={feedback} />
      </div>
    </AppLayout>
  );
}

// src/app/pomucky/zaznam/vysledky-auto/page.tsx
"use client";

import styles from "../record.module.css";
import resultStyles from "../results.module.css";
import { RecordIllustration } from "../RecordIllustration";

import { useState } from "react";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { CopyFeedback, ResultSection, ResultTextRow, useRecordClipboard } from "../ResultComponents";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";
import { MeetingRecordSession } from "../MeetingRecordSession";
import { readMeetingRecord, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";
import { getRecordClientWords, type ClientGender } from "../recordClientTexts";

type Insurer =
  | "cpp"
  | "kooperativa"
  | "allianz"
  | "pillow"
  | "slavia"
  | "csob"
  | "uniqa";

interface CarResultsInput {
  clientGender?: ClientGender;
  hasLiability: boolean;
  liabilityLimit: string | null;

  hasCasco?: boolean;
  cascoDeductible?: string | null;
  ownDamage?: boolean;

  assistance: boolean;
  assistanceLevel: string | null;
  annualMileage: string | null;

  glass: boolean;
  collisionAnimal: boolean;
  naturalHazard: boolean;
  vandalism: boolean;
  animalDamage: boolean;
  theft: boolean;

  discountCppProfi: boolean;
  discountUniqaNonOemGlass: boolean;
}

const INSURER_OPTIONS: { id: Insurer; label: string }[] = [
  { id: "cpp", label: "ČPP" },
  { id: "kooperativa", label: "Kooperativa" },
  { id: "allianz", label: "Allianz" },
  { id: "pillow", label: "Pillow" },
  { id: "slavia", label: "Slavia" },
  { id: "csob", label: "ČSOB" },
  { id: "uniqa", label: "UNIQA" },
];

type RecommendationItem = {
  text: string;
  reason?: string;
};

function getUsualPriceLimitCovers(data: CarResultsInput): string[] {
  const covers: string[] = [];
  if (data.collisionAnimal) covers.push("Střet se zvěří");
  if (data.animalDamage) covers.push("Poškození zvířetem");
  if (data.naturalHazard) covers.push("Živel");
  if (data.vandalism) covers.push("Vandalismus");
  if (data.theft) covers.push("Odcizení");
  return covers;
}

function getInsurerLabel(insurer: Insurer): string {
  return (
    INSURER_OPTIONS.find((option) => option.id === insurer)?.label ?? insurer
  );
}

function buildRecommendations(
  data: CarResultsInput | null,
  currentInsurer: Insurer | null
): RecommendationItem[] {
  if (!data) return [];

  const t = getRecordClientWords(data.clientGender);
  const recs: RecommendationItem[] = [{ text: `${t.Client} ${t.wasAcquainted} s pojistnými podmínkami, zejména s výlukami, limity a rozsahem pojistného plnění, spoluúčastí a postupem při hlášení a likvidaci pojistné události.` }];

  const photoTriggers: string[] = [];
  if (data.glass) photoTriggers.push("Skla");
  if (data.collisionAnimal) photoTriggers.push("Střet se zvěří");
  if (data.animalDamage) photoTriggers.push("Poškození zvířetem");
  if (data.naturalHazard) photoTriggers.push("Živel");
  if (data.vandalism) photoTriggers.push("Vandalismus");
  if (data.ownDamage) photoTriggers.push("Poškození vlastního vozidla");
  if (data.hasCasco) photoTriggers.push("Havarijní");

  if (photoTriggers.length > 0) {
    recs.push(
      {
        text: `${t.Client} ${t.wasInformed} o nutnosti nafocení vozidla a bere na vědomí, že do nafocení může být uplatněna vyšší spoluúčast dle podmínek pojišťovny.`,
        reason: photoTriggers.join(" + "),
      }
    );
  }

  // 1) Limity POV < 100/100
  if (data.hasLiability && data.liabilityLimit) {
    const match = data.liabilityLimit.match(/(\d+)/);
    if (match) {
      const first = parseInt(match[1], 10);
      if (first < 100) {
        recs.push({
          text: `${t.Client} ${t.wasWarned} že ${t.byClient} zvolené limity na POV mohou být nízké a to zejména v zahraničí.`,
          reason: "POV limit pod 100/100",
        });
      }
    }
  }

  // 2) Asistence – základní
  if (data.assistance && data.assistanceLevel === "Základní") {
    recs.push({
      text: `${t.Client} ${t.wasWarned} že ${t.chose} pouze základní asistenci a byla ${t.recipient} doporučena vyšší.`,
      reason: "Asistence: Základní",
    });
  }

  // 3) Nevybraná doplňková krytí
  const missingCovers: string[] = [];
  if (!data.glass) missingCovers.push("Skla");
  if (!data.collisionAnimal) missingCovers.push("Střet se zvěří");
  if (!data.naturalHazard) missingCovers.push("Živel");
  if (!data.vandalism) missingCovers.push("Vandalismus");
  if (!data.animalDamage) missingCovers.push("Poškození zvířetem");
  if (!data.theft) missingCovers.push("Odcizení");
  const someCoverMissing =
    missingCovers.length > 0;

  if (someCoverMissing) {
    recs.push({
      text: `${t.ClientDative} byly doporučeny doplňková připojištění přesto je nepožaduje.`,
      reason: `Chybí krytí: ${missingCovers.join(", ")}`,
    });
  }

  // 4) Roční nájezd – jen Allianz & Pillow
  if (
    data.annualMileage &&
    (currentInsurer === "allianz" || currentInsurer === "pillow")
  ) {
    recs.push({
      text: `${t.Client} si ${t.chose} roční nájezd ${data.annualMileage} a ${t.wasWarned}, že musí vyfotit tachometr a v případě překročení ${t.recipient} bude pojistné dopočítáno dle tabulky ve smlouvě.`,
      reason: `${currentInsurer === "allianz" ? "Allianz" : "Pillow"} + nájezd ${data.annualMileage}`,
    });
  }

  // 5) Allianz & Pillow – vybraná rizika s limitem na obvyklou cenu
  if (currentInsurer === "allianz" || currentInsurer === "pillow") {
    const usualPriceLimitCovers = getUsualPriceLimitCovers(data);

    if (usualPriceLimitCovers.length > 0) {
      const insurerLabel = getInsurerLabel(currentInsurer);
      const joined = usualPriceLimitCovers.join(", ");
      recs.push({
        text: `${t.Client} ${t.wasWarned}, že u produktu ${insurerLabel} je u připojištění ${joined} standardně nastaven limit pojistného plnění na obvyklou cenu vozidla.`,
        reason: `${insurerLabel}: limit na obvyklou cenu`,
      });
    }
  }

  // 6) Extrabenefit Profi – POUZE pokud nahoře zvolena ČPP
  if (data.discountCppProfi && currentInsurer === "cpp") {
    recs.push({
      text: `${t.Client} ${t.wasWarned}, že pokud dojde v následujícím tříletém období k pojistné události, pojistník se zavazuje pojistiteli vrátit slevu za poskytnutý EBP na pojistném za všechna pojistná období, v nichž byla sleva od počátku pojištění poskytnuta.`,
      reason: "ČPP + Extrabenefit Profi",
    });
  }

  // 7) Sleva za neoriginální sklo
  if (data.discountUniqaNonOemGlass) {
    recs.push({
      text: `${t.Client} si přeje využít slevu na neoriginální sklo.`,
      reason: "Sleva: neoriginální sklo",
    });
  }

  return recs;
}

function buildProductRecommendations(
  data: CarResultsInput | null,
  recommendedInsurer: Insurer | null
): string[] {
  if (!data || !recommendedInsurer) return [];

  const recs: string[] = [];

  switch (recommendedInsurer) {
    case "cpp": {
      const limitStr = data.liabilityLimit ?? "";
      const has100 =
        limitStr.includes("100/100") || limitStr.includes("100 / 100");
      const has200 =
        limitStr.includes("200/200") || limitStr.includes("200 / 200");

      // Připojištění SmartGAP, ServisPRO, Asistence – jen u 200/200
      if (has200) {
        recs.push(
          "Připojištění SmartGAP, ServisPRO a Asistence v ČR a zahraničí součástí POV."
        );
      }

      // Extrabenefit Profi – info v produktovém doporučení
      if (data.discountCppProfi) {
        recs.push("Možnost slevy Extrabenefit Profi.");
      }

      // Vozík zdarma – 100/100 nebo 200/200
      if (has100 || has200) {
        recs.push("Lze sjednat vozík do 750 kg zdarma.");
      }

      // ESO – pokud je havarijko a určitá spoluúčast
      if (data.hasCasco && data.cascoDeductible) {
        const d = data.cascoDeductible;
        const matchesEso =
          d === "3% min. 3.000 Kč" ||
          d === "5% min. 5.000 Kč" ||
          d === "5.000 Kč";
        if (matchesEso) {
          recs.push("Připojištění ESO.");
        }
      }

      break;
    }

    case "allianz": {
      recs.push("Málo jezdím, málo platím.");

      const covers = getUsualPriceLimitCovers(data);

      if (covers.length > 0) {
        const joined = covers.join(", ");
        recs.push(
          `Připojištění: ${joined} – limit plnění na obvyklou cenu.`
        );
      }

      break;
    }

    case "pillow": {
      // základní benefit Pillow
      recs.push("Cena pojistného dle ujetých kilometrů.");

      // připojištění s limitem na obvyklou cenu
      const covers = getUsualPriceLimitCovers(data);

      if (covers.length > 0) {
        const joined = covers.join(", ");
        recs.push(
          `Připojištění: ${joined} – limit plnění na obvyklou cenu.`
        );
      }

      break;
    }

    case "uniqa": {
      recs.push(
        "Zdarma součástí pojištění je neomezené odtažení vozidla při nehodě v rámci ČR a SR a pojištění pneumatik."
      );
      break;
    }

    case "kooperativa": {
      recs.push("Koopilot – odměna za bezpečnou jízdu formou cashbacku.");
      break;
    }

    case "csob": {
      recs.push("Pojištění osobních věcí v ceně.");
      break;
    }

    case "slavia": {
      const limitStr = data.liabilityLimit ?? "";

      const has100 =
        limitStr.includes("100/100") || limitStr.includes("100 / 100");
      const has150 =
        limitStr.includes("150/150") || limitStr.includes("150 / 150");
      const has200 =
        limitStr.includes("200/200") || limitStr.includes("200 / 200");

      // Garance ceny na 3 roky – 150/150 nebo 200/200
      if (has150 || has200) {
        recs.push("Garance ceny na 3 roky.");
      }

      // Ztráta/odcizení klíčů v ceně – 100/100 nebo 150/150 nebo 200/200
      if (has100 || has150 || has200) {
        recs.push("Ztráta nebo odcizení klíčů v ceně.");
      }

      // Připojištění pneumatik v ceně – 200/200
      if (has200) {
        recs.push("Připojištění pneumatik v ceně.");
      }

      break;
    }

    // ostatní doplníme později
    default:
      break;
  }

  return recs;
}

export default function CarResultsPage() {
  return <MeetingRecordSession>{(owner) => <CarResults owner={owner} />}</MeetingRecordSession>;
}

function InsurerPicker({ value, onChange, label }: {
  value: Insurer | null;
  onChange: (value: Insurer | null) => void;
  label: string;
}) {
  return (
    <div className={resultStyles.insurerPicker} role="group" aria-label={label}>
      {INSURER_OPTIONS.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(value === option.id ? null : option.id)}>
          {value === option.id && <Check size={14} aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CarResults({ owner }: { owner: MeetingRecordContext }) {
  const [data] = useState(() => readMeetingRecord<CarResultsInput>("carResults", owner));
  const { copiedText, feedback, handleCopy } = useRecordClipboard();
  const [currentInsurer, setCurrentInsurer] = useState<Insurer | null>(null);
  const [recommendedInsurer, setRecommendedInsurer] = useState<Insurer | null>(null);

  const t = getRecordClientWords(data?.clientGender);
  const recs = buildRecommendations(data, currentInsurer);
  const productRecs = buildProductRecommendations(data, recommendedInsurer);

  return (
    <AppLayout active="tools">
      <div className={`${styles.page} ${styles.results} ${resultStyles.page}`}>
        <Link href="/pomucky/zaznam" className={styles.back}><ArrowLeft size={15} aria-hidden="true" /> Upravit zadání</Link>
        <header className={`${styles.hero} ${resultStyles.hero}`}>
          <div>
            <span className={styles.eyebrow}><Sparkles size={14} aria-hidden="true" /> Pojištění vozidel · Výsledky</span>
            <h1>Texty do záznamu z jednání</h1>
            <p>Vyber sjednávanou pojišťovnu. Doporučení se přizpůsobí tvému zadání a můžeš je zkopírovat jednotlivě nebo najednou.</p>
          </div>
          <div className={`${styles.illustration} ${resultStyles.heroIllustration}`}><RecordIllustration complete /></div>
        </header>
        {data && <nav className={`${resultStyles.navigation} ${resultStyles.carNavigation}`} aria-label="Části záznamu">
          <a href="#pojistovna"><b>1</b> Pojišťovna</a>
          <a href="#dopady"><b>2</b> Dopady <small>{recs.length === 1 ? "1 text" : recs.length < 5 ? `${recs.length} texty` : `${recs.length} textů`}</small></a>
          <a href="#produkty"><b>3</b> Doporučení produktu</a>
        </nav>}

        {!data ? (
          <div className={resultStyles.notice}>
            <p>Nejprve vyplň pojištění vozidla a přejdi na výsledky. Potom tu najdeš texty připravené podle tvého zadání.</p>
            <Link href="/pomucky/zaznam" className={`${resultStyles.copyAction} mt-3`}><ArrowLeft size={15} aria-hidden="true" /> Vyplnit záznam z jednání</Link>
          </div>
        ) : (
          <>
            <ResultSection
              id="pojistovna"
              eyebrow="Krok 1"
              title="Jakou pojišťovnu sjednáváš?"
              description="Výběr doplní do dopadů také upozornění pro konkrétní pojišťovnu."
              copiedText={copiedText}
              onCopy={handleCopy}
            >
              <InsurerPicker value={currentInsurer} onChange={setCurrentInsurer} label="Sjednávaná pojišťovna" />
              {!currentInsurer && <p className={resultStyles.muted}>Zatím vidíš obecná doporučení. Pro úplný výstup vyber pojišťovnu.</p>}
            </ResultSection>

            <ResultSection
              id="dopady"
              eyebrow="Část 2"
              title="Popis dopadů sjednání pojištění"
              description="Hotové věty pro dopady nebo záznam z jednání. Poznámka nad textem ukazuje, z čeho doporučení vychází."
              countLabel={recs.length === 1 ? "1 text" : recs.length < 5 ? `${recs.length} texty` : `${recs.length} textů`}
              copyText={recs.map((rec) => rec.text).join("\n")}
              copiedText={copiedText}
              onCopy={handleCopy}
            >
              {recs.map((rec, index) => <ResultTextRow key={rec.text} index={index + 1} text={rec.text} reason={rec.reason} copiedText={copiedText} onCopy={handleCopy} />)}
            </ResultSection>

            <ResultSection
              id="produkty"
              eyebrow="Část 3"
              title="Doporučení pojistného produktu"
              description={`Doporuč ${t.clientDative} alespoň 2 pojišťovny. Výběrem zobrazíš přehled výhod pro každý produkt zvlášť.`}
              copyText={productRecs.length > 0 ? productRecs.join("\n") : undefined}
              copiedText={copiedText}
              onCopy={handleCopy}
            >
              <InsurerPicker value={recommendedInsurer} onChange={setRecommendedInsurer} label="Doporučovaná pojišťovna" />
              {productRecs.length > 0 ? productRecs.map((text, index) => (
                <ResultTextRow key={text} index={index + 1} text={text} copiedText={copiedText} onCopy={handleCopy} />
              )) : <p className={resultStyles.muted}>{recommendedInsurer ? "Pro tuto kombinaci nemám připravené další produktové poznámky." : "Vyber pojišťovnu a zobrazí se výhody podle nastavení pojištění vozidla."}</p>}
            </ResultSection>
          </>
        )}
        <div className={resultStyles.footer}>
          <Link href="/pomucky/zaznam" className={resultStyles.copyAction}><ArrowLeft size={15} aria-hidden="true" /> Upravit zadání</Link>
        </div>
        <CopyFeedback feedback={feedback} />
      </div>
    </AppLayout>
  );
}

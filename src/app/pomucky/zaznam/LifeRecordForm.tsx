// src/app/pomucky/zaznam/LifeRecordForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WaiverInvalidityScope = "twoAndThree" | "threeOnly";
type InvalidityDegreesSelection = "all" | "twoAndThree" | "threeOnly";
type DecreasingType = "constant" | "linear" | "interest";

type CriticalType = DecreasingType;

type PermanentProgress = "none" | "x4" | "x5" | "x10";
type PermanentStart = "from0" | "from0001" | "from05" | "from10";

type DailyStart = "from1" | "from22";
type DailyProgress = "none" | "with";

type BodilyStart = "from0" | "from6";

type SickStart = "day15" | "day29" | "day60";
type SickVariant = "retroFrom1" | "nonRetro";

type ChildrenAccidentType = "same" | "half";

function normalizeAmountInput(
  raw: string,
  opts?: { min?: number; max?: number }
): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  let num = parseInt(digits, 10);
  if (Number.isNaN(num)) return "";
  if (opts?.max != null && num > opts.max) num = opts.max;
  if (opts?.min != null && num < opts.min) num = opts.min;
  return String(num);
}

// helper pro převod string -> číslo
function parseAmount(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function LifeRecordForm() {
  const router = useRouter();

  // --------------------------------------------------
  // ZÁKLAD – SMRT, DOŽITÍ, ZPROŠTĚNÍ, INVALIDITY
  // --------------------------------------------------

  // Smrt / dožití
  const [deathOn, setDeathOn] = useState(false);
  const [deathAmount, setDeathAmount] = useState("");

  // Smrt – terminální stádium
  const [terminalOn, setTerminalOn] = useState(false);
  const [terminalAmount, setTerminalAmount] = useState("");

  // Doplňkové pojištění pro případ smrti
  const [extraDeathOn, setExtraDeathOn] = useState(false);
  const [extraDeathConstantOn, setExtraDeathConstantOn] = useState(false);
  const [extraDeathConstantAmount, setExtraDeathConstantAmount] =
    useState("");
  const [extraDeathDecreasingOn, setExtraDeathDecreasingOn] =
    useState(false);
  const [extraDeathDecreasingAmount, setExtraDeathDecreasingAmount] =
    useState("");
  const [extraDeathInterestOn, setExtraDeathInterestOn] = useState(false);
  const [extraDeathInterestAmount, setExtraDeathInterestAmount] =
    useState("");

  // Důchod pro pozůstalé
  const [survivorPensionOn, setSurvivorPensionOn] = useState(false);
  const [survivorPensionAmount, setSurvivorPensionAmount] = useState("");

  // Zproštění od placení
  const [waiverOn, setWaiverOn] = useState(false);
  const [waiverInvalidityOn, setWaiverInvalidityOn] = useState(true);
  const [waiverInvalidityScope, setWaiverInvalidityScope] =
    useState<WaiverInvalidityScope>("twoAndThree");
  const [waiverJobLossOn, setWaiverJobLossOn] = useState(false);

  // Invalidita – blok 1
  const [invalid1On, setInvalid1On] = useState(false);
  const [invalid1Degrees, setInvalid1Degrees] =
    useState<InvalidityDegreesSelection>("twoAndThree");
  const [invalid1Type, setInvalid1Type] =
    useState<DecreasingType>("constant");
  const [invalid1Amount1, setInvalid1Amount1] = useState("");
  const [invalid1Amount2, setInvalid1Amount2] = useState("");
  const [invalid1Amount3, setInvalid1Amount3] = useState("");

  // Invalidita – blok 2
  const [invalid2On, setInvalid2On] = useState(false);
  const [invalid2Degrees, setInvalid2Degrees] =
    useState<InvalidityDegreesSelection>("twoAndThree");
  const [invalid2Type, setInvalid2Type] =
    useState<DecreasingType>("constant");
  const [invalid2Amount1, setInvalid2Amount1] = useState("");
  const [invalid2Amount2, setInvalid2Amount2] = useState("");
  const [invalid2Amount3, setInvalid2Amount3] = useState("");

  // --------------------------------------------------
  // ZÁVAŽNÁ ONEMOCNĚNÍ & ZDRAVÍ
  // --------------------------------------------------

  // Závažná onemocnění a poranění – 1
  const [ci1On, setCi1On] = useState(false);
  const [ci1Type, setCi1Type] = useState<CriticalType>("constant");
  const [ci1Repeat, setCi1Repeat] = useState(false);
  const [ci1Amount, setCi1Amount] = useState("");

  // Závažná onemocnění a poranění – 2
  const [ci2On, setCi2On] = useState(false);
  const [ci2Type, setCi2Type] = useState<CriticalType>("constant");
  const [ci2Repeat, setCi2Repeat] = useState(false);
  const [ci2Amount, setCi2Amount] = useState("");

  // Vážná onemocnění – Pro něj / Pro ni
  const [seriousHimOn, setSeriousHimOn] = useState(false);
  const [seriousHimAmount, setSeriousHimAmount] = useState("");
  const [seriousHerOn, setSeriousHerOn] = useState(false);
  const [seriousHerAmount, setSeriousHerAmount] = useState("");

  // Cukrovka a její komplikace (max 1 500 000)
  const [diabetesOn, setDiabetesOn] = useState(false);
  const [diabetesAmount, setDiabetesAmount] = useState("");

  // Závažné následky očkování (max 1 000 000)
  const [vaccinationOn, setVaccinationOn] = useState(false);
  const [vaccinationAmount, setVaccinationAmount] = useState("");

  // --------------------------------------------------
  // ÚRAZOVÁ KRYTÍ + PN + HOSPITALIZACE
  // --------------------------------------------------

  // Smrt úrazem
  const [deathAccOn, setDeathAccOn] = useState(false);
  const [deathAccAmount, setDeathAccAmount] = useState("");
  const [deathAccDoubleCar, setDeathAccDoubleCar] = useState(false);

  // Trvalé následky úrazu – blok 1
  const [perm1On, setPerm1On] = useState(false);
  const [perm1Progress, setPerm1Progress] =
    useState<PermanentProgress>("none");
  const [perm1From, setPerm1From] = useState<PermanentStart>("from0");
  const [perm1Amount, setPerm1Amount] = useState("");

  // Trvalé následky úrazu – blok 2
  const [perm2On, setPerm2On] = useState(false);
  const [perm2Progress, setPerm2Progress] =
    useState<PermanentProgress>("none");
  const [perm2From, setPerm2From] = useState<PermanentStart>("from0");
  const [perm2Amount, setPerm2Amount] = useState("");

  // Denní odškodné po úrazu
  const [dailyOn, setDailyOn] = useState(false);
  const [dailyFrom, setDailyFrom] = useState<DailyStart>("from1");
  const [dailyProgress, setDailyProgress] =
    useState<DailyProgress>("none");
  const [dailyAmount, setDailyAmount] = useState("");

  // Tělesné poškození
  const [bodilyOn, setBodilyOn] = useState(false);
  const [bodilyFrom, setBodilyFrom] = useState<BodilyStart>("from0");
  const [bodilyAmount, setBodilyAmount] = useState("");

  // Pracovní neschopnost – blok 1
  const [sick1On, setSick1On] = useState(false);
  const [sick1From, setSick1From] = useState<SickStart>("day15");
  const [sick1Variant, setSick1Variant] =
    useState<SickVariant>("retroFrom1");
  const [sick1Amount, setSick1Amount] = useState("");
  const [sickAccident1, setSickAccident1] = useState(false);
  const [sickIllness1, setSickIllness1] = useState(false);

  // Pracovní neschopnost – blok 2
  const [sick2On, setSick2On] = useState(false);
  const [sick2From, setSick2From] = useState<SickStart>("day15");
  const [sick2Variant, setSick2Variant] =
    useState<SickVariant>("retroFrom1");
  const [sick2Amount, setSick2Amount] = useState("");
  const [sickAccident2, setSickAccident2] = useState(false);
  const [sickIllness2, setSickIllness2] = useState(false);

  // Hospitalizace
  const [hospitalOn, setHospitalOn] = useState(false);
  const [hospitalAccidentOn, setHospitalAccidentOn] = useState(true);
  const [hospitalAccidentAmount, setHospitalAccidentAmount] =
    useState("");
  const [hospitalIllnessOn, setHospitalIllnessOn] = useState(true);
  const [hospitalIllnessAmount, setHospitalIllnessAmount] =
    useState("");
  const [hospitalProgressive, setHospitalProgressive] = useState(false);

  // --------------------------------------------------
  // DĚTI, PÉČE, POMŮCKY, ASISTENCE
  // --------------------------------------------------

  // Operace dítěte s vrozenou vadou (100 000 – 500 000)
  const [childOperationOn, setChildOperationOn] = useState(false);
  const [hasExistingContract, setHasExistingContract] = useState<"yes" | "no">(
    "no"
  );
  const [childOperationAmount, setChildOperationAmount] = useState("");

  // Připojištění dětí – úraz dospělého
  const [childrenAccidentOn, setChildrenAccidentOn] = useState(false);
  const [childrenAccidentType, setChildrenAccidentType] =
    useState<ChildrenAccidentType>("same");
  const [childrenAccidentAmount, setChildrenAccidentAmount] =
    useState("");

  // Náklady asistované reprodukce
  const [assistedOn, setAssistedOn] = useState(false);
  const [assistedAmount, setAssistedAmount] = useState("");

  // Závislost na péči II.–IV. stupně (100 000 – 3 000 000)
  const [careDependenceOn, setCareDependenceOn] = useState(false);
  const [careDependenceAmount, setCareDependenceAmount] =
    useState("");

  // Celodenní ošetřování pojistného
  const [fullCareOn, setFullCareOn] = useState(false);
  const [fullCareAmount, setFullCareAmount] = useState("");

  // Příspěvek na pořízení zvláštní pomůcky (pevně 100 000)
  const [specialAidOn, setSpecialAidOn] = useState(false);
  const [specialAidAmount, setSpecialAidAmount] = useState("100000");

  // Zdravotní a sociální asistence
  const [healthSocialOn, setHealthSocialOn] = useState(false);

  // --------------------------------------------------
  // INPUT HELPERY
  // --------------------------------------------------

  const moneyInputProps = {
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
  };

  const renderAmountInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    opts?: { min?: number; max?: number }
  ) => (
    <input
      {...moneyInputProps}
      className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/80 focus:border-sky-500/80"
      value={value}
      onChange={(e) => onChange(normalizeAmountInput(e.target.value, opts))}
      placeholder={placeholder}
    />
  );

  const renderLabeledAmountInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { min?: number; max?: number }
  ) => (
    <div className="space-y-1">
      <p className="text-[11px] sm:text-xs text-slate-400">{label}</p>
      {renderAmountInput(value, onChange, label, opts)}
    </div>
  );

  // Reusable blok pro invaliditu (použijeme 2×)
  const renderInvalidityBlock = (
    title: string,
    enabled: boolean,
    onToggle: () => void,
    degrees: InvalidityDegreesSelection,
    setDegrees: (v: InvalidityDegreesSelection) => void,
    type: DecreasingType,
    setType: (v: DecreasingType) => void,
    a1: string,
    setA1: (v: string) => void,
    a2: string,
    setA2: (v: string) => void,
    a3: string,
    setA3: (v: string) => void
  ) => (
    <BenefitCard
      title={title}
      subtitle="Možnost rozdílných částek pro jednotlivé stupně invalidity."
      enabled={enabled}
      onToggle={onToggle}
    >
      {enabled && (
        <div className="mt-3 space-y-4 text-xs sm:text-sm text-slate-200">
          {/* Rozsah stupňů */}
          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Rozsah stupňů invalidity:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={degrees === "all"}
                onClick={() => setDegrees("all")}
              >
                1., 2. a 3. stupeň
              </ChipButton>
              <ChipButton
                active={degrees === "twoAndThree"}
                onClick={() => setDegrees("twoAndThree")}
              >
                2. a 3. stupeň
              </ChipButton>
              <ChipButton
                active={degrees === "threeOnly"}
                onClick={() => setDegrees("threeOnly")}
              >
                Pouze 3. stupeň
              </ChipButton>
            </div>
          </div>

          {/* Typ plnění */}
          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Typ plnění:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={type === "constant"}
                onClick={() => setType("constant")}
              >
                Konstantní
              </ChipButton>
              <ChipButton
                active={type === "linear"}
                onClick={() => setType("linear")}
              >
                Klesající
              </ChipButton>
              <ChipButton
                active={type === "interest"}
                onClick={() => setType("interest")}
              >
                Klesající dle úroku
              </ChipButton>
            </div>
          </div>

          {/* Částky dle zvolených stupňů */}
          <div className="space-y-3">
            {degrees === "all" && (
              <>
                {renderLabeledAmountInput(
                  "Invalidita 1. stupně (Kč)",
                  a1,
                  setA1
                )}
                {renderLabeledAmountInput(
                  "Invalidita 2. stupně (Kč)",
                  a2,
                  setA2
                )}
                {renderLabeledAmountInput(
                  "Invalidita 3. stupně (Kč)",
                  a3,
                  setA3
                )}
              </>
            )}

            {degrees === "twoAndThree" && (
              <>
                {renderLabeledAmountInput(
                  "Invalidita 2. stupně (Kč)",
                  a2,
                  setA2
                )}
                {renderLabeledAmountInput(
                  "Invalidita 3. stupně (Kč)",
                  a3,
                  setA3
                )}
              </>
            )}

            {degrees === "threeOnly" && (
              <>
                {renderLabeledAmountInput(
                  "Invalidita 3. stupně (Kč)",
                  a3,
                  setA3
                )}
              </>
            )}
          </div>
        </div>
      )}
    </BenefitCard>
  );

  // Reusable blok pro „Závažná onemocnění a poranění“
  const renderCriticalIllnessBlock = (
    enabled: boolean,
    onToggle: () => void,
    type: CriticalType,
    setType: (v: CriticalType) => void,
    repeat: boolean,
    setRepeat: (v: boolean) => void,
    amount: string,
    setAmount: (v: string) => void
  ) => (
    <BenefitCard
      title="Závažná onemocnění a poranění"
      subtitle="Možnost opakovaného plnění."
      enabled={enabled}
      onToggle={onToggle}
    >
      {enabled && (
        <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
          {renderAmountInput(
            amount,
            setAmount,
            "Pojistná částka (Kč)"
          )}

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Typ plnění:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={type === "constant"}
                onClick={() => setType("constant")}
              >
                Konstantní
              </ChipButton>
              <ChipButton
                active={type === "linear"}
                onClick={() => setType("linear")}
              >
                Klesající
              </ChipButton>
              <ChipButton
                active={type === "interest"}
                onClick={() => setType("interest")}
              >
                Klesající dle úroku
              </ChipButton>
            </div>
          </div>

          <ToggleRow
            label="Opakované plnění"
            checked={repeat}
            onChange={setRepeat}
          />
        </div>
      )}
    </BenefitCard>
  );

  // Reusable blok pro trvalé následky úrazu
  const renderPermanentInjuryBlock = (
    enabled: boolean,
    onToggle: () => void,
    progress: PermanentProgress,
    setProgress: (v: PermanentProgress) => void,
    from: PermanentStart,
    setFrom: (v: PermanentStart) => void,
    amount: string,
    setAmount: (v: string) => void
  ) => (
    <BenefitCard
      title="Trvalé následky úrazu"
      enabled={enabled}
      onToggle={onToggle}
    >
      {enabled && (
        <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
          {renderAmountInput(amount, setAmount, "Pojistná částka (Kč)")}

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Progrese:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={progress === "none"}
                onClick={() => setProgress("none")}
              >
                Bez progrese
              </ChipButton>
              <ChipButton
                active={progress === "x4"}
                onClick={() => setProgress("x4")}
              >
                4× progrese
              </ChipButton>
              <ChipButton
                active={progress === "x5"}
                onClick={() => setProgress("x5")}
              >
                5× progrese
              </ChipButton>
              <ChipButton
                active={progress === "x10"}
                onClick={() => setProgress("x10")}
              >
                10× progrese
              </ChipButton>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Plnění od:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={from === "from0"}
                onClick={() => setFrom("from0")}
              >
                od 0 %
              </ChipButton>
              <ChipButton
                active={from === "from0001"}
                onClick={() => setFrom("from0001")}
              >
                od 0,001 %
              </ChipButton>
              <ChipButton
                active={from === "from05"}
                onClick={() => setFrom("from05")}
              >
                od 0,5 %
              </ChipButton>
              <ChipButton
                active={from === "from10"}
                onClick={() => setFrom("from10")}
              >
                od 10 %
              </ChipButton>
            </div>
          </div>
        </div>
      )}
    </BenefitCard>
  );

  // Reusable blok pro PN
  const renderSickLeaveBlock = (
    enabled: boolean,
    onToggle: () => void,
    from: SickStart,
    setFrom: (v: SickStart) => void,
    variant: SickVariant,
    setVariant: (v: SickVariant) => void,
    amount: string,
    setAmount: (v: string) => void,
    accident: boolean,
    setAccident: (v: boolean) => void,
    illness: boolean,
    setIllness: (v: boolean) => void
  ) => (
    <BenefitCard
      title="Pracovní neschopnost"
      enabled={enabled}
      onToggle={onToggle}
    >
      {enabled && (
        <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
          {renderAmountInput(amount, setAmount, "Denní dávka (Kč)")}

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Plnění od:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={from === "day15"}
                onClick={() => setFrom("day15")}
              >
                od 15. dne
              </ChipButton>
              <ChipButton
                active={from === "day29"}
                onClick={() => setFrom("day29")}
              >
                od 29. dne
              </ChipButton>
              <ChipButton
                active={from === "day60"}
                onClick={() => setFrom("day60")}
              >
                od 60. dne
              </ChipButton>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">
              Varianta plnění:
            </p>
            <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
              <ChipButton
                active={variant === "retroFrom1"}
                onClick={() => setVariant("retroFrom1")}
              >
                Zpětně od 1. dne
              </ChipButton>
              <ChipButton
                active={variant === "nonRetro"}
                onClick={() => setVariant("nonRetro")}
              >
                Nezpětně
              </ChipButton>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-400">Plnění:</p>
            <div className="flex flex-wrap gap-2">
              <ChipButton
                active={accident}
                onClick={() => setAccident(!accident)}
              >
                Úrazem
              </ChipButton>
              <ChipButton
                active={illness}
                onClick={() => setIllness(!illness)}
              >
                Nemocí
              </ChipButton>
            </div>
          </div>
        </div>
      )}
    </BenefitCard>
  );

  // --------------------------------------------------
  // VÝSLEDKY – klik na zelené tlačítko
  // --------------------------------------------------

  const handleResultsClick = () => {
    const hasInvalidity = invalid1On || invalid2On;

    let totalInvalidity = 0;

    if (invalid1On) {
      totalInvalidity += parseAmount(invalid1Amount1);
      totalInvalidity += parseAmount(invalid1Amount2);
      totalInvalidity += parseAmount(invalid1Amount3);
    }

    if (invalid2On) {
      totalInvalidity += parseAmount(invalid2Amount1);
      totalInvalidity += parseAmount(invalid2Amount2);
      totalInvalidity += parseAmount(invalid2Amount3);
    }

    const payload = {
      hasInvalidity,
      totalInvalidity,
      hasCriticalIllness: ci1On || ci2On,
      hasSeriousIllness: seriousHimOn || seriousHerOn,
      hasExistingContract: hasExistingContract === "yes",
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "lifeRecordResultInput",
        JSON.stringify(payload)
      );
    }

    router.push("/pomucky/zaznam/vysledky");
  };

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Header sekce */}
      <div className="mb-1">
        <h2 className="text-base sm:text-lg font-semibold text-slate-50">
          Životní pojištění – přehled sjednávaných krytí
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 mt-1">
          Zaklikni rizika, která s klientem řešíš, a doplň jejich částky.
          Slouží jako tahák k vyplnění Záznamu z jednání.
        </p>
      </div>

      {/* Všechny glassy boxy ve 2 sloupcích */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1) Smrt / dožití */}
        <BenefitCard
          title="Smrt nebo dožití"
          subtitle="Možnost nastavení pojistné částky."
          enabled={deathOn}
          onToggle={() => setDeathOn((v) => !v)}
        >
          {deathOn &&
            renderAmountInput(
              deathAmount,
              setDeathAmount,
              "Pojistná částka při smrti / dožití (Kč)"
            )}
        </BenefitCard>

        {/* 2) Smrt – terminální stádium */}
        <BenefitCard
          title="Smrt – terminální stádium"
          enabled={terminalOn}
          onToggle={() => setTerminalOn((v) => !v)}
        >
          {terminalOn &&
            renderAmountInput(
              terminalAmount,
              setTerminalAmount,
              "Pojistná částka pro terminální stádium (Kč)"
            )}
        </BenefitCard>

        {/* 3) Doplňkové pojištění pro případ smrti */}
        <BenefitCard
          title="Doplňkové pojištění pro případ smrti"
          subtitle="Možnost více forem plnění."
          enabled={extraDeathOn}
          onToggle={() => setExtraDeathOn((v) => !v)}
        >
          {extraDeathOn && (
            <div className="mt-3 space-y-4">
              <ToggleRow
                label="Konstantní pojistná částka"
                checked={extraDeathConstantOn}
                onChange={setExtraDeathConstantOn}
              />
              {extraDeathConstantOn &&
                renderAmountInput(
                  extraDeathConstantAmount,
                  setExtraDeathConstantAmount,
                  "Částka – konstantní (Kč)"
                )}

              <ToggleRow
                label="Klesající částka"
                checked={extraDeathDecreasingOn}
                onChange={setExtraDeathDecreasingOn}
              />
              {extraDeathDecreasingOn &&
                renderAmountInput(
                  extraDeathDecreasingAmount,
                  setExtraDeathDecreasingAmount,
                  "Částka – klesající (Kč)"
                )}

              <ToggleRow
                label="Klesající dle úroku z úvěru"
                checked={extraDeathInterestOn}
                onChange={setExtraDeathInterestOn}
              />
              {extraDeathInterestOn &&
                renderAmountInput(
                  extraDeathInterestAmount,
                  setExtraDeathInterestAmount,
                  "Částka – dle úroku (Kč)"
                )}
            </div>
          )}
        </BenefitCard>

        {/* 4) Důchod pro pozůstalé */}
        <BenefitCard
          title="Důchod pro pozůstalé"
          subtitle="Měsíční částka pro pozůstalé."
          enabled={survivorPensionOn}
          onToggle={() => setSurvivorPensionOn((v) => !v)}
        >
          {survivorPensionOn &&
            renderAmountInput(
              survivorPensionAmount,
              setSurvivorPensionAmount,
              "Měsíční důchod (Kč)"
            )}
        </BenefitCard>

        {/* 5) Zproštění od placení pojistného */}
        <BenefitCard
          title="Zproštění od placení pojistného"
          subtitle="Bez částky – nastav jen podmínky."
          enabled={waiverOn}
          onToggle={() => setWaiverOn((v) => !v)}
        >
          {waiverOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              <ToggleRow
                label="Přiznání invalidity"
                checked={waiverInvalidityOn}
                onChange={setWaiverInvalidityOn}
              />

              {waiverInvalidityOn && (
                <div className="ml-1 space-y-1">
                  <p className="text-[11px] text-slate-400">
                    Rozsah invalidity:
                  </p>
                  <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
                    <ChipButton
                      active={waiverInvalidityScope === "twoAndThree"}
                      onClick={() =>
                        setWaiverInvalidityScope("twoAndThree")
                      }
                    >
                      2. a 3. stupeň
                    </ChipButton>
                    <ChipButton
                      active={waiverInvalidityScope === "threeOnly"}
                      onClick={() =>
                        setWaiverInvalidityScope("threeOnly")
                      }
                    >
                      Pouze 3. stupeň
                    </ChipButton>
                  </div>
                </div>
              )}

              <ToggleRow
                label="Ztráta zaměstnání"
                checked={waiverJobLossOn}
                onChange={setWaiverJobLossOn}
              />
            </div>
          )}
        </BenefitCard>

        {/* 6) Invalidita – blok 1 */}
        {renderInvalidityBlock(
          "Invalidita",
          invalid1On,
          () => setInvalid1On((v) => !v),
          invalid1Degrees,
          setInvalid1Degrees,
          invalid1Type,
          setInvalid1Type,
          invalid1Amount1,
          setInvalid1Amount1,
          invalid1Amount2,
          setInvalid1Amount2,
          invalid1Amount3,
          setInvalid1Amount3
        )}

        {/* 7) Invalidita – blok 2 */}
        {renderInvalidityBlock(
          "Invalidita",
          invalid2On,
          () => setInvalid2On((v) => !v),
          invalid2Degrees,
          setInvalid2Degrees,
          invalid2Type,
          setInvalid2Type,
          invalid2Amount1,
          setInvalid2Amount1,
          invalid2Amount2,
          setInvalid2Amount2,
          invalid2Amount3,
          setInvalid2Amount3
        )}

        {/* 8) Závažná onemocnění a poranění – 1 */}
        {renderCriticalIllnessBlock(
          ci1On,
          () => setCi1On((v) => !v),
          ci1Type,
          setCi1Type,
          ci1Repeat,
          setCi1Repeat,
          ci1Amount,
          setCi1Amount
        )}

        {/* 9) Závažná onemocnění a poranění – 2 */}
        {renderCriticalIllnessBlock(
          ci2On,
          () => setCi2On((v) => !v),
          ci2Type,
          setCi2Type,
          ci2Repeat,
          setCi2Repeat,
          ci2Amount,
          setCi2Amount
        )}

        {/* 10) Vážná onemocnění – Pro něj */}
        <BenefitCard
          title="Vážná onemocnění – Pro něj"
          enabled={seriousHimOn}
          onToggle={() => setSeriousHimOn((v) => !v)}
        >
          {seriousHimOn &&
            renderAmountInput(
              seriousHimAmount,
              setSeriousHimAmount,
              "Pojistná částka (Kč)"
            )}
        </BenefitCard>

        {/* 11) Vážná onemocnění – Pro ni */}
        <BenefitCard
          title="Vážná onemocnění – Pro ni"
          enabled={seriousHerOn}
          onToggle={() => setSeriousHerOn((v) => !v)}
        >
          {seriousHerOn &&
            renderAmountInput(
              seriousHerAmount,
              setSeriousHerAmount,
              "Pojistná částka (Kč)"
            )}
        </BenefitCard>

        {/* 12) Cukrovka a její komplikace */}
        <BenefitCard
          title="Cukrovka a její komplikace"
          subtitle="Maximálně 1 500 000 Kč."
          enabled={diabetesOn}
          onToggle={() => setDiabetesOn((v) => !v)}
        >
          {diabetesOn &&
            renderAmountInput(
              diabetesAmount,
              setDiabetesAmount,
              "Pojistná částka (Kč)",
              { max: 1_500_000 }
            )}
        </BenefitCard>

        {/* 13) Závažné následky očkování */}
        <BenefitCard
          title="Závažné následky očkování"
          enabled={vaccinationOn}
          onToggle={() => setVaccinationOn((v) => !v)}
        >
          {vaccinationOn &&
            renderAmountInput(
              vaccinationAmount,
              setVaccinationAmount,
              "Pojistná částka (Kč)",
              { max: 1_000_000 }
            )}
        </BenefitCard>

        {/* 14) Smrt úrazem */}
        <BenefitCard
          title="Smrt úrazem"
          enabled={deathAccOn}
          onToggle={() => setDeathAccOn((v) => !v)}
        >
          {deathAccOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              {renderAmountInput(
                deathAccAmount,
                setDeathAccAmount,
                "Pojistná částka (Kč)"
              )}
              <ToggleRow
                label="Dvojnásobné plnění při autonehodě"
                checked={deathAccDoubleCar}
                onChange={setDeathAccDoubleCar}
              />
            </div>
          )}
        </BenefitCard>

        {/* 15) Trvalé následky úrazu – 1 */}
        {renderPermanentInjuryBlock(
          perm1On,
          () => setPerm1On((v) => !v),
          perm1Progress,
          setPerm1Progress,
          perm1From,
          setPerm1From,
          perm1Amount,
          setPerm1Amount
        )}

        {/* 16) Trvalé následky úrazu – 2 */}
        {renderPermanentInjuryBlock(
          perm2On,
          () => setPerm2On((v) => !v),
          perm2Progress,
          setPerm2Progress,
          perm2From,
          setPerm2From,
          perm2Amount,
          setPerm2Amount
        )}

        {/* 17) Denní odškodné po úrazu */}
        <BenefitCard
          title="Denní odškodné po úrazu"
          enabled={dailyOn}
          onToggle={() => setDailyOn((v) => !v)}
        >
          {dailyOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              {renderAmountInput(
                dailyAmount,
                setDailyAmount,
                "Denní dávka (Kč)"
              )}

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Plnění od:
                </p>
                <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
                  <ChipButton
                    active={dailyFrom === "from1"}
                    onClick={() => setDailyFrom("from1")}
                  >
                    od 1. dne
                  </ChipButton>
                  <ChipButton
                    active={dailyFrom === "from22"}
                    onClick={() => setDailyFrom("from22")}
                  >
                    od 22. dne
                  </ChipButton>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Progrese:
                </p>
                <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
                  <ChipButton
                    active={dailyProgress === "none"}
                    onClick={() => setDailyProgress("none")}
                  >
                    Bez progrese
                  </ChipButton>
                  <ChipButton
                    active={dailyProgress === "with"}
                    onClick={() => setDailyProgress("with")}
                  >
                    S progresí
                  </ChipButton>
                </div>
              </div>
            </div>
          )}
        </BenefitCard>

        {/* 18) Tělesné poškození */}
        <BenefitCard
          title="Tělesné poškození"
          enabled={bodilyOn}
          onToggle={() => setBodilyOn((v) => !v)}
        >
          {bodilyOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              {renderAmountInput(
                bodilyAmount,
                setBodilyAmount,
                "Pojistná částka (Kč)"
              )}

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Plnění od:
                </p>
                <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
                  <ChipButton
                    active={bodilyFrom === "from0"}
                    onClick={() => setBodilyFrom("from0")}
                  >
                    od 0 %
                  </ChipButton>
                  <ChipButton
                    active={bodilyFrom === "from6"}
                    onClick={() => setBodilyFrom("from6")}
                  >
                    od 6 %
                  </ChipButton>
                </div>
              </div>
            </div>
          )}
        </BenefitCard>

        {/* 19) Pracovní neschopnost – 1 */}
        {renderSickLeaveBlock(
          sick1On,
          () => setSick1On((v) => !v),
          sick1From,
          setSick1From,
          sick1Variant,
          setSick1Variant,
          sick1Amount,
          setSick1Amount,
          sickAccident1,
          setSickAccident1,
          sickIllness1,
          setSickIllness1
        )}

        {/* 20) Pracovní neschopnost – 2 */}
        {renderSickLeaveBlock(
          sick2On,
          () => setSick2On((v) => !v),
          sick2From,
          setSick2From,
          sick2Variant,
          setSick2Variant,
          sick2Amount,
          setSick2Amount,
          sickAccident2,
          setSickAccident2,
          sickIllness2,
          setSickIllness2
        )}

        {/* 21) Hospitalizace */}
        <BenefitCard
          title="Hospitalizace"
          enabled={hospitalOn}
          onToggle={() => setHospitalOn((v) => !v)}
        >
          {hospitalOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              <div className="space-y-2">
                <ToggleRow
                  label="Plnění při úrazu"
                  checked={hospitalAccidentOn}
                  onChange={setHospitalAccidentOn}
                />
                {hospitalAccidentOn &&
                  renderAmountInput(
                    hospitalAccidentAmount,
                    setHospitalAccidentAmount,
                    "Denní dávka – úraz (Kč)"
                  )}

                <ToggleRow
                  label="Plnění při nemoci"
                  checked={hospitalIllnessOn}
                  onChange={setHospitalIllnessOn}
                />
                {hospitalIllnessOn &&
                  renderAmountInput(
                    hospitalIllnessAmount,
                    setHospitalIllnessAmount,
                    "Denní dávka – nemoc (Kč)"
                  )}
              </div>

              <ToggleRow
                label="Progresivní plnění"
                checked={hospitalProgressive}
                onChange={setHospitalProgressive}
              />
            </div>
          )}
        </BenefitCard>

        {/* 22) Operace dítěte s vrozenou vadou */}
        <BenefitCard
          title="Operace dítěte s vrozenou vadou"
          subtitle="Minimálně 100 000 Kč, maximálně 500 000 Kč."
          enabled={childOperationOn}
          onToggle={() => setChildOperationOn((v) => !v)}
        >
          {childOperationOn &&
            renderAmountInput(
              childOperationAmount,
              (v) => setChildOperationAmount(v),
              "Pojistná částka (Kč)",
              { min: 100_000, max: 500_000 }
            )}
        </BenefitCard>

        {/* 23) Připojištění dětí – úraz dospělé osoby */}
        <BenefitCard
          title="Připojištění dětí v rámci úrazového pojištění dospělé osoby"
          enabled={childrenAccidentOn}
          onToggle={() => setChildrenAccidentOn((v) => !v)}
        >
          {childrenAccidentOn && (
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-200">
              {renderAmountInput(
                childrenAccidentAmount,
                setChildrenAccidentAmount,
                "Pojistná částka (Kč)"
              )}

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Typ plnění:
                </p>
                <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
                  <ChipButton
                    active={childrenAccidentType === "same"}
                    onClick={() => setChildrenAccidentType("same")}
                  >
                    Shodné plnění
                  </ChipButton>
                  <ChipButton
                    active={childrenAccidentType === "half"}
                    onClick={() => setChildrenAccidentType("half")}
                  >
                    Poloviční plnění
                  </ChipButton>
                </div>
              </div>
            </div>
          )}
        </BenefitCard>

        {/* 24) Náklady asistované reprodukce */}
        <BenefitCard
          title="Náklady asistované reprodukce"
          enabled={assistedOn}
          onToggle={() => setAssistedOn((v) => !v)}
        >
          {assistedOn &&
            renderAmountInput(
              assistedAmount,
              setAssistedAmount,
              "Pojistná částka (Kč)"
            )}
        </BenefitCard>

        {/* 25) Závislost na péči II.–IV. stupně */}
        <BenefitCard
          title="Závislost na péči II.–IV. stupně"
          subtitle="Minimálně 100 000 Kč, maximálně 3 000 000 Kč."
          enabled={careDependenceOn}
          onToggle={() => setCareDependenceOn((v) => !v)}
        >
          {careDependenceOn &&
            renderAmountInput(
              careDependenceAmount,
              setCareDependenceAmount,
              "Pojistná částka (Kč)",
              { min: 100_000, max: 3_000_000 }
            )}
        </BenefitCard>

        {/* 26) Celodenní ošetřování pojištěného */}
        <BenefitCard
          title="Celodenní ošetřování pojištěného"
          enabled={fullCareOn}
          onToggle={() => setFullCareOn((v) => !v)}
        >
          {fullCareOn &&
            renderAmountInput(
              fullCareAmount,
              setFullCareAmount,
              "Pojistná částka (Kč)"
            )}
        </BenefitCard>

        {/* 27) Příspěvek na pořízení zvláštní pomůcky */}
        <BenefitCard
          title="Příspěvek na pořízení zvláštní pomůcky"
          subtitle="Standardně 100 000 Kč."
          enabled={specialAidOn}
          onToggle={() => setSpecialAidOn((v) => !v)}
        >
          {specialAidOn &&
            renderAmountInput(
              specialAidAmount,
              setSpecialAidAmount,
              "Pojistná částka (Kč)"
            )}
        </BenefitCard>

        {/* 28) Zdravotní a sociální asistence */}
        <BenefitCard
          title="Zdravotní a sociální asistence"
          subtitle="Bez částky – jen zapnout / vypnout."
          enabled={healthSocialOn}
          onToggle={() => setHealthSocialOn((v) => !v)}
        />

        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.8)] space-y-3">
          <div className="text-sm sm:text-base font-semibold text-white">
            Zákazník má již uzavřenou pojistnou smlouvu týkající se stejného
            pojistného zájmu
          </div>
          <div className="inline-flex rounded-full bg-white/5 border border-white/15 p-0.5 text-[11px] sm:text-xs">
            <ChipButton
              active={hasExistingContract === "yes"}
              onClick={() => setHasExistingContract("yes")}
            >
              Ano
            </ChipButton>
            <ChipButton
              active={hasExistingContract === "no"}
              onClick={() => setHasExistingContract("no")}
            >
              Ne
            </ChipButton>
          </div>
        </section>
      </div>

      {/* ZELENÉ GLASSY TLAČÍTKO VÝSLEDKY */}
      <div className="pt-4 flex justify-center">
        <button
          type="button"
          onClick={handleResultsClick}
          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-500/20 px-8 py-2.5 text-sm sm:text-base font-semibold text-emerald-50 shadow-[0_0_25px_rgba(16,185,129,0.55)] hover:bg-emerald-500/30 hover:border-emerald-200 transition"
        >
          <span>📄</span>
          <span>Výsledky</span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Helper komponenty                                            */
/* ------------------------------------------------------------ */

type BenefitCardProps = {
  title: string;
  subtitle?: string;
  enabled: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
};

function BenefitCard({
  title,
  subtitle,
  enabled,
  onToggle,
  children,
}: BenefitCardProps) {
  return (
    <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.8)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left"
      >
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs transition ${
            enabled
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
              : "border-white/40 bg-white/5 text-slate-300"
          }`}
        >
          {enabled ? "✓" : ""}
        </div>
        <div className="flex-1">
          <h3 className="text-sm sm:text-base font-semibold text-slate-50">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </button>

      {enabled && children && (
        <div className="mt-3 border-t border-white/10 pt-3">{children}</div>
      )}
    </section>
  );
}

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
};

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs sm:text-sm text-slate-200">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${
          checked
            ? "bg-emerald-500/80 border-emerald-300"
            : "bg-slate-600/70 border-slate-300/70"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

type ChipButtonProps = {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
};

function ChipButton({ active, children, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full whitespace-nowrap ${
        active ? "bg-white text-slate-900" : "text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

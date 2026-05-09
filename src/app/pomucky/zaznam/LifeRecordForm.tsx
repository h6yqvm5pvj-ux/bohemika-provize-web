// src/app/pomucky/zaznam/LifeRecordForm.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Accessibility,
  AlertTriangle,
  Download,
  FileCheck2,
  FileSignature,
  HeartPulse,
  Shield,
  UsersRound,
  X,
} from "lucide-react";

type WaiverInvalidityScope = "twoAndThree" | "threeOnly";
type InvalidityDegreesSelection = "all" | "twoAndThree" | "threeOnly";
type DecreasingType = "constant" | "linear" | "interest";

type CriticalType = DecreasingType;

type PermanentProgress = "none" | "x4" | "x5" | "x10";
type PermanentStart = "from0" | "from0001" | "from05" | "from10";

type DailyStart = "from1" | "from22";
type DailyProgress = "none" | "with";
type MaxDailyPreviewCarrier = "cpp" | "kooperativa";

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

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getBenefitCardIcon(title: string): React.ReactNode {
  const normalized = normalizeLabel(title);

  if (
    normalized.includes("invalidita") ||
    normalized.includes("zavislost") ||
    normalized.includes("telesne")
  ) {
    return <Accessibility className="h-4 w-4" />;
  }

  if (
    normalized.includes("deti") ||
    normalized.includes("dite") ||
    normalized.includes("asistence")
  ) {
    return <UsersRound className="h-4 w-4" />;
  }

  if (
    normalized.includes("zprosteni") ||
    normalized.includes("duchod") ||
    normalized.includes("pripojisteni") ||
    normalized.includes("prispevek")
  ) {
    return <FileSignature className="h-4 w-4" />;
  }

  if (
    normalized.includes("smrt") ||
    normalized.includes("onemocnen") ||
    normalized.includes("hospitalizace") ||
    normalized.includes("uraz") ||
    normalized.includes("pracovni neschopnost") ||
    normalized.includes("cukrovka") ||
    normalized.includes("ockovani") ||
    normalized.includes("operace")
  ) {
    return <HeartPulse className="h-4 w-4" />;
  }

  return <Shield className="h-4 w-4" />;
}

const LIFE_RECORD_DRAFT_KEY = "lifeRecordFormDraft";

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
  const [isChangeOnExistingContract, setIsChangeOnExistingContract] =
    useState<"yes" | "no">("no");
  const [isRefreshOrRenovation, setIsRefreshOrRenovation] =
    useState<"yes" | "no">("no");
  const [isContractTerminationDueToNewOne, setIsContractTerminationDueToNewOne] =
    useState<"yes" | "no">("no");
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
  const [showMaxDailyPreview, setShowMaxDailyPreview] = useState(false);
  const [maxDailyPreviewCarrier, setMaxDailyPreviewCarrier] =
    useState<MaxDailyPreviewCarrier>("cpp");

  const openMaxDailyPreview = (carrier: MaxDailyPreviewCarrier = "cpp") => {
    setMaxDailyPreviewCarrier(carrier);
    setShowMaxDailyPreview(true);
  };
  const maxDailyPreviewSrc =
    maxDailyPreviewCarrier === "kooperativa"
      ? "/dokumenty/koopprijem.jpg"
      : "/dokumenty/maxdenni.jpg";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let frameId: number | null = null;

    try {
      const raw = window.localStorage.getItem(LIFE_RECORD_DRAFT_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as any;
      if (!draft || typeof draft !== "object") return;

      frameId = window.requestAnimationFrame(() => {
        if (typeof draft.deathOn === "boolean") {
          setDeathOn(draft.deathOn);
        }
        if (typeof draft.deathAmount === "string") {
          setDeathAmount(draft.deathAmount);
        }
        if (typeof draft.terminalOn === "boolean") {
          setTerminalOn(draft.terminalOn);
        }
        if (typeof draft.terminalAmount === "string") {
          setTerminalAmount(draft.terminalAmount);
        }
        if (typeof draft.extraDeathOn === "boolean") {
          setExtraDeathOn(draft.extraDeathOn);
        }
        if (typeof draft.extraDeathConstantOn === "boolean") {
          setExtraDeathConstantOn(draft.extraDeathConstantOn);
        }
        if (typeof draft.extraDeathConstantAmount === "string") {
          setExtraDeathConstantAmount(draft.extraDeathConstantAmount);
        }
        if (typeof draft.extraDeathDecreasingOn === "boolean") {
          setExtraDeathDecreasingOn(draft.extraDeathDecreasingOn);
        }
        if (typeof draft.extraDeathDecreasingAmount === "string") {
          setExtraDeathDecreasingAmount(draft.extraDeathDecreasingAmount);
        }
        if (typeof draft.extraDeathInterestOn === "boolean") {
          setExtraDeathInterestOn(draft.extraDeathInterestOn);
        }
        if (typeof draft.extraDeathInterestAmount === "string") {
          setExtraDeathInterestAmount(draft.extraDeathInterestAmount);
        }
        if (typeof draft.survivorPensionOn === "boolean") {
          setSurvivorPensionOn(draft.survivorPensionOn);
        }
        if (typeof draft.survivorPensionAmount === "string") {
          setSurvivorPensionAmount(draft.survivorPensionAmount);
        }
        if (typeof draft.waiverOn === "boolean") {
          setWaiverOn(draft.waiverOn);
        }
        if (typeof draft.waiverInvalidityOn === "boolean") {
          setWaiverInvalidityOn(draft.waiverInvalidityOn);
        }
        if (typeof draft.waiverInvalidityScope === "string") {
          setWaiverInvalidityScope(draft.waiverInvalidityScope);
        }
        if (typeof draft.waiverJobLossOn === "boolean") {
          setWaiverJobLossOn(draft.waiverJobLossOn);
        }
        if (typeof draft.invalid1On === "boolean") {
          setInvalid1On(draft.invalid1On);
        }
        if (typeof draft.invalid1Degrees === "string") {
          setInvalid1Degrees(draft.invalid1Degrees);
        }
        if (typeof draft.invalid1Type === "string") {
          setInvalid1Type(draft.invalid1Type);
        }
        if (typeof draft.invalid1Amount1 === "string") {
          setInvalid1Amount1(draft.invalid1Amount1);
        }
        if (typeof draft.invalid1Amount2 === "string") {
          setInvalid1Amount2(draft.invalid1Amount2);
        }
        if (typeof draft.invalid1Amount3 === "string") {
          setInvalid1Amount3(draft.invalid1Amount3);
        }
        if (typeof draft.invalid2On === "boolean") {
          setInvalid2On(draft.invalid2On);
        }
        if (typeof draft.invalid2Degrees === "string") {
          setInvalid2Degrees(draft.invalid2Degrees);
        }
        if (typeof draft.invalid2Type === "string") {
          setInvalid2Type(draft.invalid2Type);
        }
        if (typeof draft.invalid2Amount1 === "string") {
          setInvalid2Amount1(draft.invalid2Amount1);
        }
        if (typeof draft.invalid2Amount2 === "string") {
          setInvalid2Amount2(draft.invalid2Amount2);
        }
        if (typeof draft.invalid2Amount3 === "string") {
          setInvalid2Amount3(draft.invalid2Amount3);
        }
        if (typeof draft.ci1On === "boolean") {
          setCi1On(draft.ci1On);
        }
        if (typeof draft.ci1Type === "string") {
          setCi1Type(draft.ci1Type);
        }
        if (typeof draft.ci1Repeat === "boolean") {
          setCi1Repeat(draft.ci1Repeat);
        }
        if (typeof draft.ci1Amount === "string") {
          setCi1Amount(draft.ci1Amount);
        }
        if (typeof draft.ci2On === "boolean") {
          setCi2On(draft.ci2On);
        }
        if (typeof draft.ci2Type === "string") {
          setCi2Type(draft.ci2Type);
        }
        if (typeof draft.ci2Repeat === "boolean") {
          setCi2Repeat(draft.ci2Repeat);
        }
        if (typeof draft.ci2Amount === "string") {
          setCi2Amount(draft.ci2Amount);
        }
        if (typeof draft.seriousHimOn === "boolean") {
          setSeriousHimOn(draft.seriousHimOn);
        }
        if (typeof draft.seriousHimAmount === "string") {
          setSeriousHimAmount(draft.seriousHimAmount);
        }
        if (typeof draft.seriousHerOn === "boolean") {
          setSeriousHerOn(draft.seriousHerOn);
        }
        if (typeof draft.seriousHerAmount === "string") {
          setSeriousHerAmount(draft.seriousHerAmount);
        }
        if (typeof draft.diabetesOn === "boolean") {
          setDiabetesOn(draft.diabetesOn);
        }
        if (typeof draft.diabetesAmount === "string") {
          setDiabetesAmount(draft.diabetesAmount);
        }
        if (typeof draft.vaccinationOn === "boolean") {
          setVaccinationOn(draft.vaccinationOn);
        }
        if (typeof draft.vaccinationAmount === "string") {
          setVaccinationAmount(draft.vaccinationAmount);
        }
        if (typeof draft.deathAccOn === "boolean") {
          setDeathAccOn(draft.deathAccOn);
        }
        if (typeof draft.deathAccAmount === "string") {
          setDeathAccAmount(draft.deathAccAmount);
        }
        if (typeof draft.deathAccDoubleCar === "boolean") {
          setDeathAccDoubleCar(draft.deathAccDoubleCar);
        }
        if (typeof draft.perm1On === "boolean") {
          setPerm1On(draft.perm1On);
        }
        if (typeof draft.perm1Progress === "string") {
          setPerm1Progress(draft.perm1Progress);
        }
        if (typeof draft.perm1From === "string") {
          setPerm1From(draft.perm1From);
        }
        if (typeof draft.perm1Amount === "string") {
          setPerm1Amount(draft.perm1Amount);
        }
        if (typeof draft.perm2On === "boolean") {
          setPerm2On(draft.perm2On);
        }
        if (typeof draft.perm2Progress === "string") {
          setPerm2Progress(draft.perm2Progress);
        }
        if (typeof draft.perm2From === "string") {
          setPerm2From(draft.perm2From);
        }
        if (typeof draft.perm2Amount === "string") {
          setPerm2Amount(draft.perm2Amount);
        }
        if (typeof draft.dailyOn === "boolean") {
          setDailyOn(draft.dailyOn);
        }
        if (typeof draft.dailyFrom === "string") {
          setDailyFrom(draft.dailyFrom);
        }
        if (typeof draft.dailyProgress === "string") {
          setDailyProgress(draft.dailyProgress);
        }
        if (typeof draft.dailyAmount === "string") {
          setDailyAmount(draft.dailyAmount);
        }
        if (typeof draft.bodilyOn === "boolean") {
          setBodilyOn(draft.bodilyOn);
        }
        if (typeof draft.bodilyFrom === "string") {
          setBodilyFrom(draft.bodilyFrom);
        }
        if (typeof draft.bodilyAmount === "string") {
          setBodilyAmount(draft.bodilyAmount);
        }
        if (typeof draft.sick1On === "boolean") {
          setSick1On(draft.sick1On);
        }
        if (typeof draft.sick1From === "string") {
          setSick1From(draft.sick1From);
        }
        if (typeof draft.sick1Variant === "string") {
          setSick1Variant(draft.sick1Variant);
        }
        if (typeof draft.sick1Amount === "string") {
          setSick1Amount(draft.sick1Amount);
        }
        if (typeof draft.sickAccident1 === "boolean") {
          setSickAccident1(draft.sickAccident1);
        }
        if (typeof draft.sickIllness1 === "boolean") {
          setSickIllness1(draft.sickIllness1);
        }
        if (typeof draft.sick2On === "boolean") {
          setSick2On(draft.sick2On);
        }
        if (typeof draft.sick2From === "string") {
          setSick2From(draft.sick2From);
        }
        if (typeof draft.sick2Variant === "string") {
          setSick2Variant(draft.sick2Variant);
        }
        if (typeof draft.sick2Amount === "string") {
          setSick2Amount(draft.sick2Amount);
        }
        if (typeof draft.sickAccident2 === "boolean") {
          setSickAccident2(draft.sickAccident2);
        }
        if (typeof draft.sickIllness2 === "boolean") {
          setSickIllness2(draft.sickIllness2);
        }
        if (typeof draft.hospitalOn === "boolean") {
          setHospitalOn(draft.hospitalOn);
        }
        if (typeof draft.hospitalAccidentOn === "boolean") {
          setHospitalAccidentOn(draft.hospitalAccidentOn);
        }
        if (typeof draft.hospitalAccidentAmount === "string") {
          setHospitalAccidentAmount(draft.hospitalAccidentAmount);
        }
        if (typeof draft.hospitalIllnessOn === "boolean") {
          setHospitalIllnessOn(draft.hospitalIllnessOn);
        }
        if (typeof draft.hospitalIllnessAmount === "string") {
          setHospitalIllnessAmount(draft.hospitalIllnessAmount);
        }
        if (typeof draft.hospitalProgressive === "boolean") {
          setHospitalProgressive(draft.hospitalProgressive);
        }
        if (typeof draft.childOperationOn === "boolean") {
          setChildOperationOn(draft.childOperationOn);
        }
        if (typeof draft.hasExistingContract === "string") {
          setHasExistingContract(draft.hasExistingContract);
        }
        if (typeof draft.isChangeOnExistingContract === "string") {
          setIsChangeOnExistingContract(draft.isChangeOnExistingContract);
        }
        if (typeof draft.isRefreshOrRenovation === "string") {
          setIsRefreshOrRenovation(draft.isRefreshOrRenovation);
        }
        if (typeof draft.isContractTerminationDueToNewOne === "string") {
          setIsContractTerminationDueToNewOne(
            draft.isContractTerminationDueToNewOne
          );
        }
        if (typeof draft.childOperationAmount === "string") {
          setChildOperationAmount(draft.childOperationAmount);
        }
        if (typeof draft.childrenAccidentOn === "boolean") {
          setChildrenAccidentOn(draft.childrenAccidentOn);
        }
        if (typeof draft.childrenAccidentType === "string") {
          setChildrenAccidentType(draft.childrenAccidentType);
        }
        if (typeof draft.childrenAccidentAmount === "string") {
          setChildrenAccidentAmount(draft.childrenAccidentAmount);
        }
        if (typeof draft.assistedOn === "boolean") {
          setAssistedOn(draft.assistedOn);
        }
        if (typeof draft.assistedAmount === "string") {
          setAssistedAmount(draft.assistedAmount);
        }
        if (typeof draft.careDependenceOn === "boolean") {
          setCareDependenceOn(draft.careDependenceOn);
        }
        if (typeof draft.careDependenceAmount === "string") {
          setCareDependenceAmount(draft.careDependenceAmount);
        }
        if (typeof draft.fullCareOn === "boolean") {
          setFullCareOn(draft.fullCareOn);
        }
        if (typeof draft.fullCareAmount === "string") {
          setFullCareAmount(draft.fullCareAmount);
        }
        if (typeof draft.specialAidOn === "boolean") {
          setSpecialAidOn(draft.specialAidOn);
        }
        if (typeof draft.specialAidAmount === "string") {
          setSpecialAidAmount(draft.specialAidAmount);
        }
        if (typeof draft.healthSocialOn === "boolean") {
          setHealthSocialOn(draft.healthSocialOn);
        }
      });
    } catch {
      // ignore broken draft
    }

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

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
      className="w-full rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] placeholder:text-slate-400 focus:border-sky-500/80 focus:outline-none focus:ring-2 focus:ring-sky-500/35"
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
      <p className="text-[11px] sm:text-xs text-slate-900">{label}</p>
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
        <div className="mt-3 space-y-4 text-xs sm:text-sm text-slate-800">
          {/* Rozsah stupňů */}
          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-900">
              Rozsah stupňů invalidity:
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
            <p className="text-[11px] sm:text-xs text-slate-900">
              Typ plnění:
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
        <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
          {renderAmountInput(
            amount,
            setAmount,
            "Pojistná částka (Kč)"
          )}

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-900">
              Typ plnění:
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
        <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
          {renderAmountInput(amount, setAmount, "Pojistná částka (Kč)")}

          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs text-slate-900">
              Progrese:
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
            <p className="text-[11px] sm:text-xs text-slate-900">
              Plnění od:
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
  ) => {
    const limit = from === "day60" ? 800 : 600;
    const normalizedAmount = parseAmount(amount);
    const isOverLimit = normalizedAmount > limit;
    const fromLabel =
      from === "day15" ? "od 15. dne" : from === "day29" ? "od 29. dne" : "od 60. dne";

    return (
      <BenefitCard
        title="Pracovní neschopnost"
        enabled={enabled}
        onToggle={onToggle}
      >
        {enabled && (
          <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
            <div className="space-y-1">
              <p className="text-[11px] sm:text-xs text-slate-900">Denní dávka (Kč)</p>
              <div className="relative">
                <input
                  {...moneyInputProps}
                  className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                    isOverLimit
                      ? "border-amber-500 bg-amber-50 pr-10 focus:border-amber-500 focus:ring-amber-300/80"
                      : "border-slate-300 bg-white focus:border-sky-500/80 focus:ring-sky-500/35"
                  }`}
                  value={amount}
                  onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
                  placeholder="Denní dávka (Kč)"
                />
                {isOverLimit ? (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                ) : null}
              </div>
                {isOverLimit ? (
                  <div className="mt-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                    <p className="font-semibold text-amber-900">
                      Nad limitem {limit} Kč pro variantu {fromLabel} je potřeba doložit příjem.
                    </p>
                    <p className="mt-1 text-amber-900">
                      Platí pro ČPP. U Kooperativa FLEXI se příjem dokládá nad 650 Kč / den.
                    </p>
                    <button
                      type="button"
                      onClick={() => openMaxDailyPreview("cpp")}
                      className="mt-2 inline-flex items-center rounded-lg border border-amber-400 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-100"
                  >
                    Zobrazit tabulku max. částek
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-[11px] sm:text-xs text-slate-900">
                Plnění od:
              </p>
              <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
              <p className="text-[11px] sm:text-xs text-slate-900">
                Varianta plnění:
              </p>
              <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
              <p className="text-[11px] sm:text-xs text-slate-900">Plnění:</p>
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
  };

  // --------------------------------------------------
  // VÝSLEDKY – klik na zelené tlačítko
  // --------------------------------------------------

  type SelectedBenefit =
    | {
        key: "death" | "terminal" | "extraDeath" | "survivorPension";
        amount?: number;
      }
    | {
        key: "waiver";
        invalidity: boolean;
        scope?: WaiverInvalidityScope;
        jobLoss: boolean;
      }
    | {
        key: "invalidity";
        degrees: InvalidityDegreesSelection;
        amount1?: number;
        amount2?: number;
        amount3?: number;
        type: DecreasingType;
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
        progress: PermanentProgress;
        from: PermanentStart;
      }
    | {
        key: "dailyAllowance";
        amount?: number;
        from: DailyStart;
        progress: DailyProgress;
      }
    | {
        key: "sickLeave";
        amount?: number;
        from: SickStart;
        variant: SickVariant;
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

  const collectSelectedBenefits = (): SelectedBenefit[] => {
    const benefits: SelectedBenefit[] = [];

    // základ
    if (deathOn) {
      benefits.push({ key: "death", amount: parseAmount(deathAmount) });
    }
    if (terminalOn) {
      benefits.push({
        key: "terminal",
        amount: parseAmount(terminalAmount),
      });
    }
    if (extraDeathOn) {
      benefits.push({
        key: "extraDeath",
        amount: Math.max(
          parseAmount(extraDeathConstantAmount),
          parseAmount(extraDeathDecreasingAmount),
          parseAmount(extraDeathInterestAmount)
        ),
      });
    }
    if (survivorPensionOn) {
      benefits.push({
        key: "survivorPension",
        amount: parseAmount(survivorPensionAmount),
      });
    }

    if (waiverOn) {
      benefits.push({
        key: "waiver",
        invalidity: waiverInvalidityOn,
        scope: waiverInvalidityScope,
        jobLoss: waiverJobLossOn,
      });
    }

    if (invalid1On) {
      benefits.push({
        key: "invalidity",
        degrees: invalid1Degrees,
        type: invalid1Type,
        amount1: parseAmount(invalid1Amount1),
        amount2: parseAmount(invalid1Amount2),
        amount3: parseAmount(invalid1Amount3),
      });
    }
    if (invalid2On) {
      benefits.push({
        key: "invalidity",
        degrees: invalid2Degrees,
        type: invalid2Type,
        amount1: parseAmount(invalid2Amount1),
        amount2: parseAmount(invalid2Amount2),
        amount3: parseAmount(invalid2Amount3),
      });
    }

    if (ci1On) {
      benefits.push({
        key: "criticalIllness",
        amount: parseAmount(ci1Amount),
        repeat: ci1Repeat,
      });
    }
    if (ci2On) {
      benefits.push({
        key: "criticalIllness",
        amount: parseAmount(ci2Amount),
        repeat: ci2Repeat,
      });
    }

    if (seriousHimOn) {
      benefits.push({
        key: "seriousIllnessHim",
        amount: parseAmount(seriousHimAmount),
      });
    }
    if (seriousHerOn) {
      benefits.push({
        key: "seriousIllnessHer",
        amount: parseAmount(seriousHerAmount),
      });
    }

    if (diabetesOn) {
      benefits.push({
        key: "diabetes",
        amount: parseAmount(diabetesAmount),
      });
    }
    if (vaccinationOn) {
      benefits.push({
        key: "vaccination",
        amount: parseAmount(vaccinationAmount),
      });
    }

    if (deathAccOn) {
      benefits.push({
        key: "deathAccident",
        amount: parseAmount(deathAccAmount),
        extra: deathAccDoubleCar ? "doubleCar" : undefined,
      });
    }

    if (perm1On) {
      benefits.push({
        key: "permanentInjury",
        progress: perm1Progress,
        from: perm1From,
        amount: parseAmount(perm1Amount),
      });
    }
    if (perm2On) {
      benefits.push({
        key: "permanentInjury",
        progress: perm2Progress,
        from: perm2From,
        amount: parseAmount(perm2Amount),
      });
    }

    if (dailyOn) {
      benefits.push({
        key: "dailyAllowance",
        from: dailyFrom,
        progress: dailyProgress,
        amount: parseAmount(dailyAmount),
      });
    }

    if (bodilyOn) {
      benefits.push({
        key: "bodilyInjury",
        amount: parseAmount(bodilyAmount),
        extra: bodilyFrom,
      });
    }

    if (sick1On) {
      benefits.push({
        key: "sickLeave",
        from: sick1From,
        variant: sick1Variant,
        amount: parseAmount(sick1Amount),
        accident: sickAccident1,
        illness: sickIllness1,
      });
    }
    if (sick2On) {
      benefits.push({
        key: "sickLeave",
        from: sick2From,
        variant: sick2Variant,
        amount: parseAmount(sick2Amount),
        accident: sickAccident2,
        illness: sickIllness2,
      });
    }

    if (hospitalOn) {
      benefits.push({
        key: "hospitalization",
        accident: hospitalAccidentOn,
        illness: hospitalIllnessOn,
        progressive: hospitalProgressive,
        amountAccident: parseAmount(hospitalAccidentAmount),
        amountIllness: parseAmount(hospitalIllnessAmount),
      });
    }

    if (childOperationOn) {
      benefits.push({
        key: "childOperation",
        amount: parseAmount(childOperationAmount),
      });
    }
    if (childrenAccidentOn) {
      benefits.push({
        key: "childrenAccident",
        amount: parseAmount(childrenAccidentAmount),
        extra: childrenAccidentType,
      });
    }
    if (assistedOn) {
      benefits.push({
        key: "assistedReproduction",
        amount: parseAmount(assistedAmount),
      });
    }
    if (careDependenceOn) {
      benefits.push({
        key: "careDependence",
        amount: parseAmount(careDependenceAmount),
      });
    }
    if (fullCareOn) {
      benefits.push({
        key: "fullCare",
        amount: parseAmount(fullCareAmount),
      });
    }
    if (specialAidOn) {
      benefits.push({
        key: "specialAid",
        amount: parseAmount(specialAidAmount),
      });
    }
    if (healthSocialOn) {
      benefits.push({ key: "healthSocial" });
    }

    return benefits;
  };

  const handleResultsClick = () => {
    const selectedBenefits = collectSelectedBenefits();

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
      isChangeOnExistingContract: isChangeOnExistingContract === "yes",
      isRefreshOrRenovation: isRefreshOrRenovation === "yes",
      isContractTerminationDueToNewOne:
        isContractTerminationDueToNewOne === "yes",
      selectedBenefits,
    };

    if (typeof window !== "undefined") {
      const draft = {
        deathOn,
        deathAmount,
        terminalOn,
        terminalAmount,
        extraDeathOn,
        extraDeathConstantOn,
        extraDeathConstantAmount,
        extraDeathDecreasingOn,
        extraDeathDecreasingAmount,
        extraDeathInterestOn,
        extraDeathInterestAmount,
        survivorPensionOn,
        survivorPensionAmount,
        waiverOn,
        waiverInvalidityOn,
        waiverInvalidityScope,
        waiverJobLossOn,
        invalid1On,
        invalid1Degrees,
        invalid1Type,
        invalid1Amount1,
        invalid1Amount2,
        invalid1Amount3,
        invalid2On,
        invalid2Degrees,
        invalid2Type,
        invalid2Amount1,
        invalid2Amount2,
        invalid2Amount3,
        ci1On,
        ci1Type,
        ci1Repeat,
        ci1Amount,
        ci2On,
        ci2Type,
        ci2Repeat,
        ci2Amount,
        seriousHimOn,
        seriousHimAmount,
        seriousHerOn,
        seriousHerAmount,
        diabetesOn,
        diabetesAmount,
        vaccinationOn,
        vaccinationAmount,
        deathAccOn,
        deathAccAmount,
        deathAccDoubleCar,
        perm1On,
        perm1Progress,
        perm1From,
        perm1Amount,
        perm2On,
        perm2Progress,
        perm2From,
        perm2Amount,
        dailyOn,
        dailyFrom,
        dailyProgress,
        dailyAmount,
        bodilyOn,
        bodilyFrom,
        bodilyAmount,
        sick1On,
        sick1From,
        sick1Variant,
        sick1Amount,
        sickAccident1,
        sickIllness1,
        sick2On,
        sick2From,
        sick2Variant,
        sick2Amount,
        sickAccident2,
        sickIllness2,
        hospitalOn,
        hospitalAccidentOn,
        hospitalAccidentAmount,
        hospitalIllnessOn,
        hospitalIllnessAmount,
        hospitalProgressive,
        childOperationOn,
        hasExistingContract,
        isChangeOnExistingContract,
        isRefreshOrRenovation,
        isContractTerminationDueToNewOne,
        childOperationAmount,
        childrenAccidentOn,
        childrenAccidentType,
        childrenAccidentAmount,
        assistedOn,
        assistedAmount,
        careDependenceOn,
        careDependenceAmount,
        fullCareOn,
        fullCareAmount,
        specialAidOn,
        specialAidAmount,
        healthSocialOn,
      };
      window.localStorage.setItem(
        LIFE_RECORD_DRAFT_KEY,
        JSON.stringify(draft)
      );
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

  const selectedBenefitsCount = [
    deathOn,
    terminalOn,
    extraDeathOn,
    survivorPensionOn,
    waiverOn,
    invalid1On,
    invalid2On,
    ci1On,
    ci2On,
    seriousHimOn,
    seriousHerOn,
    diabetesOn,
    vaccinationOn,
    deathAccOn,
    perm1On,
    perm2On,
    dailyOn,
    bodilyOn,
    sick1On,
    sick2On,
    hospitalOn,
    childOperationOn,
    childrenAccidentOn,
    assistedOn,
    careDependenceOn,
    fullCareOn,
    specialAidOn,
    healthSocialOn,
  ].filter(Boolean).length;
  const totalBenefitsCount = 28;
  const selectedBenefitsProgress = Math.round(
    (selectedBenefitsCount / totalBenefitsCount) * 100
  );

  return (
    <>
      <div className="space-y-5">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900">
            Životní pojištění – přehled sjednávaných krytí
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Zaklikni rizika, která s klientem řešíš, a doplň jejich částky. Slouží jako tahák k
            vyplnění Záznamu z jednání.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Aktivní krytí</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">{selectedBenefitsCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Celkem možností</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">{totalBenefitsCount}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-700">Rozpracováno</div>
              <div className="mt-0.5 text-sm font-semibold text-emerald-900">
                {selectedBenefitsProgress} %
              </div>
            </div>
          </div>
        </div>

        {/* Všechny glassy boxy ve 2 sloupcích */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
              <ToggleRow
                label="Přiznání invalidity"
                checked={waiverInvalidityOn}
                onChange={setWaiverInvalidityOn}
              />

              {waiverInvalidityOn && (
                <div className="ml-1 space-y-1">
                  <p className="text-[11px] text-slate-900">
                    Rozsah invalidity:
                  </p>
                  <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-900">Denní dávka (Kč)</p>
                <div className="relative">
                  <input
                    {...moneyInputProps}
                    className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                      parseAmount(dailyAmount) > 600
                        ? "border-amber-500 bg-amber-50 pr-10 focus:border-amber-500 focus:ring-amber-300/80"
                        : "border-slate-300 bg-white focus:border-sky-500/80 focus:ring-sky-500/35"
                    }`}
                    value={dailyAmount}
                    onChange={(e) => setDailyAmount(normalizeAmountInput(e.target.value))}
                    placeholder="Denní dávka (Kč)"
                  />
                  {parseAmount(dailyAmount) > 600 ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
                {parseAmount(dailyAmount) > 600 ? (
                  <div className="mt-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
                    <p className="font-semibold text-amber-900">
                      Nad limitem 600 Kč je potřeba doložit příjem.
                    </p>
                    <p className="mt-1 text-amber-900">
                      Platí pro ČPP. U Kooperativa FLEXI se příjem dokládá nad 650 Kč / den.
                    </p>
                    <button
                      type="button"
                      onClick={() => openMaxDailyPreview("cpp")}
                      className="mt-2 inline-flex items-center rounded-lg border border-amber-400 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-900 transition hover:border-amber-500 hover:bg-amber-100"
                    >
                      Zobrazit tabulku max. částek
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-900">
                  Plnění od:
                </p>
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
                <p className="text-[11px] sm:text-xs text-slate-900">
                  Progrese:
                </p>
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
              {renderAmountInput(
                bodilyAmount,
                setBodilyAmount,
                "Pojistná částka (Kč)"
              )}

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-900">
                  Plnění od:
                </p>
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
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
            <div className="mt-3 space-y-3 text-xs sm:text-sm text-slate-800">
              {renderAmountInput(
                childrenAccidentAmount,
                setChildrenAccidentAmount,
                "Pojistná částka (Kč)"
              )}

              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs text-slate-900">
                  Typ plnění:
                </p>
                <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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

        <section className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] space-y-3">
          <div className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
            Zákazník má již uzavřenou pojistnou smlouvu týkající se stejného
            pojistného zájmu
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
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

          <div className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
            Změna na stávající smlouvě
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
            <ChipButton
              active={isChangeOnExistingContract === "yes"}
              onClick={() => setIsChangeOnExistingContract("yes")}
            >
              Ano
            </ChipButton>
            <ChipButton
              active={isChangeOnExistingContract === "no"}
              onClick={() => setIsChangeOnExistingContract("no")}
            >
              Ne
            </ChipButton>
          </div>

          <div className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
            Refresh nebo Renovace stávající smlouvy
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
            <ChipButton
              active={isRefreshOrRenovation === "yes"}
              onClick={() => setIsRefreshOrRenovation("yes")}
            >
              Ano
            </ChipButton>
            <ChipButton
              active={isRefreshOrRenovation === "no"}
              onClick={() => setIsRefreshOrRenovation("no")}
            >
              Ne
            </ChipButton>
          </div>

          <div className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
            Výpověď smlouvy z důvodu sjednání nové
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-1 text-[11px] sm:text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_rgba(15,23,42,0.08)]">
            <ChipButton
              active={isContractTerminationDueToNewOne === "yes"}
              onClick={() => setIsContractTerminationDueToNewOne("yes")}
            >
              Ano
            </ChipButton>
            <ChipButton
              active={isContractTerminationDueToNewOne === "no"}
              onClick={() => setIsContractTerminationDueToNewOne("no")}
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
          className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-600 px-8 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_28px_rgba(5,150,105,0.35)] transition hover:bg-emerald-500 hover:shadow-[0_18px_34px_rgba(5,150,105,0.45)] sm:text-base"
        >
          <FileCheck2 className="h-4 w-4 sm:h-5 sm:w-5" />
          <span>Výsledky</span>
        </button>
      </div>
    </div>
    {showMaxDailyPreview ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 px-3 py-6 sm:px-6">
        <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">
                MAXIMÁLNÍ POJISTNÉ ČÁSTKY DENNÍHO ODŠKODNÉHO
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Tabulka maximálních částek ve vztahu k příjmu.
              </p>
              <div className="mt-3 inline-flex rounded-full border border-slate-300 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMaxDailyPreviewCarrier("cpp")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    maxDailyPreviewCarrier === "cpp"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  ČPP
                </button>
                <button
                  type="button"
                  onClick={() => setMaxDailyPreviewCarrier("kooperativa")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    maxDailyPreviewCarrier === "kooperativa"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  KOOPERATIVA
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={maxDailyPreviewSrc}
                download
                className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
              >
                <Download className="h-4 w-4" />
                Stáhnout
              </a>
              <button
                type="button"
                onClick={() => setShowMaxDailyPreview(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <Image
                src={maxDailyPreviewSrc}
                alt="Maximální pojistné částky denního odškodného"
                width={2481}
                height={3508}
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
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
  const icon = getBenefitCardIcon(title);

  return (
    <section
      className={`relative overflow-hidden rounded-[30px] border px-4 py-4 sm:px-5 sm:py-5 transition-all duration-200 ${
        enabled
          ? "border-emerald-300 bg-[linear-gradient(160deg,#ffffff_0%,#f2fcf7_58%,#e9fbf2_100%)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]"
          : "border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-[0_14px_28px_rgba(15,23,42,0.12)]"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
          enabled
            ? "bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400"
            : "bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200"
        }`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="group relative flex w-full items-start gap-3 text-left"
      >
        <div
          className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ring-1 transition ${
            enabled
              ? "border-emerald-600 bg-emerald-500 text-white ring-emerald-200"
              : "border-slate-300 bg-white text-transparent ring-slate-200"
          }`}
        >
          {enabled ? "✓" : ""}
        </div>
        <div
          className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition ${
            enabled
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-600 group-hover:border-slate-300 group-hover:text-slate-800"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight text-slate-900 sm:text-base group-hover:text-slate-950">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${
            enabled
              ? "border-emerald-300 bg-emerald-100 text-emerald-800"
              : "border-slate-300 bg-white text-slate-500"
          }`}
        >
          {enabled ? "Aktivní" : "Vypnuto"}
        </span>
      </button>

      {enabled && children && (
        <div className="mt-4 border-t border-emerald-200/70 pt-4">{children}</div>
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
      <span className="text-xs sm:text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-10 items-center rounded-full border p-0.5 transition ${
          checked
            ? "border-emerald-500 bg-emerald-500/90"
            : "border-slate-300 bg-slate-100"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
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
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${
        active
          ? "bg-[linear-gradient(135deg,#10b981_0%,#047857_100%)] text-white"
          : "text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-[0_5px_12px_rgba(15,23,42,0.12)]"
      }`}
    >
      {children}
    </button>
  );
}

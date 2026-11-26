import { useMemo } from "react";
import type { CommissionMode, MaxCizinKomplexVariant, PaymentFrequency, Position, Product } from "../types/domain";
import { coefficientSetSignedDateForProduct } from "../lib/productFormulas/coefficientSets";
import {
  getCoefficientSummary,
  isNeonHistoricalPeriod,
  isCppAutoHistoricalPeriod,
  isAllianzAutoHistoricalPeriod,
  isCsobAutoHistoricalPeriod,
  isUniqaAutoEarlyHistoricalPeriod,
  isUniqaAutoHistoricalPeriod,
  isUniqaFlotilaHistoricalPeriod,
  isPillowAutoHistoricalPeriod,
  isKooperativaAutoHistoricalPeriod,
  isMaxEfekt5Period,
  isMaxEfekt7Period,
  isDomexEarlyHistoricalPeriod,
  isDomexHistoricalPeriod,
} from "../lib/productFormulas";
import {
  isKoopMajetekObcanHistoricalPeriod,
  KOOP_MAJETEK_OBCAN_CURRENT_VALID_FROM,
} from "../lib/productFormulas/koopmajetekobcan";
import { isKoopOdzamHistoricalPeriod, KOOP_ODZAM_CURRENT_VALID_FROM } from "../lib/productFormulas/koopodzam";
import { MAXEFEKT5_VALID_FROM, MAXEFEKT7_VALID_FROM } from "../lib/productFormulas/maximaMaxEfekt";
import { formatIsoDay, frequencyLabel, isIsoDay, paymentsPerYear } from "./calculatorHelpers";
import type { NeonCoefficientView } from "./CalculatorCoefficientModal";

const COEFFICIENT_VIEWS = ["current", "historical", "olderHistorical"] as const;
const COEFFICIENT_VIEW_LABELS: Record<NeonCoefficientView, string> = {
  current: "Aktuální",
  historical: "Historické",
  olderHistorical: "Nejstarší historické",
};

const CALCULATOR_COEFFICIENT_DATES: Partial<Record<Product, Partial<Record<NeonCoefficientView, string>>>> = {
  maximaMaxEfekt: { current: MAXEFEKT7_VALID_FROM, historical: MAXEFEKT5_VALID_FROM },
  koopodzam: { current: KOOP_ODZAM_CURRENT_VALID_FROM, historical: "2026-08-31" },
  koopmajetekobcan: { current: KOOP_MAJETEK_OBCAN_CURRENT_VALID_FROM, historical: "2026-08-31" },
};

function calculatorCoefficientDateForView(product: Product, view: NeonCoefficientView) {
  return CALCULATOR_COEFFICIENT_DATES[product]?.[view] ??
    coefficientSetSignedDateForProduct(product, view === "olderHistorical" ? "earlyHistorical" : view);
}

export function calculatorCoefficientOptionsForProduct(product: Product) {
  return COEFFICIENT_VIEWS.flatMap((value) => {
    const date = calculatorCoefficientDateForView(product, value);
    if (!date) return [];

    const name = product === "maximaMaxEfekt"
      ? (value === "current" ? "MAXEFEKT 7" : "MAXEFEKT 5")
      : COEFFICIENT_VIEW_LABELS[value];
    const boundary = value === "historical" && (product === "koopodzam" || product === "koopmajetekobcan")
      ? "do"
      : "od";
    return [{ value, date, label: `${name} · ${boundary} ${formatIsoDay(date)}` }];
  });
}

type CalculatorCoefficientOptions = {
  product: Product;
  position: Position;
  mode: CommissionMode;
  frequency: PaymentFrequency;
  contractSignedDate: string;
  maxCizinKomplexVariant: MaxCizinKomplexVariant;
  neonCoefficientView: NeonCoefficientView;
  documentPosition: Position;
};

const AUTO_TERMS_PREVIEW_BY_PRODUCT: Partial<Record<Product, string>> = {
  cppAuto: "/provize/cppauto.jpg",
  slaviaauto: "/provize/slaviaauto.jpg",
  slaviaflotila: "/provize/slaviaflotila.pdf",
  allianzAuto: "/provize/allianzauto.jpg",
  csobAuto: "/provize/csobauto.jpg",
  uniqaAuto: "/provize/uniqaauto.jpg",
  uniqaflotila: "/provize/uniqaflotila.jpg",
  pillowAuto: "/provize/pillowauto.jpg",
  kooperativaAuto: "/provize/koopauto.jpg",
  koopflotila: "/provize/koopflotila.pdf",
  cpphafan: "/provize/cpphafan.pdf",
  koopodzam: "/provize/koopodzam.pdf",
  kooppmop: "/provize/kooppmop.pdf",
  zamex: "/provize/cppzamex.pdf",
  cppsimplex: "/provize/cppsimplex.pdf",
  cppPPRbez: "/provize/cppbezupisu.pdf",
  cppPPRs: "/provize/cppupis.pdf",
  cppbytex: "/provize/bytexprovize.pdf",
  domex: "/provize/domex2024.pdf",
  domexneuron: "/provize/domexneuron.pdf",
  maxdomov: "/provize/maxdomov2025.pdf",
  maximaMaxEfekt: "/provize/maxefekt7.pdf",
  pillowInjury: "/provize/pillowuraznemoc.pdf",
  pillowmajetek: "/provize/pillowmajetek.pdf",
  allianzmujdomov: "/provize/allianzmujdomov.pdf",
  cppcestovko: "/provize/cppcestovko.pdf",
  koopcestovko: "/provize/koopcestovko.pdf",
  axacestovko: "/provize/axacs.pdf",
};
const PILLOW_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/pillowhistoricke.jpg";
const UNIQA_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/uniqahistoricke.jpg";
const UNIQA_AUTO_EARLY_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/BHMK-UNIQA-AUTO-230101-01_page-0001.jpg";
const UNIQA_FLOTILA_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/uniqaflotilahis.pdf";
const ALLIANZ_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/AlliHistoricke.jpg";
const CSOB_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/csobhistoricke.jpg";
const CPP_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/cpphistorickeauto.jpg";
const KOOPERATIVA_AUTO_HISTORICAL_TERMS_PREVIEW_URL =
  "/provize/koophistoricke.jpg";
const MAXEFEKT5_TERMS_PREVIEW_URL = "/provize/maxefekt5.pdf";
const DOMEX_EARLY_HISTORICAL_TERMS_PREVIEW_URL = "/provize/domexPLUS.pdf";
const DOMEX_HISTORICAL_TERMS_PREVIEW_URL = "/provize/domex2023.pdf";

/** Derives coefficient tables and document previews; view state stays in the page. */
export function useCalculatorCoefficients({
  product, position, mode, frequency, contractSignedDate,
  maxCizinKomplexVariant, neonCoefficientView, documentPosition,
}: CalculatorCoefficientOptions) {
  const contractSignedDateForNeon = useMemo(() => {
    const signedDate = contractSignedDate.trim();
    return isIsoDay(signedDate) ? signedDate : null;
  }, [contractSignedDate]);
  const isNeonHistoricalBySignedDate = useMemo(
    () =>
      product === "neon" && isNeonHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isCppAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "cppAuto" &&
      isCppAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isAllianzAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "allianzAuto" &&
      isAllianzAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isCsobAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "csobAuto" &&
      isCsobAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaAuto" &&
      isUniqaAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaAutoEarlyHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaAuto" &&
      isUniqaAutoEarlyHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isUniqaFlotilaHistoricalBySignedDate = useMemo(
    () =>
      product === "uniqaflotila" &&
      isUniqaFlotilaHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isPillowAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "pillowAuto" &&
      isPillowAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isKooperativaAutoHistoricalBySignedDate = useMemo(
    () =>
      product === "kooperativaAuto" &&
      isKooperativaAutoHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isKoopOdzamHistoricalBySignedDate =
    product === "koopodzam" && isKoopOdzamHistoricalPeriod(contractSignedDateForNeon);
  const isKoopMajetekObcanHistoricalBySignedDate =
    product === "koopmajetekobcan" && isKoopMajetekObcanHistoricalPeriod(contractSignedDateForNeon);
  const isHistoricalCoefficientView = neonCoefficientView === "historical";
  const isMaxEfekt5BySignedDate = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt5Period(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isDomexEarlyHistoricalBySignedDate = useMemo(
    () =>
      product === "domex" &&
      isDomexEarlyHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const isDomexHistoricalBySignedDate = useMemo(
    () =>
      product === "domex" &&
      isDomexHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  let coefficientViewBySignedDate: NeonCoefficientView = "current";
  if (isUniqaAutoEarlyHistoricalBySignedDate || isDomexEarlyHistoricalBySignedDate) {
    coefficientViewBySignedDate = "olderHistorical";
  } else if (
    isNeonHistoricalBySignedDate || isCppAutoHistoricalBySignedDate ||
    isAllianzAutoHistoricalBySignedDate || isCsobAutoHistoricalBySignedDate ||
    isUniqaAutoHistoricalBySignedDate || isUniqaFlotilaHistoricalBySignedDate ||
    isPillowAutoHistoricalBySignedDate || isKooperativaAutoHistoricalBySignedDate ||
    isKoopOdzamHistoricalBySignedDate || isKoopMajetekObcanHistoricalBySignedDate ||
    isMaxEfekt5BySignedDate || isDomexHistoricalBySignedDate
  ) {
    coefficientViewBySignedDate = "historical";
  }
  const coefficientDateForView =
    calculatorCoefficientDateForView(product, neonCoefficientView) ?? contractSignedDateForNeon;
  const isMaxEfekt5InCoefModal = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt5Period(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isMaxEfekt7InCoefModal = useMemo(
    () =>
      product === "maximaMaxEfekt" &&
      isMaxEfekt7Period(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isDomexHistoricalInCoefModal = useMemo(
    () => product === "domex" && isDomexHistoricalPeriod(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isDomexEarlyHistoricalInCoefModal = useMemo(
    () =>
      product === "domex" &&
      isDomexEarlyHistoricalPeriod(coefficientDateForView),
    [product, coefficientDateForView]
  );
  const isNeonHistoricalInCoefModal = useMemo(
    () => product === "neon" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isCppAutoHistoricalInCoefModal = useMemo(
    () => product === "cppAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isAllianzAutoHistoricalInCoefModal = useMemo(
    () => product === "allianzAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isCsobAutoHistoricalInCoefModal = useMemo(
    () => product === "csobAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isUniqaAutoHistoricalInCoefModal = useMemo(
    () =>
      product === "uniqaAuto" &&
      (neonCoefficientView === "historical" ||
        neonCoefficientView === "olderHistorical"),
    [product, neonCoefficientView]
  );
  const isUniqaAutoEarlyHistoricalInCoefModal = useMemo(
    () => product === "uniqaAuto" && neonCoefficientView === "olderHistorical",
    [product, neonCoefficientView]
  );
  const isUniqaFlotilaHistoricalInCoefModal = useMemo(
    () => product === "uniqaflotila" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isPillowAutoHistoricalInCoefModal = useMemo(
    () => product === "pillowAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const isKooperativaAutoHistoricalInCoefModal = useMemo(
    () => product === "kooperativaAuto" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const immediatePayoutInfo = useMemo(() => {
    if (product === "flexi") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet 1. provize A101, 2. provize B0301 a 50 % z provize B36. Zbývajících 50 % z B36 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet 1. provize A101 a 2. provize B0301.";
    }
    if (product === "maximaMaxEfekt") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet provize A101, provize B0301 a 50 % z provize B3601. Zbývajících 50 % z B3601 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet provize A101 a provize B0301.";
    }
    if (product === "pillowInjury") {
      if (mode === "accelerated") {
        return "Okamžitá provize je součet provize A101, provize B0301 a 50 % z provize B36. Zbývajících 50 % z B36 zůstává jako provize po 3 letech.";
      }
      return "Okamžitá provize je součet provize A101 a provize B0301.";
    }
    if (product !== "neon") return null;
    if (isNeonHistoricalInCoefModal) {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    if (mode === "accelerated") {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících a 50 % z 3. provize po 36 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
  }, [product, isNeonHistoricalInCoefModal, mode]);
  const coefList = useMemo(
    () =>
      getCoefficientSummary(
        product ?? null,
        position ?? null,
        mode ?? null,
        maxCizinKomplexVariant,
        coefficientDateForView
      ),
    [
      product,
      position,
      mode,
      maxCizinKomplexVariant,
      coefficientDateForView,
    ]
  );
  const coefExplanation = useMemo(() => {
    if (!product) return "";
    const payLabel = frequencyLabel(frequency);
    const payPerYear = paymentsPerYear(frequency);
    switch (product) {
      case "conseqzenit":
        return "Provize A101 je pevná částka v Kč z tabulky pro zvolenou pozici a pásmo příspěvku klienta. Ve všech třech pásmech se použije částka přímo, bez násobení příspěvkem či procentem. Vyplácí se jednou, bez následných provizí. Platnost od 01.08.2024.";
      case "neon":
        return "Výpočet: měsíční pojistné × 12 × doba trvání × koeficient. Následné provize jsou roční: roční pojistné × koeficient (2.–5. rok a 5.–10. rok).";
      case "flexi":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 6. roku do konce zadané doby.";
      case "maximaMaxEfekt":
        return "Výpočet: roční pojistné × doba trvání × koeficient pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 5. roku.";
      case "maxcizinkomplex":
        return `Výpočet: jednorázové pojistné × koeficient (${maxCizinKomplexVariant === "premium" ? "PREMIUM" : "EXCLUSIVE / STANDARD"}). Provize je vyplacena pouze 1×.`;
      case "pillowInjury":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky. Koeficienty platné od 01.10.2023.";
      case "domex":
        return isDomexHistoricalInCoefModal
          ? `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Historická následná provize se vyplácí maximálně 4 roky.`
          : `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Aktuální následná provize se vyplácí po dobu aktivní smlouvy.`;
      case "domexneuron":
        return `Výpočet: platba (${payLabel}) × koeficient A101 nebo B101. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.09.2026.`;
      case "cppbytex":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}). Následná provize se vyplácí maximálně 4 roky. Provizní režim nemá vliv.`;
      case "cpphafan":
      case "koopmajetekobcan":
      case "koopfit":
      case "koopodzam":
      case "kooppmop":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "pillowmajetek":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.10.2023.`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "allianzmujdomov":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.06.2020.`;
      case "cppsimplex":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.09.2021.`;
      case "uniqaAuto":
        if (isUniqaAutoEarlyHistoricalInCoefModal) {
          return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×). V 1. roce se použije získatelský koeficient, od 1. výročí následný koeficient.`;
        }
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "uniqaflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}).`;
      case "slaviaflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}). Koeficienty platné od 01.08.2025. Zrychlený režim výpočet nemění.`;
      case "koopflotila":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částka = × počet plateb (${payPerYear}). Koeficienty platné od 01.04.2026.`;
      case "cppAuto":
      case "slaviaauto":
      case "allianzAuto":
      case "csobAuto":
      case "pillowAuto":
      case "kooperativaAuto":
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "zamex":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 15.04.2023.`;
      case "cppPPRs":
        return `Výpočet: platba (${payLabel}) × stejný koeficient pro okamžitou i následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.06.2023.`;
      case "cppPPRbez":
        return `Výpočet: platba (${payLabel}) × koeficient pro okamžitou (získatelskou) nebo následnou provizi. Roční částky = × počet plateb (${payPerYear}). Koeficienty platné od 01.06.2023.`;
      case "cppcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 01.09.2019.";
      case "axacestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 15.04.2021.";
      case "koopcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově). Koeficienty platné od 01.09.2019.";
      default:
        return "";
    }
  }, [
    product,
    frequency,
    maxCizinKomplexVariant,
    isUniqaAutoEarlyHistoricalInCoefModal,
    isDomexHistoricalInCoefModal,
  ]);
  const autoTermsPreviewUrl = useMemo(() => {
    if (!product) return null;
    if (product === "cppAuto" && isCppAutoHistoricalInCoefModal) {
      return CPP_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "allianzAuto" && isAllianzAutoHistoricalInCoefModal) {
      return ALLIANZ_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "csobAuto" && isCsobAutoHistoricalInCoefModal) {
      return CSOB_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaAuto" && isUniqaAutoEarlyHistoricalInCoefModal) {
      return UNIQA_AUTO_EARLY_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaAuto" && isUniqaAutoHistoricalInCoefModal) {
      return UNIQA_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "uniqaflotila" && isUniqaFlotilaHistoricalInCoefModal) {
      return UNIQA_FLOTILA_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "pillowAuto" && isPillowAutoHistoricalInCoefModal) {
      return PILLOW_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (
      product === "kooperativaAuto" &&
      isKooperativaAutoHistoricalInCoefModal
    ) {
      return KOOPERATIVA_AUTO_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "maximaMaxEfekt" && isMaxEfekt5InCoefModal) {
      return MAXEFEKT5_TERMS_PREVIEW_URL;
    }
    if (product === "maximaMaxEfekt" && !isMaxEfekt7InCoefModal) {
      return null;
    }
    if (product === "domex" && isDomexEarlyHistoricalInCoefModal) {
      return DOMEX_EARLY_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "domex" && isDomexHistoricalInCoefModal) {
      return DOMEX_HISTORICAL_TERMS_PREVIEW_URL;
    }
    if (product === "koopodzam" && !isHistoricalCoefficientView) return null;
    return AUTO_TERMS_PREVIEW_BY_PRODUCT[product] ?? null;
  }, [
    product,
    isMaxEfekt5InCoefModal,
    isMaxEfekt7InCoefModal,
    isCppAutoHistoricalInCoefModal,
    isAllianzAutoHistoricalInCoefModal,
    isCsobAutoHistoricalInCoefModal,
    isUniqaAutoHistoricalInCoefModal,
    isUniqaAutoEarlyHistoricalInCoefModal,
    isUniqaFlotilaHistoricalInCoefModal,
    isPillowAutoHistoricalInCoefModal,
    isKooperativaAutoHistoricalInCoefModal,
    isDomexEarlyHistoricalInCoefModal,
    isDomexHistoricalInCoefModal,
    isHistoricalCoefficientView,
  ]);
  const secureTermsDocumentId = isHistoricalCoefficientView
    ? null
    : product === "koopodzam"
      ? "koop-odzam-neuron-2026-09"
      : product === "koopmajetekobcan" ? "koop-obcan-neuron-2026-09" : null;
  const showAutoTermsPreview = Boolean(autoTermsPreviewUrl || secureTermsDocumentId);
  const neonPeriod = neonCoefficientView === "historical" ? "2019" : "2024";
  const neonPreviewRole: "poradce" | "manazer" = documentPosition.startsWith("poradce")
    ? "poradce"
    : "manazer";
  const neonTermsPreviewUrl =
    product === "neon"
      ? `/api/documents/neon?type=pdf&period=${neonPeriod}`
      : null;
  const neonPreviewImageUrl =
    product === "neon"
      ? `/api/documents/neon?type=preview&period=${neonPeriod}&role=${neonPreviewRole}`
      : null;
  const showNeonTermsPreview = product === "neon";

  return {
    contractSignedDateForNeon,
    coefficientViewBySignedDate,
    isNeonHistoricalBySignedDate,
    isCppAutoHistoricalBySignedDate,
    isAllianzAutoHistoricalBySignedDate,
    isCsobAutoHistoricalBySignedDate,
    isUniqaAutoHistoricalBySignedDate,
    isUniqaAutoEarlyHistoricalBySignedDate,
    isUniqaFlotilaHistoricalBySignedDate,
    isPillowAutoHistoricalBySignedDate,
    isKooperativaAutoHistoricalBySignedDate,
    isKoopOdzamHistoricalBySignedDate,
    isKoopMajetekObcanHistoricalBySignedDate,
    isMaxEfekt5BySignedDate,
    isDomexEarlyHistoricalBySignedDate,
    isDomexHistoricalBySignedDate,
    isMaxEfekt5InCoefModal,
    isMaxEfekt7InCoefModal,
    isDomexHistoricalInCoefModal,
    isDomexEarlyHistoricalInCoefModal,
    isNeonHistoricalInCoefModal,
    isCppAutoHistoricalInCoefModal,
    isAllianzAutoHistoricalInCoefModal,
    isCsobAutoHistoricalInCoefModal,
    isUniqaAutoHistoricalInCoefModal,
    isUniqaAutoEarlyHistoricalInCoefModal,
    isUniqaFlotilaHistoricalInCoefModal,
    isPillowAutoHistoricalInCoefModal,
    isKooperativaAutoHistoricalInCoefModal,
    immediatePayoutInfo,
    coefList,
    coefExplanation,
    autoTermsPreviewUrl,
    secureTermsDocumentId,
    showAutoTermsPreview,
    neonPeriod,
    neonTermsPreviewUrl,
    neonPreviewImageUrl,
    showNeonTermsPreview,
  };
}

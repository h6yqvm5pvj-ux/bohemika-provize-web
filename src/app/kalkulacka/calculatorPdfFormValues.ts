import type { Product } from "../types/domain";
import type { CalculatorPdfFormValues, CalculatorPdfFormSetters, PdfFormMappingResult } from "./calculatorPdfFormTypes";
import { allowedFrequencies, durationRange, normalizedDurationMonths } from "./calculatorHelpers";
import { parsedPdfBooleanOrNumberValue, parsedPdfBooleanValue, parsedPdfFrequencyValue, parsedPdfNumberValue, parsedPdfRoundedNumberValue, parsedPdfTextValue, parsedSlaviaAutoDetailValue } from "./calculatorBulkPdfImport";
import { mapAutoPdfFormValues } from "./calculatorPdfAutoFields";
import { mapPropertyPdfFormValues } from "./calculatorPdfPropertyFields";
import { mapNeonPdfFormValues } from "./calculatorPdfNeonFields";
import { createEmptyNeonPdfDetailFields } from "./neonPdfDetailFields";
import type { ParsedContractPdf } from "./calculatorPdfImport";

export function createEmptyAutoPdfFormValues(): Partial<CalculatorPdfFormValues> {
  return {
    autoCarMake: "",
    autoCarPlate: "",
    autoCarVin: "",
    autoCarTp: "",
    autoCarOrv: "",
    autoCarAnnualMileage: "",
    autoCarAllianzScope: "",
    autoCarLiabilityLimit: null,
    autoCarSlaviaDetail: null,
    autoCarHullSumInsured: null,
    autoCarHullSumInsuredText: "",
    autoCarHullSumInsuredDraft: "",
    autoCarHullDeductible: null,
    autoCarHullDeductibleText: "",
    autoCarHullRiskAccident: false,
    autoCarHullRiskTheft: false,
    autoCarHullRiskNatural: false,
    autoCarHullRiskVandalism: false,
    autoCarHullRiskAnimalCollision: false,
    autoCarAssistancePlan: "",
    autoCarAddonEso: false,
    autoCarAddonNaturalRisks: false,
    autoCarAddonKlika: false,
    autoCarAddonGlass: false,
    autoCarAddonGlassLimit: null,
    autoCarAddonAnimalCollision: false,
    autoCarAddonAnimalCollisionLimit: null,
    autoCarAddonAnimalDamage: false,
    autoCarAddonAnimalDamageLimit: null,
    autoCarAddonVandalism: false,
    autoCarAddonTheft: false,
    autoCarAddonTheftLimit: null,
    autoCarAddonNatural: false,
    autoCarAddonNaturalLimit: null,
    autoCarAddonOwnDamage: false,
    autoCarAddonOwnDamageLimit: null,
    autoCarAddonGap: false,
    autoCarAddonGapLimit: null,
    autoCarAddonSmartGap: false,
    autoCarAddonServisPro: false,
    autoCarAddonFireExplosion: false,
    autoCarAddonLegalAdvice: false,
    autoCarAddonReplacementCar: false,
    autoCarAddonLuggage: false,
    autoCarAddonTransportedGoods: false,
    autoCarAddonPothole: false,
    autoCarAddonNonFaultAccident: false,
    autoCarAddonPassengerInjury: false,
    autoCarAddonKeyLossTheft: false,
  };
}

export function createEmptyPropertyPdfFormValues(): Partial<CalculatorPdfFormValues> {
  return {
    domexAddress: "",
    domexPropertyType: "",
    domexPropertyCoverage: "",
    domexPropertySumInsured: null,
    domexPropertyDeductible: null,
    domexHouseholdType: "",
    domexHouseholdCoverage: "",
    domexHouseholdSumInsured: null,
    domexHouseholdDeductible: null,
    domexOutbuildingSumInsured: null,
    domexLiabilitySumInsured: null,
    domexLiabilityDeductible: null,
    domexLiabilityMobile: false,
    domexLiabilityTenant: false,
    domexLiabilityLandlord: false,
    domexAssistancePlus: false,
    domexNote: "",
  };
}

export function pdfImportResetValues(importProduct: Product): Partial<CalculatorPdfFormValues> {
  if (["cppAuto", "slaviaauto", "allianzAuto", "csobAuto", "uniqaAuto", "pillowAuto", "kooperativaAuto"].includes(importProduct)) return createEmptyAutoPdfFormValues();
  if (["domex", "domexneuron", "maxdomov"].includes(importProduct)) return createEmptyPropertyPdfFormValues();
  if (importProduct === "neon") return { neonPdfDetailFields: createEmptyNeonPdfDetailFields() };
  return {};
}

export function mapSinglePdfFormValues(importProduct: Product, parsed: ParsedContractPdf): PdfFormMappingResult {
  const values: Partial<CalculatorPdfFormValues> = {};
  let applied = 0;
  values.pensionTargetAge = importProduct === "conseqzenit" ? parsedPdfNumberValue(parsed, "targetAge") : null;
  if (["conseqzenit", "cppPPRbez", "cppPPRs"].includes(importProduct)) {
    if (!parsed.contractNumber) values.contractNumber = "";
    if (!parsed.clientName) values.clientName = "";
    if (!parsed.policyStartDate) values.policyStartDate = "";
    if (!parsed.contractSignedDate) values.contractSignedDate = "";
    if (typeof parsed.amount !== "number") values.amountText = "";
  }
  if (parsed.contractNumber) {
    values.contractNumber = parsed.contractNumber;
    applied += 1;
  }
  if (parsed.clientName) {
    values.clientName = parsed.clientName;
    applied += 1;
  }
  if (parsed.policyStartDate) {
    values.policyStartDate = parsed.policyStartDate;
    applied += 1;
  }
  if ("policyEndDate" in parsed && (typeof parsed.policyEndDate === "string" || ["conseqzenit", "cppPPRbez", "cppPPRs"].includes(importProduct))) {
    values.policyEndDate = typeof parsed.policyEndDate === "string" ? parsed.policyEndDate : "";
    if (parsed.policyEndDate) applied += 1;
  }
  if (parsed.contractSignedDate) {
    values.contractSignedDate = parsed.contractSignedDate;
    applied += 1;
  }
  if (typeof parsed.amount === "number") {
    values.amountText = String(parsed.amount);
    applied += 1;
  }
  if (importProduct === "flexi") {
    values.renovationOriginalPremiumText = "";
    values.renovationIncreaseText = "";
    values.renovationGuaranteeStatus = "unknown";
    if (typeof parsed.amount !== "number") values.amountText = "";
  }
  if ("comfortPayment" in parsed && typeof parsed.comfortPayment === "number") {
    values.comfortPaymentText = String(parsed.comfortPayment);
    applied += 1;
  }
  if (parsed.frequency) {
    const allowedForProduct = allowedFrequencies(importProduct);
    if (allowedForProduct.includes(parsed.frequency)) {
      values.frequency = parsed.frequency;
    }
  }
  if ("durationYears" in parsed && typeof parsed.durationYears === "number") {
    const [min, max] = durationRange(importProduct);
    const yrs = Math.min(max, Math.max(min, parsed.durationYears));
    values.durationYears = yrs;
    applied += 1;
  }
  if ("durationMonths" in parsed && typeof parsed.durationMonths === "number") {
    values.durationMonths = normalizedDurationMonths(importProduct, parsed.durationMonths);
    applied += 1;
  }
  if ("maxCizinKomplexVariant" in parsed &&
    (parsed.maxCizinKomplexVariant === "exclusiveStandard" ||
      parsed.maxCizinKomplexVariant === "premium")) {
    values.maxCizinKomplexVariant = parsed.maxCizinKomplexVariant;
    applied += 1;
  }

  const property = mapPropertyPdfFormValues(parsed);
  const neon = mapNeonPdfFormValues(importProduct, parsed);
  const auto = mapAutoPdfFormValues(importProduct, parsed);
  return {
    values: { ...values, ...property.values, ...neon.values, ...auto.values },
    applied: applied + property.applied + neon.applied + auto.applied,
  };
}

/** Review replaces fields from the selected batch row, including missing values. */
export function mapReviewPdfFormValues(reviewProduct: Product, parsed: ParsedContractPdf): Partial<CalculatorPdfFormValues> {
  const values: Partial<CalculatorPdfFormValues> = {};
  const parsedFrequency = parsedPdfFrequencyValue(parsed);
  const amount = parsedPdfNumberValue(parsed, "amount");
  const liabilityLimit = parsedPdfRoundedNumberValue(parsed, "carLiabilityLimit");
  const hullSumInsuredText = parsedPdfTextValue(parsed, "carHullSumInsuredText");
  const hullSumInsured = parsedPdfRoundedNumberValue(parsed, "carHullSumInsured");
  const hullDeductible = parsedPdfRoundedNumberValue(parsed, "carHullDeductible");
  const hullDeductibleText = parsedPdfTextValue(parsed, "carHullDeductibleText");
  const glassLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGlassLimit");
  const animalCollisionLimit = parsedPdfRoundedNumberValue(parsed, "carAddonAnimalCollisionLimit");
  const animalDamageLimit = parsedPdfRoundedNumberValue(parsed, "carAddonAnimalDamageLimit");
  const theftLimit = parsedPdfRoundedNumberValue(parsed, "carAddonTheftLimit");
  const naturalLimit = parsedPdfRoundedNumberValue(parsed, "carAddonNaturalLimit");
  const ownDamageLimit = parsedPdfRoundedNumberValue(parsed, "carAddonOwnDamageLimit");
  const gapLimit = parsedPdfRoundedNumberValue(parsed, "carAddonGapLimit");
  const cppPremiumLiabilityBundle = reviewProduct === "cppAuto" && liabilityLimit === 200000000;
  values.contractNumber = parsedPdfTextValue(parsed, "contractNumber");
  values.clientName = parsedPdfTextValue(parsed, "clientName");
  values.policyStartDate = parsedPdfTextValue(parsed, "policyStartDate");
  values.policyEndDate = parsedPdfTextValue(parsed, "policyEndDate");
  values.pensionTargetAge = reviewProduct === "conseqzenit" ? parsedPdfNumberValue(parsed, "targetAge") : null;
  values.contractSignedDate = parsedPdfTextValue(parsed, "contractSignedDate");
  values.stornoDate = "";
  values.amountText = amount != null ? String(amount) : "";
  values.renovationOriginalPremiumText = "";
  values.renovationIncreaseText = "";
  values.renovationGuaranteeStatus = "unknown";
  if (parsedFrequency && allowedFrequencies(reviewProduct).includes(parsedFrequency)) {
    values.frequency = parsedFrequency;
  } else {
    values.frequency = allowedFrequencies(reviewProduct)[0] ?? "annual";
  }
  values.autoCarMake = parsedPdfTextValue(parsed, "carMake");
  values.autoCarPlate = parsedPdfTextValue(parsed, "carPlate");
  values.autoCarVin = parsedPdfTextValue(parsed, "carVin");
  values.autoCarTp = parsedPdfTextValue(parsed, "carTp");
  values.autoCarOrv = parsedPdfTextValue(parsed, "carOrv");
  values.autoCarAnnualMileage = parsedPdfTextValue(parsed, "carAnnualMileage");
  values.autoCarAllianzScope = parsedPdfTextValue(parsed, "carAllianzScope");
  values.autoCarLiabilityLimit = liabilityLimit;
  values.autoCarSlaviaDetail = parsedSlaviaAutoDetailValue(parsed);
  if (hullSumInsuredText) {
    values.autoCarHullSumInsured = null;
    values.autoCarHullSumInsuredText = hullSumInsuredText;
  } else {
    values.autoCarHullSumInsured = hullSumInsured;
    values.autoCarHullSumInsuredText = "";
  }
  values.autoCarHullSumInsuredDraft = "";
  values.autoCarHullDeductible = hullDeductible;
  values.autoCarHullDeductibleText = hullDeductibleText;
  values.autoCarHullRiskAccident = parsedPdfBooleanValue(parsed, "carHullRiskAccident");
  values.autoCarHullRiskTheft = parsedPdfBooleanValue(parsed, "carHullRiskTheft");
  values.autoCarHullRiskNatural = parsedPdfBooleanValue(parsed, "carHullRiskNatural");
  values.autoCarHullRiskVandalism = parsedPdfBooleanValue(parsed, "carHullRiskVandalism");
  values.autoCarHullRiskAnimalCollision = parsedPdfBooleanValue(parsed, "carHullRiskAnimalCollision");
  values.autoCarAssistancePlan = parsedPdfTextValue(parsed, "carAssistancePlan");
  values.autoCarAddonEso = parsedPdfBooleanValue(parsed, "carAddonEso");
  values.autoCarAddonNaturalRisks = parsedPdfBooleanValue(parsed, "carAddonNaturalRisks");
  values.autoCarAddonKlika = parsedPdfBooleanValue(parsed, "carAddonKlika");
  values.autoCarAddonGlass = parsedPdfBooleanOrNumberValue(parsed, "carAddonGlass", "carAddonGlassLimit");
  values.autoCarAddonGlassLimit = glassLimit;
  values.autoCarAddonAnimalCollision = parsedPdfBooleanOrNumberValue(parsed, "carAddonAnimalCollision", "carAddonAnimalCollisionLimit");
  values.autoCarAddonAnimalCollisionLimit = animalCollisionLimit;
  values.autoCarAddonAnimalDamage = parsedPdfBooleanOrNumberValue(parsed, "carAddonAnimalDamage", "carAddonAnimalDamageLimit");
  values.autoCarAddonAnimalDamageLimit = animalDamageLimit;
  values.autoCarAddonVandalism = parsedPdfBooleanValue(parsed, "carAddonVandalism");
  values.autoCarAddonTheft = parsedPdfBooleanOrNumberValue(parsed, "carAddonTheft", "carAddonTheftLimit");
  values.autoCarAddonTheftLimit = theftLimit;
  values.autoCarAddonNatural = parsedPdfBooleanOrNumberValue(parsed, "carAddonNatural", "carAddonNaturalLimit");
  values.autoCarAddonNaturalLimit = naturalLimit;
  values.autoCarAddonOwnDamage = parsedPdfBooleanOrNumberValue(parsed, "carAddonOwnDamage", "carAddonOwnDamageLimit");
  values.autoCarAddonOwnDamageLimit = ownDamageLimit;
  values.autoCarAddonGap = parsedPdfBooleanOrNumberValue(parsed, "carAddonGap", "carAddonGapLimit");
  values.autoCarAddonGapLimit = gapLimit;
  values.autoCarAddonSmartGap = parsedPdfBooleanValue(parsed, "carAddonSmartGap") || cppPremiumLiabilityBundle;
  values.autoCarAddonServisPro = parsedPdfBooleanValue(parsed, "carAddonServisPro") || cppPremiumLiabilityBundle;
  values.autoCarAddonFireExplosion = parsedPdfBooleanValue(parsed, "carAddonFireExplosion");
  values.autoCarAddonLegalAdvice = parsedPdfBooleanValue(parsed, "carAddonLegalAdvice");
  values.autoCarAddonReplacementCar = parsedPdfBooleanValue(parsed, "carAddonReplacementCar");
  values.autoCarAddonLuggage = parsedPdfBooleanValue(parsed, "carAddonLuggage");
  values.autoCarAddonTransportedGoods = parsedPdfBooleanValue(parsed, "carAddonTransportedGoods");
  values.autoCarAddonPothole = parsedPdfBooleanValue(parsed, "carAddonPothole");
  values.autoCarAddonNonFaultAccident = parsedPdfBooleanValue(parsed, "carAddonNonFaultAccident");
  values.autoCarAddonPassengerInjury = parsedPdfBooleanValue(parsed, "carAddonPassengerInjury");
  values.autoCarAddonKeyLossTheft = parsedPdfBooleanValue(parsed, "carAddonKeyLossTheft");
  values.domexAddress = parsedPdfTextValue(parsed, "domexAddress");
  values.domexPropertyType = parsedPdfTextValue(parsed, "domexPropertyType");
  values.domexPropertyCoverage = parsedPdfTextValue(parsed, "domexPropertyCoverage");
  values.domexPropertySumInsured = parsedPdfRoundedNumberValue(parsed, "domexPropertySumInsured");
  values.domexPropertyDeductible = parsedPdfRoundedNumberValue(parsed, "domexPropertyDeductible");
  values.domexHouseholdType = parsedPdfTextValue(parsed, "domexHouseholdType");
  values.domexHouseholdCoverage = parsedPdfTextValue(parsed, "domexHouseholdCoverage");
  values.domexHouseholdSumInsured = parsedPdfRoundedNumberValue(parsed, "domexHouseholdSumInsured");
  values.domexHouseholdDeductible = parsedPdfRoundedNumberValue(parsed, "domexHouseholdDeductible");
  values.domexOutbuildingSumInsured = parsedPdfRoundedNumberValue(parsed, "domexOutbuildingSumInsured");
  values.domexLiabilitySumInsured = parsedPdfRoundedNumberValue(parsed, "domexLiabilitySumInsured");
  values.domexLiabilityDeductible = parsedPdfRoundedNumberValue(parsed, "domexLiabilityDeductible");
  values.domexLiabilityMobile = parsedPdfBooleanValue(parsed, "domexLiabilityMobile");
  values.domexLiabilityTenant = parsedPdfBooleanValue(parsed, "domexLiabilityTenant");
  values.domexLiabilityLandlord = parsedPdfBooleanValue(parsed, "domexLiabilityLandlord");
  values.domexAssistancePlus = parsedPdfBooleanValue(parsed, "domexAssistancePlus");
  values.domexNote = parsedPdfTextValue(parsed, "domexNote");

  return values;
}

/** Only mapped fields reach their typed React setters; undefined means no update. */
export function applyCalculatorPdfFormValues(values: Partial<CalculatorPdfFormValues>, setters: CalculatorPdfFormSetters): void {
  const apply = <K extends keyof CalculatorPdfFormValues>(key: K) => {
    const value = values[key];
    if (value !== undefined) setters[key](value);
  };
  (Object.keys(values) as Array<keyof CalculatorPdfFormValues>).forEach(apply);
}

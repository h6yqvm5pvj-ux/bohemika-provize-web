import type { Product } from "../../types/domain";
import type { ContractDoc } from "./contractDetailTypes";
import { parseAllianzAutoPdf } from "@/app/lib/parseAllianzAutoPdf";
import { parseComfortPdf } from "@/app/lib/parseComfortPdf";
import { parseCppAutoPdf } from "@/app/lib/parseCppAutoPdf";
import { parseCppBytexPdf } from "@/app/lib/parseCppBytexPdf";
import { parseCppCestovkoPdf } from "@/app/lib/parseCppCestovkoPdf";
import { parseCppHafanPdf } from "@/app/lib/parseCppHafanPdf";
import { parseCppSimplexPdf } from "@/app/lib/parseCppSimplexPdf";
import { parseCsobAutoPdf } from "@/app/lib/parseCsobAutoPdf";
import { parseDomexPdf } from "@/app/lib/parseDomexPdf";
import { parseFlexiPdf } from "@/app/lib/parseFlexiPdf";
import { parseKooperativaAutoPdf } from "@/app/lib/parseKooperativaAutoPdf";
import { parseKoopOdzamPdf } from "@/app/lib/parseKoopOdzamPdf";
import { parseMaxCizinKomplexPdf } from "@/app/lib/parseMaxCizinKomplexPdf";
import { parseMaxdomovPdf } from "@/app/lib/parseMaxdomovPdf";
import { parseNeonPdf } from "@/app/lib/parseNeonPdf";
import { parsePillowAutoPdf } from "@/app/lib/parsePillowAutoPdf";
import { parseSlaviaAutoPdf } from "@/app/lib/parseSlaviaAutoPdf";
import { parseUniqaAutoPdf } from "@/app/lib/parseUniqaAutoPdf";

type PdfReimportParser = (file: File) => Promise<unknown>;
type PropertyDetail = NonNullable<ContractDoc["maxdomovDetail"]>;
type PropertyDetailField = keyof PropertyDetail;
type NeonDetail = NonNullable<ContractDoc["neonDetail"]>;
type NeonDetailField = keyof NeonDetail;
type SlaviaAutoDetail = NonNullable<ContractDoc["carSlaviaDetail"]>;
type SlaviaAutoDetailField = keyof SlaviaAutoDetail;
type ContractUpdateField = keyof ContractDoc;

export const PDF_REIMPORT_PARSERS: Partial<Record<Product, PdfReimportParser>> = {
  cppAuto: parseCppAutoPdf,
  slaviaauto: parseSlaviaAutoPdf,
  allianzAuto: parseAllianzAutoPdf,
  csobAuto: parseCsobAutoPdf,
  uniqaAuto: parseUniqaAutoPdf,
  pillowAuto: parsePillowAutoPdf,
  kooperativaAuto: parseKooperativaAutoPdf,
  cppcestovko: parseCppCestovkoPdf,
  cppsimplex: parseCppSimplexPdf,
  neon: parseNeonPdf,
  flexi: parseFlexiPdf,
  domex: parseDomexPdf,
  cppbytex: parseCppBytexPdf,
  cpphafan: parseCppHafanPdf,
  koopodzam: parseKoopOdzamPdf,
  maxdomov: parseMaxdomovPdf,
  maxcizinkomplex: parseMaxCizinKomplexPdf,
  comfortcc: parseComfortPdf,
};

const PDF_CONTRACT_FIELD_MAP = [
  ["contractNumber", "contractNumber"],
  ["clientName", "clientName"],
  ["policyStartDate", "policyStartDate"],
  ["policyEndDate", "policyEndDate"],
  ["contractSignedDate", "contractSignedDate"],
  ["durationYears", "durationYears"],
  ["durationMonths", "durationMonths"],
  ["maxCizinKomplexVariant", "maxCizinKomplexVariant"],
  ["carMake", "carMake"],
  ["carPlate", "carPlate"],
  ["carVin", "carVin"],
  ["carTp", "carTp"],
  ["carOrv", "carOrv"],
  ["carAnnualMileage", "carAnnualMileage"],
  ["carAllianzScope", "carAllianzScope"],
  ["carLiabilityLimit", "carLiabilityLimit"],
  ["carHullSumInsured", "carHullSumInsured"],
  ["carHullSumInsuredText", "carHullSumInsuredText"],
  ["carHullDeductible", "carHullDeductible"],
  ["carHullDeductibleText", "carHullDeductibleText"],
  ["carHullRiskAccident", "carHullRiskAccident"],
  ["carHullRiskTheft", "carHullRiskTheft"],
  ["carHullRiskNatural", "carHullRiskNatural"],
  ["carHullRiskVandalism", "carHullRiskVandalism"],
  ["carHullRiskAnimalCollision", "carHullRiskAnimalCollision"],
  ["carAssistancePlan", "carAssistancePlan"],
  ["carAddonEso", "carAddonEso"],
  ["carAddonNaturalRisks", "carAddonNaturalRisks"],
  ["carAddonGlass", "carAddonGlass"],
  ["carAddonAnimalCollision", "carAddonAnimalCollision"],
  ["carAddonAnimalDamage", "carAddonAnimalDamage"],
  ["carAddonAnimalDamageLimit", "carAddonAnimalDamageLimit"],
  ["carAddonVandalism", "carAddonVandalism"],
  ["carAddonTheft", "carAddonTheft"],
  ["carAddonNatural", "carAddonNatural"],
  ["carAddonPothole", "carAddonPothole"],
  ["carAddonNonFaultAccident", "carAddonNonFaultAccident"],
  ["carAddonGap", "carAddonGap"],
  ["carAddonReplacementCar", "carAddonReplacementCar"],
  ["carAddonLuggage", "carAddonLuggage"],
  ["carAddonTransportedGoods", "carAddonTransportedGoods"],
  ["carAddonFireExplosion", "carAddonFireExplosion"],
  ["carAddonLegalAdvice", "carAddonLegalAdvice"],
  ["carAddonKeyLossTheft", "carAddonKeyLossTheft"],
] as const satisfies ReadonlyArray<readonly [string, ContractUpdateField]>;

const NUMBER_CONTRACT_UPDATE_FIELDS = new Set<ContractUpdateField>([
  "durationYears",
  "durationMonths",
  "carLiabilityLimit",
  "carHullSumInsured",
  "carHullDeductible",
  "carAddonAnimalDamageLimit",
]);

const BOOLEAN_CONTRACT_UPDATE_FIELDS = new Set<ContractUpdateField>([
  "carHullRiskAccident",
  "carHullRiskTheft",
  "carHullRiskNatural",
  "carHullRiskVandalism",
  "carHullRiskAnimalCollision",
  "carAddonEso",
  "carAddonNaturalRisks",
  "carAddonGlass",
  "carAddonAnimalCollision",
  "carAddonAnimalDamage",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonNatural",
  "carAddonPothole",
  "carAddonNonFaultAccident",
  "carAddonGap",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonTransportedGoods",
  "carAddonFireExplosion",
  "carAddonLegalAdvice",
  "carAddonKeyLossTheft",
]);

const PROPERTY_PDF_DETAIL_FIELD_MAP = [
  ["domexAddress", "address"],
  ["domexPropertyType", "propertyType"],
  ["domexPropertyCoverage", "propertyCoverage"],
  ["domexPropertySumInsured", "sumInsured"],
  ["domexPropertyDeductible", "deductible"],
  ["domexHouseholdType", "householdType"],
  ["domexHouseholdCoverage", "householdCoverage"],
  ["domexHouseholdSumInsured", "householdSumInsured"],
  ["domexHouseholdDeductible", "householdDeductible"],
  ["domexOutbuildingSumInsured", "outbuildingSumInsured"],
  ["domexLiabilitySumInsured", "liabilitySumInsured"],
  ["domexLiabilityDeductible", "liabilityDeductible"],
  ["domexLiabilityMobile", "liabilityMobile"],
  ["domexLiabilityTenant", "liabilityTenant"],
  ["domexLiabilityLandlord", "liabilityLandlord"],
  ["domexAssistancePlus", "assistancePlus"],
] as const satisfies ReadonlyArray<readonly [string, PropertyDetailField]>;

const NEON_PDF_DETAIL_FIELD_MAP = [
  ["version", "version"],
  ["deathType", "deathType"],
  ["deathAmount", "deathAmount"],
  ["death2Type", "death2Type"],
  ["death2Amount", "death2Amount"],
  ["deathTerminalAmount", "deathTerminalAmount"],
  ["waiverInvalidity", "waiverInvalidity"],
  ["waiverUnemployment", "waiverUnemployment"],
  ["invalidityAType", "invalidityAType"],
  ["invalidityA1", "invalidityA1"],
  ["invalidityA2", "invalidityA2"],
  ["invalidityA3", "invalidityA3"],
  ["invalidityBType", "invalidityBType"],
  ["invalidityB1", "invalidityB1"],
  ["invalidityB2", "invalidityB2"],
  ["invalidityB3", "invalidityB3"],
  ["invalidityPension", "invalidityPension"],
  ["criticalType", "criticalIllnessType"],
  ["criticalVariant", "criticalIllnessVariant"],
  ["criticalAmount", "criticalIllnessAmount"],
  ["childSurgeryAmount", "childSurgeryAmount"],
  ["vaccinationCompAmount", "vaccinationCompAmount"],
  ["diabetesAmount", "diabetesAmount"],
  ["deathAccidentAmount", "deathAccidentAmount"],
  ["injuryPermanentAmount", "injuryPermanentAmount"],
  ["injuryPermanentFulfillmentFrom", "injuryPermanentFulfillmentFrom"],
  ["injuryPermanentProgression", "injuryPermanentProgression"],
  ["injuryPermanent2Amount", "injuryPermanent2Amount"],
  ["injuryPermanent2FulfillmentFrom", "injuryPermanent2FulfillmentFrom"],
  ["injuryPermanent2Progression", "injuryPermanent2Progression"],
  ["hospitalizationAmount", "hospitalizationAmount"],
  ["hospitalizationIllnessAmount", "hospitalizationIllnessAmount"],
  ["hospitalizationInjuryAmount", "hospitalizationInjuryAmount"],
  ["accidentDailyBenefitStart", "accidentDailyBenefitStart"],
  ["accidentDailyBenefitBackpay", "accidentDailyBenefitBackpay"],
  ["accidentDailyBenefit", "accidentDailyBenefit"],
  ["workIncapacityStart", "workIncapacityStart"],
  ["workIncapacityBackpay", "workIncapacityBackpay"],
  ["workIncapacityAmount", "workIncapacityAmount"],
  ["workIncapacityInjury", "workIncapacityInjury"],
  ["workIncapacityIllness", "workIncapacityIllness"],
  ["workIncapacity2Start", "workIncapacity2Start"],
  ["workIncapacity2Backpay", "workIncapacity2Backpay"],
  ["workIncapacity2Amount", "workIncapacity2Amount"],
  ["workIncapacity2Injury", "workIncapacity2Injury"],
  ["workIncapacity2Illness", "workIncapacity2Illness"],
  ["careDependencyAmount", "careDependencyAmount"],
  ["specialAidAmount", "specialAidAmount"],
  ["caregivingAmount", "caregivingAmount"],
  ["reproductionCostAmount", "reproductionCostAmount"],
  ["cppHelp", "cppHelp"],
  ["liabilityCitizenLimit", "liabilityCitizenLimit"],
  ["liabilityEmployeeLimit", "liabilityEmployeeLimit"],
  ["travelInsurance", "travelInsurance"],
] as const satisfies ReadonlyArray<readonly [string, NeonDetailField]>;

const NUMBER_PROPERTY_DETAIL_FIELDS = new Set<PropertyDetailField>([
  "sumInsured",
  "deductible",
  "householdSumInsured",
  "householdDeductible",
  "outbuildingSumInsured",
  "liabilitySumInsured",
  "liabilityDeductible",
]);

const BOOLEAN_PROPERTY_DETAIL_FIELDS = new Set<PropertyDetailField>([
  "liabilityMobile",
  "liabilityTenant",
  "liabilityLandlord",
  "assistancePlus",
]);

const NUMBER_NEON_DETAIL_FIELDS = new Set<NeonDetailField>([
  "deathAmount",
  "death2Amount",
  "deathTerminalAmount",
  "invalidityA1",
  "invalidityA2",
  "invalidityA3",
  "invalidityB1",
  "invalidityB2",
  "invalidityB3",
  "criticalIllnessAmount",
  "childSurgeryAmount",
  "vaccinationCompAmount",
  "diabetesAmount",
  "deathAccidentAmount",
  "injuryPermanentAmount",
  "injuryPermanent2Amount",
  "hospitalizationAmount",
  "hospitalizationIllnessAmount",
  "hospitalizationInjuryAmount",
  "accidentDailyBenefit",
  "workIncapacityAmount",
  "workIncapacity2Amount",
  "careDependencyAmount",
  "specialAidAmount",
  "caregivingAmount",
  "reproductionCostAmount",
  "liabilityCitizenLimit",
  "liabilityEmployeeLimit",
]);

const BOOLEAN_NEON_DETAIL_FIELDS = new Set<NeonDetailField>([
  "waiverInvalidity",
  "waiverUnemployment",
  "invalidityPension",
  "workIncapacityInjury",
  "workIncapacityIllness",
  "workIncapacity2Injury",
  "workIncapacity2Illness",
  "cppHelp",
  "travelInsurance",
]);

const NUMBER_SLAVIA_AUTO_DETAIL_FIELDS = new Set<SlaviaAutoDetailField>([
  "liabilityPropertyLimit",
  "driverInjuryPermanentLimit",
  "driverInjuryDeathLimit",
  "tiresLimit",
  "tiresDeductible",
  "keyLossTheftLimit",
  "keyLossLimit",
  "keyLossTheftDeductible",
  "vandalismLimit",
  "vandalismDeductible",
  "animalDamageDeductible",
]);

const BOOLEAN_SLAVIA_AUTO_DETAIL_FIELDS = new Set<SlaviaAutoDetailField>([
  "priceGuarantee3Years",
  "driverInjury",
  "tires",
]);

const isEmptyReimportValue = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return !Number.isFinite(value);
  return false;
};

const parsedPdfValueForContractField = (
  field: ContractUpdateField,
  rawValue: unknown
): string | number | boolean | null => {
  if (rawValue == null) return null;

  if (NUMBER_CONTRACT_UPDATE_FIELDS.has(field)) {
    const value =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(/\s+/g, "").replace(",", "."))
          : Number.NaN;
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (BOOLEAN_CONTRACT_UPDATE_FIELDS.has(field)) {
    return rawValue === true ? true : null;
  }

  const value = typeof rawValue === "string" ? rawValue.trim() : String(rawValue).trim();
  return value || null;
};

const parsedPdfValueForPropertyDetailField = (
  field: PropertyDetailField,
  rawValue: unknown
): string | number | boolean | null => {
  if (rawValue == null) return null;

  if (NUMBER_PROPERTY_DETAIL_FIELDS.has(field)) {
    const value =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(/\s+/g, "").replace(",", "."))
          : Number.NaN;
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (BOOLEAN_PROPERTY_DETAIL_FIELDS.has(field)) {
    return rawValue === true ? true : null;
  }

  const value = typeof rawValue === "string" ? rawValue.trim() : String(rawValue).trim();
  return value || null;
};

const parsedPdfValueForNeonDetailField = (
  field: NeonDetailField,
  rawValue: unknown
): string | number | boolean | null => {
  if (rawValue == null) return null;

  if (NUMBER_NEON_DETAIL_FIELDS.has(field)) {
    const value =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(/\s+/g, "").replace(",", "."))
          : Number.NaN;
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  if (BOOLEAN_NEON_DETAIL_FIELDS.has(field)) {
    return rawValue === true ? true : null;
  }

  const value = typeof rawValue === "string" ? rawValue.trim() : String(rawValue).trim();
  return value || null;
};

const parsedPdfValueForSlaviaAutoDetailField = (
  field: SlaviaAutoDetailField,
  rawValue: unknown
): string | number | boolean | null => {
  if (rawValue == null) return null;
  if (NUMBER_SLAVIA_AUTO_DETAIL_FIELDS.has(field)) {
    const value =
      typeof rawValue === "number"
        ? rawValue
        : typeof rawValue === "string"
          ? Number(rawValue.replace(/\s+/g, "").replace(",", "."))
          : Number.NaN;
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (BOOLEAN_SLAVIA_AUTO_DETAIL_FIELDS.has(field)) {
    return rawValue === true ? true : null;
  }
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  return value || null;
};

export const mergeEmptyContractFields = (
  currentContract: ContractDoc,
  parsed: Record<string, unknown>
): { updates: Record<string, string | number | boolean | null>; appliedCount: number } => {
  const updates: Record<string, string | number | boolean | null> = {};
  let appliedCount = 0;

  for (const [parsedKey, contractField] of PDF_CONTRACT_FIELD_MAP) {
    if (!isEmptyReimportValue(currentContract[contractField])) continue;

    const parsedValue = parsedPdfValueForContractField(contractField, parsed[parsedKey]);
    if (parsedValue == null) continue;

    updates[contractField] = parsedValue;
    appliedCount += 1;
  }

  return { updates, appliedCount };
};

export const mergeEmptyPropertyDetailFields = (
  currentDetail: ContractDoc["maxdomovDetail"] | ContractDoc["domexDetail"],
  parsed: Record<string, unknown>
): { detail: PropertyDetail; appliedCount: number } => {
  const detail: PropertyDetail = { ...(currentDetail ?? {}) };
  let appliedCount = 0;

  for (const [parsedKey, detailField] of PROPERTY_PDF_DETAIL_FIELD_MAP) {
    if (!isEmptyReimportValue(detail[detailField])) continue;

    const parsedValue = parsedPdfValueForPropertyDetailField(detailField, parsed[parsedKey]);
    if (parsedValue == null) continue;

    (detail as Record<PropertyDetailField, string | number | boolean | null | undefined>)[
      detailField
    ] = parsedValue;
    appliedCount += 1;
  }

  return { detail, appliedCount };
};

export const mergeEmptyNeonDetailFields = (
  currentDetail: ContractDoc["neonDetail"],
  riskFields: Record<string, unknown>
): { detail: NeonDetail; appliedCount: number } => {
  const detail: NeonDetail = { ...(currentDetail ?? {}) };
  let appliedCount = 0;

  for (const [parsedKey, detailField] of NEON_PDF_DETAIL_FIELD_MAP) {
    if (!isEmptyReimportValue(detail[detailField])) continue;

    const parsedValue = parsedPdfValueForNeonDetailField(detailField, riskFields[parsedKey]);
    if (parsedValue == null) continue;

    (detail as Record<NeonDetailField, string | number | boolean | null | undefined>)[
      detailField
    ] = parsedValue;
    appliedCount += 1;
  }

  return { detail, appliedCount };
};

export const mergeEmptySlaviaAutoDetailFields = (
  currentDetail: ContractDoc["carSlaviaDetail"],
  parsedDetail: Record<string, unknown>
): { detail: SlaviaAutoDetail; appliedCount: number } => {
  const detail: SlaviaAutoDetail = { ...(currentDetail ?? {}) };
  let appliedCount = 0;

  for (const detailField of Object.keys(parsedDetail) as SlaviaAutoDetailField[]) {
    const supported =
      detailField === "liabilityVariant" ||
      NUMBER_SLAVIA_AUTO_DETAIL_FIELDS.has(detailField) ||
      BOOLEAN_SLAVIA_AUTO_DETAIL_FIELDS.has(detailField);
    if (!supported) continue;
    if (!isEmptyReimportValue(detail[detailField])) continue;
    const parsedValue = parsedPdfValueForSlaviaAutoDetailField(
      detailField,
      parsedDetail[detailField]
    );
    if (parsedValue == null) continue;
    (detail as Record<SlaviaAutoDetailField, string | number | boolean | null | undefined>)[
      detailField
    ] = parsedValue;
    appliedCount += 1;
  }

  return { detail, appliedCount };
};

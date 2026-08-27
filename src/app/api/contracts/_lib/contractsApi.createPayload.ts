import { toDate } from "@/app/lib/formatters";
import type { ProductInstitutionId } from "@/app/lib/productCatalog";
import { productCoefficientValidityError } from "@/app/lib/productFormulas/coefficientSets";
import type {
  CommissionMode,
  CommissionResultItemDTO,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";

import {
  isReasonableContractDate,
  isValidContractNumber,
} from "./contractsApi.validation";
import type { ContractListProductCategory } from "./contractsApi.types";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TIP_CONTRACT_PERCENT_MIN = 5;
export const TIP_CONTRACT_PERCENT_MAX = 95;
const TIP_CONTRACT_PERCENT_STEP = 5;

const CREATE_ENTRY_ALLOWED_TOP_LEVEL_FIELDS = new Set<string>([
  "productKey",
  "entryType",
  "commissionMode",
  "inputAmount",
  "effectiveInputAmount",
  "comfortPayment",
  "comfortGradual",
  "comfortTargetAmount",
  "frequencyRaw",
  "clientName",
  "contractSignedDate",
  "policyStartDate",
  "policyEndDate",
  "status",
  "stornoDate",
  "durationYears",
  "durationMonths",
  "maxCizinKomplexVariant",
  "contractNumber",
  "tipContractTipsterEmail",
  "tipContractTipsterPercent",
  "tipContractSourceTipId",
  "tipContractSourceTipTitle",
  "tipContractSourceTipProductLabel",
  "tipContractSourceTipClientName",
  "tipContractSourceTipCreatedAtMs",
  "carMake",
  "carPlate",
  "carVin",
  "carTp",
  "carOrv",
  "carAnnualMileage",
  "carAllianzScope",
  "carLiabilityLimit",
  "carSlaviaDetail",
  "carAssistancePlan",
  "carHullSumInsured",
  "carHullSumInsuredText",
  "carHullDeductible",
  "carHullDeductibleText",
  "carHullRiskAccident",
  "carHullRiskTheft",
  "carHullRiskNatural",
  "carHullRiskVandalism",
  "carHullRiskAnimalCollision",
  "carAddonEso",
  "carAddonNaturalRisks",
  "carAddonKlika",
  "carAddonGlass",
  "carAddonGlassLimit",
  "carAddonAnimalCollision",
  "carAddonAnimalCollisionLimit",
  "carAddonAnimalDamage",
  "carAddonAnimalDamageLimit",
  "carAddonVandalism",
  "carAddonTheft",
  "carAddonTheftLimit",
  "carAddonNatural",
  "carAddonNaturalLimit",
  "carAddonOwnDamage",
  "carAddonOwnDamageLimit",
  "carAddonGap",
  "carAddonGapLimit",
  "carAddonSmartGap",
  "carAddonServisPro",
  "carAddonReplacementCar",
  "carAddonLuggage",
  "carAddonTransportedGoods",
  "carAddonFireExplosion",
  "carAddonLegalAdvice",
  "carAddonPothole",
  "carAddonNonFaultAccident",
  "carAddonPassengerInjury",
  "carAddonKeyLossTheft",
  "neonDetail",
  "domexDetail",
  "maxdomovDetail",
  "paid",
  "isRefresh",
  "refreshOriginalContractNumber",
  "refreshOriginalMissingInSystem",
  "requiresStatementRefresh",
  "commissionCalculationStatus",
  "commissionBaseSource",
  "refreshStatementResolvedAtMs",
  "refreshStatementResolvedStatementId",
  "refreshStatementResolvedStatementNumber",
  "refreshStatementResolvedStatementPeriod",
  "rootContractEntryId",
  "parentContractEntryId",
  "parentContractEntryPath",
  "calculationInputAmount",
  "previousInputAmount",
  "newInputAmount",
  "premiumDelta",
  "premiumIncreaseAmount",
  "premiumDecreaseAmount",
  "changeType",
  "premiumUpdatedFromStatementAtMs",
  "premiumUpdatedFromStatementChronologyMs",
  "premiumUpdatedFromStatementId",
  "createdFromCommissionStatement",
  "createdFromCommissionStatementAtMs",
  "createdFromCommissionStatementChronologyMs",
  "createdFromCommissionStatementId",
]);

const SUPPORTED_ENTRY_TYPES = new Set(["contract", "endorsement"] as const);
export const SUPPORTED_PRODUCTS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "maxcizinkomplex",
  "pillowInjury",
  "zamex",
  "cppbytex",
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopfit",
  "koopodzam",
  "kooppmop",
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "allianzAuto",
  "allianzmujdomov",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopflotila",
  "koopcestovko",
  "cppcestovko",
  "axacestovko",
  "comfortcc",
  "cppPPRs",
  "cppPPRbez",
]);
const SUPPORTED_PAYMENT_FREQUENCIES = new Set<PaymentFrequency>([
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
]);
const SUPPORTED_ENDORSEMENT_CHANGE_TYPES = new Set([
  "increase",
  "decrease",
  "same",
] as const);
const SUPPORTED_MAX_CIZIN_KOMPLEX_VARIANTS = new Set<MaxCizinKomplexVariant>([
  "exclusiveStandard",
  "premium",
]);

export const NEON_DETAIL_ALLOWED_KEYS = new Set<string>([
  "version",
  "deathType",
  "deathAmount",
  "death2Type",
  "death2Amount",
  "deathTerminalAmount",
  "waiverInvalidity",
  "waiverUnemployment",
  "invalidityAType",
  "invalidityA1",
  "invalidityA2",
  "invalidityA3",
  "invalidityBType",
  "invalidityB1",
  "invalidityB2",
  "invalidityB3",
  "invalidityPension",
  "criticalIllnessType",
  "criticalIllnessVariant",
  "criticalIllnessAmount",
  "childSurgeryAmount",
  "vaccinationCompAmount",
  "accidentDailyBenefitStart",
  "accidentDailyBenefitBackpay",
  "accidentDailyBenefit",
  "diabetesAmount",
  "deathAccidentAmount",
  "injuryPermanentAmount",
  "injuryPermanentFulfillmentFrom",
  "injuryPermanentProgression",
  "injuryPermanent2Amount",
  "injuryPermanent2FulfillmentFrom",
  "injuryPermanent2Progression",
  "hospitalizationAmount",
  "hospitalizationIllnessAmount",
  "hospitalizationInjuryAmount",
  "workIncapacityStart",
  "workIncapacityBackpay",
  "workIncapacityAmount",
  "workIncapacityInjury",
  "workIncapacityIllness",
  "workIncapacity2Start",
  "workIncapacity2Backpay",
  "workIncapacity2Amount",
  "workIncapacity2Injury",
  "workIncapacity2Illness",
  "careDependencyAmount",
  "specialAidAmount",
  "caregivingAmount",
  "reproductionCostAmount",
  "cppHelp",
  "liabilityCitizenLimit",
  "liabilityEmployeeLimit",
  "travelInsurance",
  "neonPdfRisks",
]);

export const FLEXI_DETAIL_ALLOWED_KEYS = new Set<string>([
  "deathAmount",
  "deathTypedType",
  "deathTypedAmount",
  "deathAccidentAmount",
  "seriousIllnessType",
  "seriousIllnessAmount",
  "seriousIllnessForHim",
  "seriousIllnessForHer",
  "permanentIllnessAmount",
  "invalidityIllnessType",
  "invalidityIllness1",
  "invalidityIllness2",
  "invalidityIllness3",
  "hospitalGeneralAmount",
  "workIncapacityStart",
  "workIncapacityBackpay",
  "workIncapacityAmount",
  "caregivingAmount",
  "permanentAccidentAmount",
  "injuryDamageAmount",
  "accidentDailyBenefit",
  "hospitalAccidentAmount",
  "invalidityAccidentType",
  "invalidityAccident1",
  "invalidityAccident2",
  "invalidityAccident3",
  "trafficDeathAccidentAmount",
  "trafficPermanentAccidentAmount",
  "trafficInjuryDamageAmount",
  "trafficAccidentDailyBenefit",
  "trafficHospitalAccidentAmount",
  "trafficWorkIncapacityAmount",
  "trafficInvalidityAmount",
  "loanDeathAmount",
  "loanInvalidityType",
  "loanInvalidity1",
  "loanInvalidity2",
  "loanInvalidity3",
  "loanIllnessAmount",
  "loanWorkIncapacityAmount",
  "addonMajakBasic",
  "addonMajakPlus",
  "addonLiabilityCitizen",
  "addonTravel",
]);

export const DOMEX_DETAIL_ALLOWED_KEYS = new Set<string>([
  "address",
  "propertyType",
  "propertyCoverage",
  "sumInsured",
  "deductible",
  "householdType",
  "householdCoverage",
  "householdSumInsured",
  "householdDeductible",
  "outbuildingSumInsured",
  "liabilitySumInsured",
  "liabilityDeductible",
  "liabilityMobile",
  "liabilityTenant",
  "liabilityLandlord",
  "assistancePlus",
  "note",
]);

export const SLAVIA_AUTO_DETAIL_ALLOWED_KEYS = new Set<string>([
  "liabilityVariant",
  "liabilityPropertyLimit",
  "priceGuarantee3Years",
  "driverInjury",
  "driverInjuryPermanentLimit",
  "driverInjuryDeathLimit",
  "tires",
  "tiresLimit",
  "tiresDeductible",
  "keyLossTheftLimit",
  "keyLossLimit",
  "keyLossTheftDeductible",
  "vandalismLimit",
  "vandalismDeductible",
  "animalDamageDeductible",
]);

const normalizeEmail = (email: string | null | undefined): string =>
  (email ?? "").trim().toLowerCase();

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const normalizeContractNumber = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, "").trim();

export const parseRequiredTrimmedText = (
  value: unknown,
  field: string,
  maxLen: number
): ParseResult<string> => {
  if (typeof value !== "string") {
    return { ok: false, error: `Pole ${field} musí být text.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `Pole ${field} nesmí být prázdné.` };
  }
  if (trimmed.length > maxLen) {
    return { ok: false, error: `Pole ${field} je příliš dlouhé.` };
  }
  return { ok: true, value: trimmed };
};

export const parseOptionalTrimmedText = (
  value: unknown,
  field: string,
  maxLen: number
): ParseResult<string | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `Pole ${field} musí být text nebo null.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > maxLen) {
    return { ok: false, error: `Pole ${field} je příliš dlouhé.` };
  }
  return { ok: true, value: trimmed };
};

export const parseOptionalFiniteNumber = (
  value: unknown,
  field: string,
  {
    min = 0,
    max = 1_000_000_000,
  }: { min?: number; max?: number } = {}
): ParseResult<number | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `Pole ${field} musí být číslo nebo null.` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `Pole ${field} je mimo povolený rozsah.` };
  }
  return { ok: true, value };
};

export const parseOptionalBoolean = (
  value: unknown,
  field: string
): ParseResult<boolean | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "boolean") {
    return { ok: false, error: `Pole ${field} musí být boolean nebo null.` };
  }
  return { ok: true, value };
};

const parseOptionalCommissionMode = (
  value: unknown,
  field: string
): ParseResult<CommissionMode | null> => {
  if (value == null) return { ok: true, value: null };
  if (value !== "accelerated" && value !== "standard") {
    return {
      ok: false,
      error: `Pole ${field} má nepodporovanou hodnotu.`,
    };
  }
  return { ok: true, value };
};

export const parseOptionalInteger = (
  value: unknown,
  field: string,
  { min, max }: { min: number; max: number }
): ParseResult<number | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: `Pole ${field} musí být celé číslo nebo null.` };
  }
  if (value < min || value > max) {
    return { ok: false, error: `Pole ${field} je mimo povolený rozsah.` };
  }
  return { ok: true, value };
};

const parseEntryType = (
  value: unknown
): ParseResult<"contract" | "endorsement"> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole entryType musí být text." };
  }
  const normalized = value.trim() as "contract" | "endorsement";
  if (!SUPPORTED_ENTRY_TYPES.has(normalized)) {
    return { ok: false, error: "Pole entryType má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

const parseProductKey = (value: unknown): ParseResult<Product> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole productKey musí být text." };
  }
  const normalized = value.trim() as Product;
  if (!SUPPORTED_PRODUCTS.has(normalized)) {
    return { ok: false, error: "Pole productKey má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

const parseFrequencyField = (
  value: unknown
): ParseResult<PaymentFrequency> => {
  if (typeof value !== "string") {
    return { ok: false, error: "Pole frequencyRaw musí být text." };
  }
  const normalized = value.trim() as PaymentFrequency;
  if (!SUPPORTED_PAYMENT_FREQUENCIES.has(normalized)) {
    return { ok: false, error: "Pole frequencyRaw má nepodporovanou hodnotu." };
  }
  return { ok: true, value: normalized };
};

export const parseOptionalMaxCizinKomplexVariant = (
  value: unknown
): ParseResult<MaxCizinKomplexVariant | null> => {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return {
      ok: false,
      error: "Pole maxCizinKomplexVariant musí být text nebo null.",
    };
  }
  const normalized = value.trim() as MaxCizinKomplexVariant;
  if (!SUPPORTED_MAX_CIZIN_KOMPLEX_VARIANTS.has(normalized)) {
    return {
      ok: false,
      error: "Pole maxCizinKomplexVariant má nepodporovanou hodnotu.",
    };
  }
  return { ok: true, value: normalized };
};

const parseOptionalContractStatus = (
  value: unknown,
  field: string
): ParseResult<"active" | "storno" | null> => {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `Pole ${field} musí být text nebo null.` };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized !== "active" && normalized !== "storno") {
    return { ok: false, error: `Pole ${field} má nepodporovanou hodnotu.` };
  }
  return { ok: true, value: normalized as "active" | "storno" };
};

const parseRequiredDateField = (
  value: unknown,
  field: string
): ParseResult<Date> => {
  const parsed = toDate(value);
  if (!parsed || !isReasonableContractDate(parsed)) {
    return { ok: false, error: `Pole ${field} má neplatné datum.` };
  }
  return { ok: true, value: parsed };
};

const parseOptionalDateField = (
  value: unknown,
  field: string
): ParseResult<Date | null> => {
  if (value == null || value === "") return { ok: true, value: null };
  return parseRequiredDateField(value, field);
};

const toIsoDay = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const sanitizeDetailObject = (
  value: unknown,
  field:
    | "neonDetail"
    | "flexiDetail"
    | "domexDetail"
    | "maxdomovDetail"
    | "carSlaviaDetail",
  allowedKeys: Set<string>
): ParseResult<Record<string, string | number | boolean | null> | null> => {
  if (value == null) return { ok: true, value: null };
  if (!isPlainObject(value)) {
    return { ok: false, error: `Pole ${field} musí být objekt nebo null.` };
  }

  const output: Record<string, string | number | boolean | null> = {};
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        error: `Pole ${field}.${key} není povolené.`,
      };
    }
  }

  for (const key of keys) {
    const raw = value[key];
    if (raw == null) {
      output[key] = null;
      continue;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      const maxLen = key === "note" ? 2_000 : 200;
      if (trimmed.length > maxLen) {
        return {
          ok: false,
          error: `Pole ${field}.${key} je příliš dlouhé.`,
        };
      }
      output[key] = trimmed || null;
      continue;
    }
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0 || raw > 1_000_000_000) {
        return {
          ok: false,
          error: `Pole ${field}.${key} má neplatnou číselnou hodnotu.`,
        };
      }
      output[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      output[key] = raw;
      continue;
    }
    return {
      ok: false,
      error: `Pole ${field}.${key} má nepodporovaný datový typ.`,
    };
  }

  return { ok: true, value: output };
};

export type NormalizedManagerChainEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

export type NormalizedManagerOverrideEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  items: CommissionResultItemDTO[];
  total: number;
};

export type RefreshCommissionBasePayload = {
  productKey: Product;
  method: "cpp_neon_5y_storno";
  calculationMethod: "storno_60_60" | "motivational_48_percent";
  originalContractNumber: string | null;
  originalStornoStartDateIso: string | null;
  refreshPolicyStartDateIso: string | null;
  stornoMonths: number;
  elapsedMonths: number;
  remainingMonths: number;
  earnedRatio: number;
  remainingRatio: number;
  newMonthlyPremium: number;
  newAnnualPremium: number;
  originalMonthlyPremium: number;
  originalAnnualPremium: number;
  premiumIncreaseMonthly: number;
  premiumIncreaseAnnual: number;
  stornoBaseMonthlyPremium: number;
  stornoBaseAnnualPremium: number;
  stornedOriginalMonthlyPremium: number;
  stornedOriginalAnnualPremium: number;
  motivationalMonthlyPremium: number;
  motivationalAnnualPremium: number;
  calculationMonthlyPremium: number;
  calculationAnnualPremium: number;
};

export type NormalizedCreateEntryPayload = {
  productKey: Product;
  entryType: "contract" | "endorsement";
  position: Position;
  commissionMode: CommissionMode | null;
  inputAmount: number;
  effectiveInputAmount: number;
  comfortPayment: number | null;
  comfortGradual: boolean | null;
  comfortTargetAmount: number | null;
  frequencyRaw: PaymentFrequency;
  items: CommissionResultItemDTO[];
  total: number;
  result: {
    items: CommissionResultItemDTO[];
    total: number;
  };
  clientName: string;
  userId: string;
  contractSignedDate: Date;
  policyStartDate: Date;
  policyEndDate: Date | null;
  status: "active" | "storno";
  stornoDate: Date | null;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  userEmail: string;
  contractNumber: string;
  clientSearchKeys?: string[];
  contractNumberSearchKeys?: string[];
  duplicateLookupKey: string | null;
  tipContractTipsterEmail: string | null;
  tipContractTipsterName: string | null;
  tipContractTipsterPercent: number | null;
  tipContractImmediateFirstYearGross: number | null;
  tipContractImmediateFirstYearNet: number | null;
  tipContractTipsterAmountFirstYear: number | null;
  tipContractSourceTipId: string | null;
  tipContractSourceTipTitle: string | null;
  tipContractSourceTipProductLabel: string | null;
  tipContractSourceTipClientName: string | null;
  tipContractSourceTipCreatedAtMs: number | null;
  carMake: string | null;
  carPlate: string | null;
  carVin: string | null;
  carTp: string | null;
  carOrv: string | null;
  carAnnualMileage: string | null;
  carAllianzScope: string | null;
  carLiabilityLimit: number | null;
  carSlaviaDetail: Record<string, string | number | boolean | null> | null;
  carAssistancePlan: string | null;
  carHullSumInsured: number | null;
  carHullSumInsuredText: string | null;
  carHullDeductible: number | null;
  carHullDeductibleText: string | null;
  carHullRiskAccident: boolean | null;
  carHullRiskTheft: boolean | null;
  carHullRiskNatural: boolean | null;
  carHullRiskVandalism: boolean | null;
  carHullRiskAnimalCollision: boolean | null;
  carAddonEso: boolean | null;
  carAddonNaturalRisks: boolean | null;
  carAddonKlika: boolean | null;
  carAddonGlass: boolean | null;
  carAddonGlassLimit: number | null;
  carAddonAnimalCollision: boolean | null;
  carAddonAnimalCollisionLimit: number | null;
  carAddonAnimalDamage: boolean | null;
  carAddonAnimalDamageLimit: number | null;
  carAddonVandalism: boolean | null;
  carAddonTheft: boolean | null;
  carAddonTheftLimit: number | null;
  carAddonNatural: boolean | null;
  carAddonNaturalLimit: number | null;
  carAddonOwnDamage: boolean | null;
  carAddonOwnDamageLimit: number | null;
  carAddonGap: boolean | null;
  carAddonGapLimit: number | null;
  carAddonSmartGap: boolean | null;
  carAddonServisPro: boolean | null;
  carAddonReplacementCar: boolean | null;
  carAddonLuggage: boolean | null;
  carAddonTransportedGoods: boolean | null;
  carAddonFireExplosion: boolean | null;
  carAddonLegalAdvice: boolean | null;
  carAddonPothole: boolean | null;
  carAddonNonFaultAccident: boolean | null;
  carAddonPassengerInjury: boolean | null;
  carAddonKeyLossTheft: boolean | null;
  neonDetail: Record<string, unknown> | null;
  domexDetail: Record<string, unknown> | null;
  maxdomovDetail: Record<string, unknown> | null;
  paid: boolean;
  productCategory: ContractListProductCategory | null;
  institutionId: ProductInstitutionId | null;
  lifecycleStatus: "active" | "storno" | "dozita";
  managerEmailSnapshot: string | null;
  managerPositionSnapshot: Position | null;
  managerModeSnapshot: CommissionMode | null;
  managerChain: NormalizedManagerChainEntry[];
  managerOverrides: NormalizedManagerOverrideEntry[];
  allowedEmails: string[];
  createdAt: Date;
  isRefresh: boolean | null;
  refreshOriginalContractNumber: string | null;
  refreshOriginalMissingInSystem: boolean | null;
  requiresStatementRefresh: boolean | null;
  commissionCalculationStatus: string | null;
  commissionBaseSource: string | null;
  refreshCommissionBase: RefreshCommissionBasePayload | null;
  rootContractEntryId: string | null;
  parentContractEntryId: string | null;
  parentContractEntryPath: string | null;
  calculationInputAmount: number | null;
  previousInputAmount: number | null;
  newInputAmount: number | null;
  premiumDelta: number | null;
  premiumIncreaseAmount: number | null;
  premiumDecreaseAmount: number | null;
  changeType: "increase" | "decrease" | "same" | null;
  premiumUpdatedFromStatementAtMs: number | null;
  premiumUpdatedFromStatementChronologyMs: number | null;
  premiumUpdatedFromStatementId: string | null;
  createdFromCommissionStatement: boolean | null;
  createdFromCommissionStatementAtMs: number | null;
  createdFromCommissionStatementChronologyMs: number | null;
  createdFromCommissionStatementId: string | null;
};

export const normalizeCreateEntryPayload = ({
  raw,
  ownerEmail,
  ownerUid,
}: {
  raw: unknown;
  ownerEmail: string;
  ownerUid: string;
}): { ok: true; payload: NormalizedCreateEntryPayload } | { ok: false; error: string } => {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Payload musí být objekt." };
  }

  const unknownFields = Object.keys(raw).filter(
    (field) => !CREATE_ENTRY_ALLOWED_TOP_LEVEL_FIELDS.has(field)
  );
  if (unknownFields.length > 0) {
    return {
      ok: false,
      error: `Nepovolená pole v entry: ${unknownFields.join(", ")}.`,
    };
  }

  const entryTypeParsed = parseEntryType(raw.entryType);
  if (!entryTypeParsed.ok) return entryTypeParsed;
  const productParsed = parseProductKey(raw.productKey);
  if (!productParsed.ok) return productParsed;
  const commissionModeParsed = parseOptionalCommissionMode(raw.commissionMode, "commissionMode");
  if (!commissionModeParsed.ok) return commissionModeParsed;
  const freqParsed = parseFrequencyField(raw.frequencyRaw);
  if (!freqParsed.ok) return freqParsed;
  const paidParsed = parseOptionalBoolean(raw.paid, "paid");
  if (!paidParsed.ok) return paidParsed;

  const clientNameParsed = parseRequiredTrimmedText(raw.clientName, "clientName", 200);
  if (!clientNameParsed.ok) return clientNameParsed;
  const contractNumberParsed = parseRequiredTrimmedText(raw.contractNumber, "contractNumber", 120);
  if (!contractNumberParsed.ok) return contractNumberParsed;
  if (!isValidContractNumber(contractNumberParsed.value)) {
    return { ok: false, error: "Pole contractNumber má neplatný formát." };
  }
  const tipContractTipsterEmailParsed = parseOptionalTrimmedText(
    raw.tipContractTipsterEmail,
    "tipContractTipsterEmail",
    200
  );
  if (!tipContractTipsterEmailParsed.ok) return tipContractTipsterEmailParsed;
  const tipContractTipsterPercentParsed = parseOptionalFiniteNumber(
    raw.tipContractTipsterPercent,
    "tipContractTipsterPercent",
    { min: TIP_CONTRACT_PERCENT_MIN, max: TIP_CONTRACT_PERCENT_MAX }
  );
  if (!tipContractTipsterPercentParsed.ok) return tipContractTipsterPercentParsed;
  const tipContractSourceTipIdParsed = parseOptionalTrimmedText(
    raw.tipContractSourceTipId,
    "tipContractSourceTipId",
    240
  );
  if (!tipContractSourceTipIdParsed.ok) return tipContractSourceTipIdParsed;
  const tipContractSourceTipTitleParsed = parseOptionalTrimmedText(
    raw.tipContractSourceTipTitle,
    "tipContractSourceTipTitle",
    240
  );
  if (!tipContractSourceTipTitleParsed.ok) return tipContractSourceTipTitleParsed;
  const tipContractSourceTipProductLabelParsed = parseOptionalTrimmedText(
    raw.tipContractSourceTipProductLabel,
    "tipContractSourceTipProductLabel",
    120
  );
  if (!tipContractSourceTipProductLabelParsed.ok) return tipContractSourceTipProductLabelParsed;
  const tipContractSourceTipClientNameParsed = parseOptionalTrimmedText(
    raw.tipContractSourceTipClientName,
    "tipContractSourceTipClientName",
    200
  );
  if (!tipContractSourceTipClientNameParsed.ok) return tipContractSourceTipClientNameParsed;
  const tipContractSourceTipCreatedAtMsParsed = parseOptionalFiniteNumber(
    raw.tipContractSourceTipCreatedAtMs,
    "tipContractSourceTipCreatedAtMs",
    { min: 0, max: 4_102_444_800_000 }
  );
  if (!tipContractSourceTipCreatedAtMsParsed.ok) return tipContractSourceTipCreatedAtMsParsed;

  const tipContractTipsterEmail = normalizeEmail(tipContractTipsterEmailParsed.value);
  const tipContractSourceTipId = tipContractSourceTipIdParsed.value;
  const rawTipContractPercent = tipContractTipsterPercentParsed.value;
  let tipContractTipsterPercent: number | null = null;
  if (rawTipContractPercent != null) {
    const roundedTipContractPercent = Math.round(rawTipContractPercent);
    if (
      Math.abs(rawTipContractPercent - roundedTipContractPercent) > 0.000001 ||
      roundedTipContractPercent % TIP_CONTRACT_PERCENT_STEP !== 0
    ) {
      return {
        ok: false,
        error: `Pole tipContractTipsterPercent musí být násobek ${TIP_CONTRACT_PERCENT_STEP}.`,
      };
    }
    tipContractTipsterPercent = roundedTipContractPercent;
  }
  if (tipContractTipsterEmail && tipContractTipsterPercent == null) {
    return {
      ok: false,
      error: "Pole tipContractTipsterPercent je povinné, pokud je vyplněné tipContractTipsterEmail.",
    };
  }
  if (tipContractTipsterEmail && !EMAIL_RE.test(tipContractTipsterEmail)) {
    return { ok: false, error: "Pole tipContractTipsterEmail má neplatný formát." };
  }
  if (tipContractTipsterEmail && tipContractTipsterEmail === ownerEmail) {
    return { ok: false, error: "Tipař nemůže být stejný uživatel jako sjednatel." };
  }
  if (tipContractSourceTipId && tipContractSourceTipId.includes("/")) {
    return { ok: false, error: "Pole tipContractSourceTipId má neplatný formát." };
  }
  if (tipContractSourceTipId && !tipContractTipsterEmail) {
    return {
      ok: false,
      error: "Vybraný tip musí mít vyplněného tipaře.",
    };
  }

  const carMakeParsed = parseOptionalTrimmedText(raw.carMake, "carMake", 120);
  if (!carMakeParsed.ok) return carMakeParsed;
  const carPlateParsed = parseOptionalTrimmedText(raw.carPlate, "carPlate", 40);
  if (!carPlateParsed.ok) return carPlateParsed;
  const carVinParsed = parseOptionalTrimmedText(raw.carVin, "carVin", 40);
  if (!carVinParsed.ok) return carVinParsed;
  const carTpParsed = parseOptionalTrimmedText(raw.carTp, "carTp", 40);
  if (!carTpParsed.ok) return carTpParsed;
  const carOrvParsed = parseOptionalTrimmedText(raw.carOrv, "carOrv", 40);
  if (!carOrvParsed.ok) return carOrvParsed;
  const carAnnualMileageParsed = parseOptionalTrimmedText(
    raw.carAnnualMileage,
    "carAnnualMileage",
    120
  );
  if (!carAnnualMileageParsed.ok) return carAnnualMileageParsed;
  const carAllianzScopeParsed = parseOptionalTrimmedText(
    raw.carAllianzScope,
    "carAllianzScope",
    40
  );
  if (!carAllianzScopeParsed.ok) return carAllianzScopeParsed;
  const carLiabilityLimitParsed = parseOptionalFiniteNumber(
    raw.carLiabilityLimit,
    "carLiabilityLimit"
  );
  if (!carLiabilityLimitParsed.ok) return carLiabilityLimitParsed;
  const carSlaviaDetailParsed = sanitizeDetailObject(
    raw.carSlaviaDetail,
    "carSlaviaDetail",
    SLAVIA_AUTO_DETAIL_ALLOWED_KEYS
  );
  if (!carSlaviaDetailParsed.ok) return carSlaviaDetailParsed;
  const carAssistancePlanParsed = parseOptionalTrimmedText(
    raw.carAssistancePlan,
    "carAssistancePlan",
    120
  );
  if (!carAssistancePlanParsed.ok) return carAssistancePlanParsed;
  const carHullSumInsuredParsed = parseOptionalFiniteNumber(
    raw.carHullSumInsured,
    "carHullSumInsured"
  );
  if (!carHullSumInsuredParsed.ok) return carHullSumInsuredParsed;
  const carHullSumInsuredTextParsed = parseOptionalTrimmedText(
    raw.carHullSumInsuredText,
    "carHullSumInsuredText",
    200
  );
  if (!carHullSumInsuredTextParsed.ok) return carHullSumInsuredTextParsed;
  const carHullDeductibleParsed = parseOptionalFiniteNumber(
    raw.carHullDeductible,
    "carHullDeductible"
  );
  if (!carHullDeductibleParsed.ok) return carHullDeductibleParsed;
  const carHullDeductibleTextParsed = parseOptionalTrimmedText(
    raw.carHullDeductibleText,
    "carHullDeductibleText",
    200
  );
  if (!carHullDeductibleTextParsed.ok) return carHullDeductibleTextParsed;
  const carHullRiskAccidentParsed = parseOptionalBoolean(
    raw.carHullRiskAccident,
    "carHullRiskAccident"
  );
  if (!carHullRiskAccidentParsed.ok) return carHullRiskAccidentParsed;
  const carHullRiskTheftParsed = parseOptionalBoolean(
    raw.carHullRiskTheft,
    "carHullRiskTheft"
  );
  if (!carHullRiskTheftParsed.ok) return carHullRiskTheftParsed;
  const carHullRiskNaturalParsed = parseOptionalBoolean(
    raw.carHullRiskNatural,
    "carHullRiskNatural"
  );
  if (!carHullRiskNaturalParsed.ok) return carHullRiskNaturalParsed;
  const carHullRiskVandalismParsed = parseOptionalBoolean(
    raw.carHullRiskVandalism,
    "carHullRiskVandalism"
  );
  if (!carHullRiskVandalismParsed.ok) return carHullRiskVandalismParsed;
  const carHullRiskAnimalCollisionParsed = parseOptionalBoolean(
    raw.carHullRiskAnimalCollision,
    "carHullRiskAnimalCollision"
  );
  if (!carHullRiskAnimalCollisionParsed.ok) return carHullRiskAnimalCollisionParsed;
  const carAddonEsoParsed = parseOptionalBoolean(raw.carAddonEso, "carAddonEso");
  if (!carAddonEsoParsed.ok) return carAddonEsoParsed;
  const carAddonNaturalRisksParsed = parseOptionalBoolean(
    raw.carAddonNaturalRisks,
    "carAddonNaturalRisks"
  );
  if (!carAddonNaturalRisksParsed.ok) return carAddonNaturalRisksParsed;
  const carAddonKlikaParsed = parseOptionalBoolean(raw.carAddonKlika, "carAddonKlika");
  if (!carAddonKlikaParsed.ok) return carAddonKlikaParsed;
  const carAddonGlassParsed = parseOptionalBoolean(raw.carAddonGlass, "carAddonGlass");
  if (!carAddonGlassParsed.ok) return carAddonGlassParsed;
  const carAddonGlassLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonGlassLimit,
    "carAddonGlassLimit"
  );
  if (!carAddonGlassLimitParsed.ok) return carAddonGlassLimitParsed;
  const carAddonAnimalCollisionParsed = parseOptionalBoolean(
    raw.carAddonAnimalCollision,
    "carAddonAnimalCollision"
  );
  if (!carAddonAnimalCollisionParsed.ok) return carAddonAnimalCollisionParsed;
  const carAddonAnimalCollisionLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonAnimalCollisionLimit,
    "carAddonAnimalCollisionLimit"
  );
  if (!carAddonAnimalCollisionLimitParsed.ok) {
    return carAddonAnimalCollisionLimitParsed;
  }
  const carAddonAnimalDamageParsed = parseOptionalBoolean(
    raw.carAddonAnimalDamage,
    "carAddonAnimalDamage"
  );
  if (!carAddonAnimalDamageParsed.ok) return carAddonAnimalDamageParsed;
  const carAddonAnimalDamageLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonAnimalDamageLimit,
    "carAddonAnimalDamageLimit"
  );
  if (!carAddonAnimalDamageLimitParsed.ok) return carAddonAnimalDamageLimitParsed;
  const carAddonVandalismParsed = parseOptionalBoolean(
    raw.carAddonVandalism,
    "carAddonVandalism"
  );
  if (!carAddonVandalismParsed.ok) return carAddonVandalismParsed;
  const carAddonTheftParsed = parseOptionalBoolean(raw.carAddonTheft, "carAddonTheft");
  if (!carAddonTheftParsed.ok) return carAddonTheftParsed;
  const carAddonTheftLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonTheftLimit,
    "carAddonTheftLimit"
  );
  if (!carAddonTheftLimitParsed.ok) return carAddonTheftLimitParsed;
  const carAddonNaturalParsed = parseOptionalBoolean(
    raw.carAddonNatural,
    "carAddonNatural"
  );
  if (!carAddonNaturalParsed.ok) return carAddonNaturalParsed;
  const carAddonNaturalLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonNaturalLimit,
    "carAddonNaturalLimit"
  );
  if (!carAddonNaturalLimitParsed.ok) return carAddonNaturalLimitParsed;
  const carAddonOwnDamageParsed = parseOptionalBoolean(
    raw.carAddonOwnDamage,
    "carAddonOwnDamage"
  );
  if (!carAddonOwnDamageParsed.ok) return carAddonOwnDamageParsed;
  const carAddonOwnDamageLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonOwnDamageLimit,
    "carAddonOwnDamageLimit"
  );
  if (!carAddonOwnDamageLimitParsed.ok) return carAddonOwnDamageLimitParsed;
  const carAddonGapParsed = parseOptionalBoolean(raw.carAddonGap, "carAddonGap");
  if (!carAddonGapParsed.ok) return carAddonGapParsed;
  const carAddonGapLimitParsed = parseOptionalFiniteNumber(
    raw.carAddonGapLimit,
    "carAddonGapLimit"
  );
  if (!carAddonGapLimitParsed.ok) return carAddonGapLimitParsed;
  const carAddonSmartGapParsed = parseOptionalBoolean(
    raw.carAddonSmartGap,
    "carAddonSmartGap"
  );
  if (!carAddonSmartGapParsed.ok) return carAddonSmartGapParsed;
  const carAddonServisProParsed = parseOptionalBoolean(
    raw.carAddonServisPro,
    "carAddonServisPro"
  );
  if (!carAddonServisProParsed.ok) return carAddonServisProParsed;
  const carAddonReplacementCarParsed = parseOptionalBoolean(
    raw.carAddonReplacementCar,
    "carAddonReplacementCar"
  );
  if (!carAddonReplacementCarParsed.ok) return carAddonReplacementCarParsed;
  const carAddonLuggageParsed = parseOptionalBoolean(
    raw.carAddonLuggage,
    "carAddonLuggage"
  );
  if (!carAddonLuggageParsed.ok) return carAddonLuggageParsed;
  const carAddonTransportedGoodsParsed = parseOptionalBoolean(
    raw.carAddonTransportedGoods,
    "carAddonTransportedGoods"
  );
  if (!carAddonTransportedGoodsParsed.ok) return carAddonTransportedGoodsParsed;
  const carAddonFireExplosionParsed = parseOptionalBoolean(
    raw.carAddonFireExplosion,
    "carAddonFireExplosion"
  );
  if (!carAddonFireExplosionParsed.ok) return carAddonFireExplosionParsed;
  const carAddonLegalAdviceParsed = parseOptionalBoolean(
    raw.carAddonLegalAdvice,
    "carAddonLegalAdvice"
  );
  if (!carAddonLegalAdviceParsed.ok) return carAddonLegalAdviceParsed;
  const carAddonPotholeParsed = parseOptionalBoolean(
    raw.carAddonPothole,
    "carAddonPothole"
  );
  if (!carAddonPotholeParsed.ok) return carAddonPotholeParsed;
  const carAddonNonFaultAccidentParsed = parseOptionalBoolean(
    raw.carAddonNonFaultAccident,
    "carAddonNonFaultAccident"
  );
  if (!carAddonNonFaultAccidentParsed.ok) return carAddonNonFaultAccidentParsed;
  const carAddonPassengerInjuryParsed = parseOptionalBoolean(
    raw.carAddonPassengerInjury,
    "carAddonPassengerInjury"
  );
  if (!carAddonPassengerInjuryParsed.ok) return carAddonPassengerInjuryParsed;
  const carAddonKeyLossTheftParsed = parseOptionalBoolean(
    raw.carAddonKeyLossTheft,
    "carAddonKeyLossTheft"
  );
  if (!carAddonKeyLossTheftParsed.ok) return carAddonKeyLossTheftParsed;
  const neonDetailParsed = sanitizeDetailObject(
    raw.neonDetail,
    "neonDetail",
    NEON_DETAIL_ALLOWED_KEYS
  );
  if (!neonDetailParsed.ok) return neonDetailParsed;
  const domexDetailParsed = sanitizeDetailObject(
    raw.domexDetail,
    "domexDetail",
    DOMEX_DETAIL_ALLOWED_KEYS
  );
  if (!domexDetailParsed.ok) return domexDetailParsed;
  const maxdomovDetailParsed = sanitizeDetailObject(
    raw.maxdomovDetail,
    "maxdomovDetail",
    DOMEX_DETAIL_ALLOWED_KEYS
  );
  if (!maxdomovDetailParsed.ok) return maxdomovDetailParsed;

  const signedDateParsed = parseRequiredDateField(raw.contractSignedDate, "contractSignedDate");
  if (!signedDateParsed.ok) return signedDateParsed;
  const policyStartParsed = parseRequiredDateField(raw.policyStartDate, "policyStartDate");
  if (!policyStartParsed.ok) return policyStartParsed;
  const policyEndParsed = parseOptionalDateField(raw.policyEndDate, "policyEndDate");
  if (!policyEndParsed.ok) return policyEndParsed;
  const statusParsed = parseOptionalContractStatus(raw.status, "status");
  if (!statusParsed.ok) return statusParsed;
  const stornoDateParsed = parseOptionalDateField(raw.stornoDate, "stornoDate");
  if (!stornoDateParsed.ok) return stornoDateParsed;
  if (policyStartParsed.value.getTime() < signedDateParsed.value.getTime()) {
    return {
      ok: false,
      error: "Pole policyStartDate nemůže být dřív než contractSignedDate.",
    };
  }
  if (
    policyEndParsed.value &&
    policyEndParsed.value.getTime() < policyStartParsed.value.getTime()
  ) {
    return {
      ok: false,
      error: "Pole policyEndDate nemůže být dřív než policyStartDate.",
    };
  }
  const lifecycleStatus =
    statusParsed.value ?? (stornoDateParsed.value ? "storno" : "active");
  if (lifecycleStatus === "storno" && !stornoDateParsed.value) {
    return { ok: false, error: "Storno musí mít vyplněné datum storna." };
  }
  if (lifecycleStatus !== "storno" && stornoDateParsed.value) {
    return {
      ok: false,
      error: "Datum storna lze uložit jen ke smlouvě se stavem storno.",
    };
  }
  if (
    lifecycleStatus === "storno" &&
    stornoDateParsed.value &&
    stornoDateParsed.value.getTime() < policyStartParsed.value.getTime()
  ) {
    return { ok: false, error: "Datum storna nesmí být před datem počátku smlouvy." };
  }
  const coefficientValidityError = productCoefficientValidityError(
    productParsed.value,
    toIsoDay(signedDateParsed.value)
  );
  if (coefficientValidityError) {
    return { ok: false, error: coefficientValidityError };
  }

  const inputAmountParsed = parseOptionalFiniteNumber(raw.inputAmount, "inputAmount");
  if (!inputAmountParsed.ok) return inputAmountParsed;
  const effectiveInputAmountParsed = parseOptionalFiniteNumber(
    raw.effectiveInputAmount,
    "effectiveInputAmount"
  );
  if (!effectiveInputAmountParsed.ok) return effectiveInputAmountParsed;
  const comfortPaymentParsed = parseOptionalFiniteNumber(raw.comfortPayment, "comfortPayment");
  if (!comfortPaymentParsed.ok) return comfortPaymentParsed;
  const comfortGradualParsed = parseOptionalBoolean(raw.comfortGradual, "comfortGradual");
  if (!comfortGradualParsed.ok) return comfortGradualParsed;
  const comfortTargetAmountParsed = parseOptionalFiniteNumber(
    raw.comfortTargetAmount,
    "comfortTargetAmount"
  );
  if (!comfortTargetAmountParsed.ok) return comfortTargetAmountParsed;
  const durationYearsParsed = parseOptionalInteger(raw.durationYears, "durationYears", {
    min: 1,
    max: 120,
  });
  if (!durationYearsParsed.ok) return durationYearsParsed;
  const durationMonthsParsed = parseOptionalInteger(raw.durationMonths, "durationMonths", {
    min: 1,
    max: 240,
  });
  if (!durationMonthsParsed.ok) return durationMonthsParsed;
  const maxCizinKomplexVariantParsed = parseOptionalMaxCizinKomplexVariant(
    raw.maxCizinKomplexVariant
  );
  if (!maxCizinKomplexVariantParsed.ok) return maxCizinKomplexVariantParsed;

  const isRefreshParsed = parseOptionalBoolean(raw.isRefresh, "isRefresh");
  if (!isRefreshParsed.ok) return isRefreshParsed;
  const refreshOriginalParsed = parseOptionalTrimmedText(
    raw.refreshOriginalContractNumber,
    "refreshOriginalContractNumber",
    120
  );
  if (!refreshOriginalParsed.ok) return refreshOriginalParsed;
  const refreshOriginalMissingParsed = parseOptionalBoolean(
    raw.refreshOriginalMissingInSystem,
    "refreshOriginalMissingInSystem"
  );
  if (!refreshOriginalMissingParsed.ok) return refreshOriginalMissingParsed;
  const requiresStatementRefreshParsed = parseOptionalBoolean(
    raw.requiresStatementRefresh,
    "requiresStatementRefresh"
  );
  if (!requiresStatementRefreshParsed.ok) return requiresStatementRefreshParsed;
  const commissionCalculationStatusParsed = parseOptionalTrimmedText(
    raw.commissionCalculationStatus,
    "commissionCalculationStatus",
    80
  );
  if (!commissionCalculationStatusParsed.ok) return commissionCalculationStatusParsed;
  const commissionBaseSourceParsed = parseOptionalTrimmedText(
    raw.commissionBaseSource,
    "commissionBaseSource",
    80
  );
  if (!commissionBaseSourceParsed.ok) return commissionBaseSourceParsed;
  const isRefresh = isRefreshParsed.value === true;
  const refreshOriginalMissingInSystem = refreshOriginalMissingParsed.value === true;
  const refreshOriginalContractNumber = refreshOriginalMissingInSystem
    ? null
    : refreshOriginalParsed.value;
  const supportsOriginalReplacement =
    productParsed.value === "neon" ||
    productParsed.value === "domex" ||
    productParsed.value === "cppAuto";
  if (isRefresh && !supportsOriginalReplacement) {
    return { ok: false, error: "Refresh/Náhrada je podporovaná jen pro produkty ČPP ŽP NEON, DOMEX a ČPP Auto." };
  }
  if (refreshOriginalMissingInSystem && !supportsOriginalReplacement) {
    return {
      ok: false,
      error:
        "Refresh/Náhrada bez původní smlouvy v systému je podporovaná jen pro produkty ČPP ŽP NEON, DOMEX a ČPP Auto.",
    };
  }
  if (refreshOriginalMissingInSystem && !isRefresh) {
    return { ok: false, error: "Při refreshOriginalMissingInSystem musí být isRefresh true." };
  }
  if (requiresStatementRefreshParsed.value === true && !refreshOriginalMissingInSystem) {
    return { ok: false, error: "requiresStatementRefresh je povolený jen pro Refresh bez původní smlouvy v systému." };
  }
  if (refreshOriginalParsed.value && !supportsOriginalReplacement) {
    return { ok: false, error: "Pole refreshOriginalContractNumber je povolené jen pro produkty ČPP ŽP NEON, DOMEX a ČPP Auto." };
  }
  if (refreshOriginalParsed.value && !isRefresh) {
    return { ok: false, error: "Při vyplněném refreshOriginalContractNumber musí být isRefresh true." };
  }
  if (isRefresh && !refreshOriginalMissingInSystem && !refreshOriginalContractNumber) {
    return { ok: false, error: "Pro Refresh/Náhradu je povinné číslo původní smlouvy." };
  }
  if (refreshOriginalContractNumber && !isValidContractNumber(refreshOriginalContractNumber)) {
    return { ok: false, error: "Pole refreshOriginalContractNumber má neplatný formát." };
  }
  if (
    refreshOriginalContractNumber &&
    normalizeContractNumber(refreshOriginalContractNumber) ===
      normalizeContractNumber(contractNumberParsed.value)
  ) {
    return {
      ok: false,
      error: "Číslo původní smlouvy musí být jiné než číslo nové smlouvy.",
    };
  }

  const rootEntryIdParsed = parseOptionalTrimmedText(
    raw.rootContractEntryId,
    "rootContractEntryId",
    120
  );
  if (!rootEntryIdParsed.ok) return rootEntryIdParsed;
  const parentEntryIdParsed = parseOptionalTrimmedText(
    raw.parentContractEntryId,
    "parentContractEntryId",
    120
  );
  if (!parentEntryIdParsed.ok) return parentEntryIdParsed;
  const parentPathParsed = parseOptionalTrimmedText(
    raw.parentContractEntryPath,
    "parentContractEntryPath",
    400
  );
  if (!parentPathParsed.ok) return parentPathParsed;

  const calcInputParsed = parseOptionalFiniteNumber(
    raw.calculationInputAmount,
    "calculationInputAmount"
  );
  if (!calcInputParsed.ok) return calcInputParsed;
  const previousInputParsed = parseOptionalFiniteNumber(
    raw.previousInputAmount,
    "previousInputAmount"
  );
  if (!previousInputParsed.ok) return previousInputParsed;
  const newInputParsed = parseOptionalFiniteNumber(raw.newInputAmount, "newInputAmount");
  if (!newInputParsed.ok) return newInputParsed;
  const premiumDeltaParsed = parseOptionalFiniteNumber(raw.premiumDelta, "premiumDelta", {
    min: -1_000_000_000,
    max: 1_000_000_000,
  });
  if (!premiumDeltaParsed.ok) return premiumDeltaParsed;
  const premiumIncreaseParsed = parseOptionalFiniteNumber(
    raw.premiumIncreaseAmount,
    "premiumIncreaseAmount"
  );
  if (!premiumIncreaseParsed.ok) return premiumIncreaseParsed;
  const premiumDecreaseParsed = parseOptionalFiniteNumber(
    raw.premiumDecreaseAmount,
    "premiumDecreaseAmount"
  );
  if (!premiumDecreaseParsed.ok) return premiumDecreaseParsed;
  const premiumUpdatedFromStatementAtParsed = parseOptionalFiniteNumber(
    raw.premiumUpdatedFromStatementAtMs,
    "premiumUpdatedFromStatementAtMs",
    { max: 8_640_000_000_000_000 }
  );
  if (!premiumUpdatedFromStatementAtParsed.ok) return premiumUpdatedFromStatementAtParsed;
  const premiumUpdatedFromStatementChronologyParsed = parseOptionalFiniteNumber(
    raw.premiumUpdatedFromStatementChronologyMs,
    "premiumUpdatedFromStatementChronologyMs",
    { max: 8_640_000_000_000_000 }
  );
  if (!premiumUpdatedFromStatementChronologyParsed.ok) {
    return premiumUpdatedFromStatementChronologyParsed;
  }
  const premiumUpdatedFromStatementIdParsed = parseOptionalTrimmedText(
    raw.premiumUpdatedFromStatementId,
    "premiumUpdatedFromStatementId",
    160
  );
  if (!premiumUpdatedFromStatementIdParsed.ok) return premiumUpdatedFromStatementIdParsed;
  const createdFromCommissionStatementParsed = parseOptionalBoolean(
    raw.createdFromCommissionStatement,
    "createdFromCommissionStatement"
  );
  if (!createdFromCommissionStatementParsed.ok) {
    return createdFromCommissionStatementParsed;
  }
  const createdFromCommissionStatementAtParsed = parseOptionalFiniteNumber(
    raw.createdFromCommissionStatementAtMs,
    "createdFromCommissionStatementAtMs",
    { max: 8_640_000_000_000_000 }
  );
  if (!createdFromCommissionStatementAtParsed.ok) {
    return createdFromCommissionStatementAtParsed;
  }
  const createdFromCommissionStatementChronologyParsed = parseOptionalFiniteNumber(
    raw.createdFromCommissionStatementChronologyMs,
    "createdFromCommissionStatementChronologyMs",
    { max: 8_640_000_000_000_000 }
  );
  if (!createdFromCommissionStatementChronologyParsed.ok) {
    return createdFromCommissionStatementChronologyParsed;
  }
  const createdFromCommissionStatementIdParsed = parseOptionalTrimmedText(
    raw.createdFromCommissionStatementId,
    "createdFromCommissionStatementId",
    160
  );
  if (!createdFromCommissionStatementIdParsed.ok) {
    return createdFromCommissionStatementIdParsed;
  }

  let changeType: "increase" | "decrease" | "same" | null = null;
  if (raw.changeType != null && raw.changeType !== "") {
    if (typeof raw.changeType !== "string") {
      return { ok: false, error: "Pole changeType musí být text nebo null." };
    }
    const normalized = raw.changeType.trim() as "increase" | "decrease" | "same";
    if (!SUPPORTED_ENDORSEMENT_CHANGE_TYPES.has(normalized)) {
      return { ok: false, error: "Pole changeType má nepodporovanou hodnotu." };
    }
    changeType = normalized;
  }

  if (entryTypeParsed.value === "endorsement") {
    if (!rootEntryIdParsed.value || !parentEntryIdParsed.value) {
      return {
        ok: false,
        error: "Dodatek musí obsahovat rootContractEntryId i parentContractEntryId.",
      };
    }
  }

  if (
    productParsed.value === "maxcizinkomplex" &&
    durationMonthsParsed.value == null
  ) {
    return {
      ok: false,
      error: "Pro produkt MAXIMA Cizinci je povinné pole durationMonths.",
    };
  }

  return {
    ok: true,
    payload: {
      productKey: productParsed.value,
      entryType: entryTypeParsed.value,
      position: "poradce1",
      commissionMode: commissionModeParsed.value,
      inputAmount: inputAmountParsed.value ?? 0,
      effectiveInputAmount: effectiveInputAmountParsed.value ?? inputAmountParsed.value ?? 0,
      comfortPayment: comfortPaymentParsed.value,
      comfortGradual: comfortGradualParsed.value,
      comfortTargetAmount: comfortTargetAmountParsed.value,
      frequencyRaw: freqParsed.value,
      items: [],
      total: 0,
      result: {
        items: [],
        total: 0,
      },
      clientName: clientNameParsed.value,
      userId: ownerUid,
      contractSignedDate: signedDateParsed.value,
      policyStartDate: policyStartParsed.value,
      policyEndDate: policyEndParsed.value,
      status: lifecycleStatus,
      stornoDate: stornoDateParsed.value,
      durationYears: durationYearsParsed.value,
      durationMonths:
        productParsed.value === "maxcizinkomplex"
          ? durationMonthsParsed.value
          : null,
      maxCizinKomplexVariant:
        productParsed.value === "maxcizinkomplex"
          ? maxCizinKomplexVariantParsed.value ?? "exclusiveStandard"
          : null,
      userEmail: ownerEmail,
      contractNumber: contractNumberParsed.value,
      duplicateLookupKey: null,
      tipContractTipsterEmail: tipContractTipsterEmail || null,
      tipContractTipsterName: null,
      tipContractTipsterPercent,
      tipContractImmediateFirstYearGross: null,
      tipContractImmediateFirstYearNet: null,
      tipContractTipsterAmountFirstYear: null,
      tipContractSourceTipId: tipContractSourceTipId || null,
      tipContractSourceTipTitle: tipContractSourceTipId
        ? tipContractSourceTipTitleParsed.value || null
        : null,
      tipContractSourceTipProductLabel: tipContractSourceTipId
        ? tipContractSourceTipProductLabelParsed.value || null
        : null,
      tipContractSourceTipClientName: tipContractSourceTipId
        ? tipContractSourceTipClientNameParsed.value || null
        : null,
      tipContractSourceTipCreatedAtMs:
        tipContractSourceTipId && tipContractSourceTipCreatedAtMsParsed.value != null
          ? Math.round(tipContractSourceTipCreatedAtMsParsed.value)
          : null,
      carMake: carMakeParsed.value,
      carPlate: carPlateParsed.value,
      carVin: carVinParsed.value,
      carTp: carTpParsed.value,
      carOrv: carOrvParsed.value,
      carAnnualMileage: carAnnualMileageParsed.value,
      carAllianzScope: carAllianzScopeParsed.value,
      carLiabilityLimit: carLiabilityLimitParsed.value,
      carSlaviaDetail:
        productParsed.value === "slaviaauto" ? carSlaviaDetailParsed.value : null,
      carAssistancePlan: carAssistancePlanParsed.value,
      carHullSumInsured: carHullSumInsuredParsed.value,
      carHullSumInsuredText: carHullSumInsuredTextParsed.value,
      carHullDeductible: carHullDeductibleParsed.value,
      carHullDeductibleText: carHullDeductibleTextParsed.value,
      carHullRiskAccident: carHullRiskAccidentParsed.value,
      carHullRiskTheft: carHullRiskTheftParsed.value,
      carHullRiskNatural: carHullRiskNaturalParsed.value,
      carHullRiskVandalism: carHullRiskVandalismParsed.value,
      carHullRiskAnimalCollision: carHullRiskAnimalCollisionParsed.value,
      carAddonEso: carAddonEsoParsed.value,
      carAddonNaturalRisks: carAddonNaturalRisksParsed.value,
      carAddonKlika: carAddonKlikaParsed.value,
      carAddonGlass: carAddonGlassParsed.value,
      carAddonGlassLimit: carAddonGlassParsed.value ? carAddonGlassLimitParsed.value : null,
      carAddonAnimalCollision: carAddonAnimalCollisionParsed.value,
      carAddonAnimalCollisionLimit: carAddonAnimalCollisionParsed.value
        ? carAddonAnimalCollisionLimitParsed.value
        : null,
      carAddonAnimalDamage: carAddonAnimalDamageParsed.value,
      carAddonAnimalDamageLimit: carAddonAnimalDamageParsed.value
        ? carAddonAnimalDamageLimitParsed.value
        : null,
      carAddonVandalism: carAddonVandalismParsed.value,
      carAddonTheft: carAddonTheftParsed.value,
      carAddonTheftLimit: carAddonTheftParsed.value
        ? carAddonTheftLimitParsed.value
        : null,
      carAddonNatural: carAddonNaturalParsed.value,
      carAddonNaturalLimit: carAddonNaturalParsed.value
        ? carAddonNaturalLimitParsed.value
        : null,
      carAddonOwnDamage: carAddonOwnDamageParsed.value,
      carAddonOwnDamageLimit: carAddonOwnDamageParsed.value
        ? carAddonOwnDamageLimitParsed.value
        : null,
      carAddonGap: carAddonGapParsed.value,
      carAddonGapLimit: carAddonGapParsed.value ? carAddonGapLimitParsed.value : null,
      carAddonSmartGap: carAddonSmartGapParsed.value,
      carAddonServisPro: carAddonServisProParsed.value,
      carAddonReplacementCar: carAddonReplacementCarParsed.value,
      carAddonLuggage: carAddonLuggageParsed.value,
      carAddonTransportedGoods: carAddonTransportedGoodsParsed.value,
      carAddonFireExplosion: carAddonFireExplosionParsed.value,
      carAddonLegalAdvice: carAddonLegalAdviceParsed.value,
      carAddonPothole: carAddonPotholeParsed.value,
      carAddonNonFaultAccident: carAddonNonFaultAccidentParsed.value,
      carAddonPassengerInjury: carAddonPassengerInjuryParsed.value,
      carAddonKeyLossTheft: carAddonKeyLossTheftParsed.value,
      neonDetail: productParsed.value === "neon" ? neonDetailParsed.value : null,
      domexDetail: productParsed.value === "domex" ? domexDetailParsed.value : null,
      maxdomovDetail:
        productParsed.value === "maxdomov" ? maxdomovDetailParsed.value : null,
      paid: paidParsed.value === true,
      productCategory: null,
      institutionId: null,
      lifecycleStatus: lifecycleStatus === "storno" ? "storno" : "active",
      managerEmailSnapshot: null,
      managerPositionSnapshot: null,
      managerModeSnapshot: null,
      managerChain: [],
      managerOverrides: [],
      allowedEmails: [ownerEmail],
      createdAt: new Date(),
      isRefresh: isRefreshParsed.value,
      refreshOriginalContractNumber,
      refreshOriginalMissingInSystem: refreshOriginalMissingInSystem || null,
      requiresStatementRefresh: refreshOriginalMissingInSystem || null,
      commissionCalculationStatus: refreshOriginalMissingInSystem
        ? commissionCalculationStatusParsed.value || "provisional_refresh_missing_original"
        : null,
      commissionBaseSource: refreshOriginalMissingInSystem
        ? commissionBaseSourceParsed.value || "calculator_provisional"
        : null,
      refreshCommissionBase: null,
      rootContractEntryId:
        entryTypeParsed.value === "endorsement" ? rootEntryIdParsed.value : null,
      parentContractEntryId:
        entryTypeParsed.value === "endorsement" ? parentEntryIdParsed.value : null,
      parentContractEntryPath:
        entryTypeParsed.value === "endorsement" ? parentPathParsed.value : null,
      calculationInputAmount: calcInputParsed.value,
      previousInputAmount:
        entryTypeParsed.value === "endorsement" ? previousInputParsed.value : null,
      newInputAmount: entryTypeParsed.value === "endorsement" ? newInputParsed.value : null,
      premiumDelta: entryTypeParsed.value === "endorsement" ? premiumDeltaParsed.value : null,
      premiumIncreaseAmount:
        entryTypeParsed.value === "endorsement" ? premiumIncreaseParsed.value : null,
      premiumDecreaseAmount:
        entryTypeParsed.value === "endorsement" ? premiumDecreaseParsed.value : null,
      changeType: entryTypeParsed.value === "endorsement" ? changeType : null,
      premiumUpdatedFromStatementAtMs:
        premiumUpdatedFromStatementAtParsed.value == null
          ? null
          : Math.round(premiumUpdatedFromStatementAtParsed.value),
      premiumUpdatedFromStatementChronologyMs:
        premiumUpdatedFromStatementChronologyParsed.value == null
          ? null
          : Math.round(premiumUpdatedFromStatementChronologyParsed.value),
      premiumUpdatedFromStatementId: premiumUpdatedFromStatementIdParsed.value,
      createdFromCommissionStatement:
        createdFromCommissionStatementParsed.value === true ? true : null,
      createdFromCommissionStatementAtMs:
        createdFromCommissionStatementAtParsed.value == null
          ? null
          : Math.round(createdFromCommissionStatementAtParsed.value),
      createdFromCommissionStatementChronologyMs:
        createdFromCommissionStatementChronologyParsed.value == null
          ? null
          : Math.round(createdFromCommissionStatementChronologyParsed.value),
      createdFromCommissionStatementId: createdFromCommissionStatementIdParsed.value,
    },
  };
};

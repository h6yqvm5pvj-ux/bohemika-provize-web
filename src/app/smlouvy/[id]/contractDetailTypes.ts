import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
  type MaxCizinKomplexVariant,
} from "../../types/domain";

export type ContractCommissionPayoutStatus =
  | "paid"
  | "difference"
  | "storno";

export type ContractCommissionPayout = {
  key?: string | null;
  code?: string | null;
  title?: string | null;
  amount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  differenceReason?:
    | "career_mismatch"
    | "premium_base_mismatch"
    | "commission_amount_mismatch"
    | "storno"
    | string
    | null;
  career?: string | null;
  detail?: string | null;
  status?: ContractCommissionPayoutStatus | string | null;
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  statementDate?: string | null;
  statementChronologyMs?: number | null;
  payoutMonthKey?: string | null;
  writtenAtMs?: number | null;
  writtenBy?: string | null;
};

export type ContractCommissionStornoSummary = {
  totalAmount?: number | null;
  totalAbsAmount?: number | null;
  count?: number | null;
  latestStatementId?: string | null;
  latestStatementNumber?: string | null;
  latestStatementPeriod?: string | null;
  latestStatementDate?: string | null;
  latestStatementChronologyMs?: number | null;
  latestPayoutMonthKey?: string | null;
  updatedAtMs?: number | null;
  updatedBy?: string | null;
};

export type ContractAutoPremiumStatementHistoryEntry = {
  key?: string | null;
  premiumKind?: "auto_change" | "life_increase" | string | null;
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  statementDate?: string | null;
  payoutMonthKey?: string | null;
  anniversaryNumber?: number | null;
  anniversaryDate?: string | null;
  previousPremium?: number | null;
  newPremium?: number | null;
  difference?: number | null;
  previousAnnualPremium?: number | null;
  newAnnualPremium?: number | null;
  differenceAnnual?: number | null;
  basePremiumPeriod?: "annual" | "payment" | string | null;
  productCode?: string | null;
  commissionCode?: string | null;
  rowId?: string | null;
  validFrom?: string | null;
  source?: "own" | "manager" | string | null;
  writtenAtMs?: number | null;
  writtenBy?: string | null;
};

export type ContractAutoPremiumStatementRow = {
  rowId: string;
  contractNumber: string;
  client: string | null;
  productCode: string;
  productKey: Product | null;
  commissionCode: string;
  basePremium: number;
  commission: number | null;
  signedAt: string | null;
  validFrom: string | null;
  source: "own" | "manager";
};

export type ContractCommissionStatementSummary = {
  id: string;
  fileName: string;
  statementNumber: string | null;
  statementDate: string | null;
  period: string | null;
  periodStartMs: number | null;
  periodEndMs: number | null;
  payoutMonthKey: string | null;
  autoPremiumRows: ContractAutoPremiumStatementRow[];
};

export type ContractCommissionStatementDetail = ContractCommissionStatementSummary & {
  html: string;
};

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type ContractDoc = {
  id: string;
  contractPdfAttachment?: {
    kind?: "contractPdf" | string;
    hasFile?: boolean;
    originalName?: string | null;
    contentType?: "application/pdf" | string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
    uploadedAtMs?: number | null;
    uploadedBy?: string | null;
  } | null;
  note?: string | null;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  refreshOriginalMissingInSystem?: boolean | null;
  requiresStatementRefresh?: boolean | null;
  commissionCalculationStatus?: string | null;
  commissionBaseSource?: string | null;
  refreshStatementResolvedAtMs?: number | null;
  refreshStatementResolvedStatementId?: string | null;
  refreshStatementResolvedStatementNumber?: string | null;
  refreshStatementResolvedStatementPeriod?: string | null;
  refreshStatementResolvedStatementDate?: string | null;
  refreshStatementResolvedStatementChronologyMs?: number | null;
  refreshCommissionBase?: {
    productKey?: Product | null;
    method?: "cpp_neon_5y_storno" | string | null;
    calculationMethod?: "storno_60_60" | "motivational_48_percent" | string | null;
    originalContractNumber?: string | null;
    originalStornoStartDateIso?: string | null;
    refreshPolicyStartDateIso?: string | null;
    stornoMonths?: number | null;
    elapsedMonths?: number | null;
    remainingMonths?: number | null;
    earnedRatio?: number | null;
    remainingRatio?: number | null;
    newMonthlyPremium?: number | null;
    newAnnualPremium?: number | null;
    originalMonthlyPremium?: number | null;
    originalAnnualPremium?: number | null;
    premiumIncreaseMonthly?: number | null;
    premiumIncreaseAnnual?: number | null;
    stornoBaseMonthlyPremium?: number | null;
    stornoBaseAnnualPremium?: number | null;
    stornedOriginalMonthlyPremium?: number | null;
    stornedOriginalAnnualPremium?: number | null;
    motivationalMonthlyPremium?: number | null;
    motivationalAnnualPremium?: number | null;
    calculationMonthlyPremium?: number | null;
    calculationAnnualPremium?: number | null;
  } | null;
  refreshReplacedByEntryId?: string | null;
  refreshReplacedByOwnerEmail?: string | null;
  refreshReplacedBySignedDate?: FirestoreTimestamp | Date | string | number | null;
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  parentContractEntryPath?: string | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: CommissionMode | null;
  managerChain?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
  }[];
  managerOverrides?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
    items: CommissionResultItemDTO[];
    total: number;
  }[];

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  calculationInputAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
  premiumDecreaseAmount?: number | null;
  changeType?: "increase" | "decrease" | "same" | string | null;
  frequencyRaw?: PaymentFrequency | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  comfortTargetAmount?: number | null;
  total?: number;
  items?: CommissionResultItemDTO[];
  commissionPayouts?: ContractCommissionPayout[] | null;
  commissionStornoSummary?: ContractCommissionStornoSummary | null;
  premiumStatementHistory?: ContractAutoPremiumStatementHistoryEntry[] | null;
  premiumUpdatedFromStatementAtMs?: number | null;
  premiumUpdatedFromStatementChronologyMs?: number | null;
  premiumUpdatedFromStatementId?: string | null;
  initialCommissionBase?: {
    paymentPremium?: number | null;
    annualPremium?: number | null;
    statementId?: string | null;
    statementNumber?: string | null;
    statementPeriod?: string | null;
    statementDate?: string | null;
    statementChronologyMs?: number | null;
    commissionCode?: string | null;
    productCode?: string | null;
    rowId?: string | null;
    resolvedAtMs?: number | null;
    resolvedBy?: string | null;
  } | null;
  createdFromCommissionStatement?: boolean | null;
  createdFromCommissionStatementAtMs?: number | null;
  createdFromCommissionStatementChronologyMs?: number | null;
  createdFromCommissionStatementId?: string | null;

  commissionMode?: CommissionMode | null;

  userEmail?: string | null;
  adviserEmail?: string | null;
  adviserName?: string | null;
  originalAdviserEmail?: string | null;
  originalAdviserName?: string | null;
  originalPosition?: Position | null;
  servicingOwnerEmail?: string | null;
  servicingOwnerName?: string | null;
  commissionOwnerEmail?: string | null;
  transferReason?: "manual" | "career_end" | string | null;
  transferAt?: FirestoreTimestamp | Date | string | number | null;
  transferEffectiveDate?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;
  maxxContractDetailUrl?: string | null;
  cppExtranetEntityTypeId?: string | number | null;
  cppExtranetEntityId?: string | number | null;
  tipContractTipsterEmail?: string | null;
  tipContractTipsterName?: string | null;
  tipContractTipsterPercent?: number | null;
  tipContractImmediateFirstYearGross?: number | null;
  tipContractImmediateFirstYearNet?: number | null;
  tipContractTipsterAmountFirstYear?: number | null;
  tipContractSourceTipId?: string | null;
  tipContractSourceTipTitle?: string | null;
  tipContractSourceTipProductLabel?: string | null;
  tipContractSourceTipClientName?: string | null;
  tipContractSourceTipCreatedAtMs?: number | null;

  policyStartDate?: FirestoreTimestamp | Date | string | null;
  policyEndDate?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  createdAt?: FirestoreTimestamp | Date | string | null;

  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carOrv?: string | null;
  carAnnualMileage?: string | null;
  carAllianzScope?: string | null;
  carLiabilityLimit?: number | null;
  carSlaviaDetail?: {
    liabilityVariant?: string | null;
    liabilityPropertyLimit?: number | null;
    priceGuarantee3Years?: boolean | null;
    driverInjury?: boolean | null;
    driverInjuryPermanentLimit?: number | null;
    driverInjuryDeathLimit?: number | null;
    tires?: boolean | null;
    tiresLimit?: number | null;
    tiresDeductible?: number | null;
    keyLossTheftLimit?: number | null;
    keyLossLimit?: number | null;
    keyLossTheftDeductible?: number | null;
    vandalismLimit?: number | null;
    vandalismDeductible?: number | null;
    animalDamageDeductible?: number | null;
  } | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonEso?: boolean | null;
  carAddonNaturalRisks?: boolean | null;
  carAddonKlika?: boolean | null;
  carAddonGlass?: boolean | null;
  carAddonGlassLimit?: number | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalCollisionLimit?: number | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonAnimalDamageLimit?: number | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonTheftLimit?: number | null;
  carAddonNatural?: boolean | null;
  carAddonNaturalLimit?: number | null;
  carAddonOwnDamage?: boolean | null;
  carAddonOwnDamageLimit?: number | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonGapLimit?: number | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonFireExplosion?: boolean | null;
  carAddonLegalAdvice?: boolean | null;
  carAddonPassengerInjury?: boolean | null;
  carAddonKeyLossTheft?: boolean | null;

  domexDetail?: {
    address?: string | null;
    propertyType?: string | null;
    propertyCoverage?: string | null;
    sumInsured?: number | null;
    deductible?: number | null;
    householdType?: string | null;
    householdCoverage?: string | null;
    householdSumInsured?: number | null;
    householdDeductible?: number | null;
    outbuildingSumInsured?: number | null;
    liabilitySumInsured?: number | null;
    liabilityDeductible?: number | null;
    liabilityMobile?: boolean | null;
    liabilityTenant?: boolean | null;
    liabilityLandlord?: boolean | null;
    assistancePlus?: boolean | null;
    note?: string | null;
  } | null;
  maxdomovDetail?: {
    address?: string | null;
    propertyType?: string | null;
    propertyCoverage?: string | null;
    sumInsured?: number | null;
    deductible?: number | null;
    householdType?: string | null;
    householdCoverage?: string | null;
    householdSumInsured?: number | null;
    householdDeductible?: number | null;
    outbuildingSumInsured?: number | null;
    liabilitySumInsured?: number | null;
    liabilityDeductible?: number | null;
    liabilityMobile?: boolean | null;
    liabilityTenant?: boolean | null;
    liabilityLandlord?: boolean | null;
    assistancePlus?: boolean | null;
    note?: string | null;
  } | null;
  neonDetail?: {
    version?: string | null;
    deathType?: string | null;
    deathAmount?: number | null;
    death2Type?: string | null;
    death2Amount?: number | null;
    deathTerminalAmount?: number | null;
    waiverInvalidity?: boolean | null;
    waiverUnemployment?: boolean | null;
    invalidityAType?: string | null;
    invalidityA1?: number | null;
    invalidityA2?: number | null;
    invalidityA3?: number | null;
    invalidityBType?: string | null;
    invalidityB1?: number | null;
    invalidityB2?: number | null;
    invalidityB3?: number | null;
    invalidityPension?: boolean | null;
    criticalIllnessType?: string | null;
    criticalIllnessVariant?: string | null;
    criticalIllnessAmount?: number | null;
    childSurgeryAmount?: number | null;
    vaccinationCompAmount?: number | null;
    diabetesAmount?: number | null;
    deathAccidentAmount?: number | null;
    injuryPermanentAmount?: number | null;
    injuryPermanentFulfillmentFrom?: string | null;
    injuryPermanentProgression?: string | null;
    injuryPermanent2Amount?: number | null;
    injuryPermanent2FulfillmentFrom?: string | null;
    injuryPermanent2Progression?: string | null;
    hospitalizationAmount?: number | null;
    hospitalizationIllnessAmount?: number | null;
    hospitalizationInjuryAmount?: number | null;
    accidentDailyBenefitStart?: string | null;
    accidentDailyBenefitBackpay?: string | null;
    workIncapacityStart?: string | null;
    workIncapacityBackpay?: string | null;
    workIncapacityAmount?: number | null;
    workIncapacityInjury?: boolean | null;
    workIncapacityIllness?: boolean | null;
    workIncapacity2Start?: string | null;
    workIncapacity2Backpay?: string | null;
    workIncapacity2Amount?: number | null;
    workIncapacity2Injury?: boolean | null;
    workIncapacity2Illness?: boolean | null;
    careDependencyAmount?: number | null;
    specialAidAmount?: number | null;
    caregivingAmount?: number | null;
    reproductionCostAmount?: number | null;
    cppHelp?: boolean | null;
    liabilityCitizenLimit?: number | null;
    liabilityEmployeeLimit?: number | null;
    travelInsurance?: boolean | null;
    accidentDailyBenefit?: number | null;
  } | null;
  flexiDetail?: {
    deathAmount?: number | null;
    deathTypedType?: string | null;
    deathTypedAmount?: number | null;
    deathAccidentAmount?: number | null;
    seriousIllnessType?: string | null;
    seriousIllnessAmount?: number | null;
    seriousIllnessForHim?: number | null;
    seriousIllnessForHer?: number | null;
    permanentIllnessAmount?: number | null;
    invalidityIllnessType?: string | null;
    invalidityIllness1?: number | null;
    invalidityIllness2?: number | null;
    invalidityIllness3?: number | null;
    hospitalGeneralAmount?: number | null;
    workIncapacityStart?: string | null;
    workIncapacityBackpay?: string | null;
    workIncapacityAmount?: number | null;
    caregivingAmount?: number | null;
    permanentAccidentAmount?: number | null;
    injuryDamageAmount?: number | null;
    accidentDailyBenefit?: number | null;
    hospitalAccidentAmount?: number | null;
    invalidityAccidentType?: string | null;
    invalidityAccident1?: number | null;
    invalidityAccident2?: number | null;
    invalidityAccident3?: number | null;
    trafficDeathAccidentAmount?: number | null;
    trafficPermanentAccidentAmount?: number | null;
    trafficInjuryDamageAmount?: number | null;
    trafficAccidentDailyBenefit?: number | null;
    trafficHospitalAccidentAmount?: number | null;
    trafficWorkIncapacityAmount?: number | null;
    trafficInvalidityAmount?: number | null;
    loanDeathAmount?: number | null;
    loanInvalidityType?: string | null;
    loanInvalidity1?: number | null;
    loanInvalidity2?: number | null;
    loanInvalidity3?: number | null;
    loanIllnessAmount?: number | null;
    loanWorkIncapacityAmount?: number | null;
    addonMajakBasic?: boolean | null;
    addonMajakPlus?: boolean | null;
    addonLiabilityCitizen?: number | null;
    addonTravel?: boolean | null;
  } | null;
};

export type ToastMessage = {
  id: number;
  type: "success" | "error";
  message: string;
};

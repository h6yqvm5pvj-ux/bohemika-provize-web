import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
  type MaxCizinKomplexVariant,
} from "../../types/domain";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type ContractDoc = {
  id: string;
  note?: string | null;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
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

  commissionMode?: CommissionMode | null;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;

  policyStartDate?: FirestoreTimestamp | Date | string | null;
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
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonOwnDamage?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
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
    criticalIllnessAmount?: number | null;
    childSurgeryAmount?: number | null;
    vaccinationCompAmount?: number | null;
    diabetesAmount?: number | null;
    deathAccidentAmount?: number | null;
    injuryPermanentAmount?: number | null;
    hospitalizationAmount?: number | null;
    hospitalizationIllnessAmount?: number | null;
    hospitalizationInjuryAmount?: number | null;
    workIncapacityStart?: string | null;
    workIncapacityBackpay?: string | null;
    workIncapacityAmount?: number | null;
    workIncapacityInjury?: boolean | null;
    workIncapacityIllness?: boolean | null;
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

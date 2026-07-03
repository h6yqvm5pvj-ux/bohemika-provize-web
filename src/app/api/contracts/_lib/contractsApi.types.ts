import type {
  CommissionMode,
  CommissionResultItemDTO,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";
import type { ProductInstitutionId } from "@/app/lib/productCatalog";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

export type ContractDoc = {
  id?: string;
  contractPdfAttachment?: {
    kind?: "contractPdf" | string;
    hasFile?: boolean;
    bucketName?: string | null;
    storagePath?: string | null;
    originalName?: string | null;
    contentType?: "application/pdf" | string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
    uploadedAtMs?: number | null;
    uploadedBy?: string | null;
  } | null;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  refreshCommissionBase?: {
    productKey?: Product | null;
    method?: "cpp_neon_5y_storno" | string | null;
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
    stornedOriginalMonthlyPremium?: number | null;
    stornedOriginalAnnualPremium?: number | null;
    calculationMonthlyPremium?: number | null;
    calculationAnnualPremium?: number | null;
  } | null;
  refreshReplacedByEntryId?: string | null;
  refreshReplacedByOwnerEmail?: string | null;
  refreshReplacedBySignedDate?: FirestoreTimestamp | Date | string | number | null;
  note?: string | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: string | null;
  managerChain?: { email?: string | null; position?: Position | null; commissionMode?: string | null }[];
  managerOverrides?: {
    email?: string | null;
    position?: Position | null;
    commissionMode?: string | null;
    items?: CommissionResultItemDTO[] | null;
    total?: number | null;
  }[];
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  parentContractEntryPath?: string | null;

  productKey?: Product;
  position?: Position | null;
  inputAmount?: number;
  calculationInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
  premiumDecreaseAmount?: number | null;
  changeType?: "increase" | "decrease" | "same" | string | null;
  premiumUpdatedFromStatementAtMs?: number | null;
  premiumUpdatedFromStatementId?: string | null;
  comfortPayment?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
  items?: CommissionResultItemDTO[];
  total?: number;
  commissionPayouts?: {
    key?: string | null;
    code?: string | null;
    title?: string | null;
    amount?: number | null;
    expectedAmount?: number | null;
    difference?: number | null;
    status?: "paid" | "difference" | "storno" | string | null;
    statementId?: string | null;
    statementNumber?: string | null;
    statementPeriod?: string | null;
    statementDate?: string | null;
    payoutMonthKey?: string | null;
    writtenAtMs?: number | null;
    writtenBy?: string | null;
  }[] | null;
  premiumStatementHistory?: {
    key?: string | null;
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
    productCode?: string | null;
    commissionCode?: string | null;
    rowId?: string | null;
    validFrom?: string | null;
    source?: "own" | "manager" | string | null;
    writtenAtMs?: number | null;
    writtenBy?: string | null;
  }[] | null;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;
  duplicateLookupKey?: string | null;
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
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
  carOrv?: string | null;
  carAnnualMileage?: string | null;
  carAllianzScope?: string | null;
  carLiabilityLimit?: number | null;
  carAssistancePlan?: string | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
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
  carAddonGap?: boolean | null;
  carAddonGapLimit?: number | null;
  carAddonSmartGap?: boolean | null;
  carAddonServisPro?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonFireExplosion?: boolean | null;
  carAddonLegalAdvice?: boolean | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
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
    criticalIllnessVariant?: string | null;
    criticalIllnessAmount?: number | null;
    childSurgeryAmount?: number | null;
    vaccinationCompAmount?: number | null;
    accidentDailyBenefitStart?: string | null;
    accidentDailyBenefitBackpay?: string | null;
    accidentDailyBenefit?: number | null;
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
    neonPdfRisks?: string | number | boolean | null;
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

  createdAt?: FirestoreTimestamp | Date | string | number | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | number | null;
  policyStartDate?: FirestoreTimestamp | Date | string | number | null;
  policyEndDate?: FirestoreTimestamp | Date | string | number | null;
};

export type ContractLifePremiumChange = {
  id: string;
  entryType: "contract" | "endorsement" | string | null;
  step: number;
  premiumAmount: number;
  annualPremium: number;
  previousPremium: number | null;
  previousAnnualPremium: number | null;
  premiumDelta: number | null;
  annualPremiumDelta: number | null;
  policyStartDate: number | string | null;
  contractSignedDate: number | string | null;
  createdAt: number | string | null;
};

export type TipPayoutDoc = {
  sourceKey: string;
  sourceOwnerEmail: string;
  sourceOwnerName?: string | null;
  sourceEntryId: string;
  sourceEntryType: "contract" | "endorsement";
  adviserEmail: string;
  tipsterEmail: string;
  tipsterUserDocId: string;
  tipsterName?: string | null;
  clientName?: string | null;
  tipsterPercent: number;
  productKey: Product | null;
  frequencyRaw: PaymentFrequency | null;
  payoutDate: Date;
  amount: number;
  note: string;
  sourceStatus: "active" | "storno";
  sourceStornoDate?: Date | null;
  sourcePaid: boolean;
  sourceContractSignedDate?: Date | null;
  sourcePolicyStartDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContractResponseItem = ContractDoc & {
  id: string;
  adviserEmail: string | null;
  adviserName?: string | null;
  lifePremiumChanges?: ContractLifePremiumChange[] | null;
};

export type ContractOwnerMeta = {
  position: Position | null;
  managerEmail: string | null;
  managerPosition: Position | null;
  currentChainEmails: string[];
};

export type ContractDetailResponse = {
  ok: true;
  mode: "detail";
  position: Position | null;
  hasTeam: boolean;
  teamEmails: string[];
  contract: ContractResponseItem;
  timeline: ContractResponseItem[];
  ownerMeta: ContractOwnerMeta;
};

export type ContractsResponse = {
  ok: true;
  scope: "my" | "team";
  position: Position | null;
  hasTeam: boolean;
  teamEmails: string[];
  contracts: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
  teamContracts?: ContractResponseItem[];
  teamHasMore?: boolean;
  teamNextCursor?: number | null;
  teamNextCursorToken?: string | null;
};

export type ContractsFindResponse = {
  ok: true;
  scope: "my" | "team";
  query: string;
  contracts: ContractResponseItem[];
};

export type ContractsPrecheckEntry = {
  id: string;
  contractNumber: string | null;
  ownerEmail: string;
};

export type ContractsPrecheckResponse = {
  ok: true;
  productKey: Product | null;
  clientName: string | null;
  signedDate: string | null;
  similarContracts: ContractsPrecheckEntry[];
};

export type ErrorResponse = { ok: false; error: string };

export type ContractListFilterMode = "latest" | "anniversary";
export type ContractListResponseShape = "full" | "home" | "clientNames";
export type ContractListProductCategory =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "comfort"
  | "liability";

export type ContractListFilters = {
  query: string;
  mode: ContractListFilterMode;
  unpaidOnly: boolean;
  refreshOnly: boolean;
  categories: Set<ContractListProductCategory>;
  institutions: Set<ProductInstitutionId>;
  signedFrom: Date | null;
};

export type UserNode = {
  email: string;
  name: string | null;
  managerEmail: string | null;
  position: Position | null;
  accountType: "advisor" | "tipster";
};

export type UserTreeResult = {
  users: UserNode[];
  childrenByManager: Map<string, UserNode[]>;
};

export type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

export type UserProfileSnapshot = {
  docId: string;
  email: string;
  name: string | null;
  userId: string | null;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
  positionTimeline: unknown;
};

export type SubscriptionStatus = "active" | "expired" | "unpaid" | "none";

export type AuthContextOptions = {
  requireKnownUser?: boolean;
  requireActiveSubscription?: boolean;
};

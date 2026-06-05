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
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  note?: string | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: string | null;
  managerChain?: { email?: string | null; position?: Position | null; commissionMode?: string | null }[];
  managerOverrides?: { email?: string | null; position?: Position | null; commissionMode?: string | null; items?: any[]; total?: number | null }[];
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  parentContractEntryPath?: string | null;

  productKey?: Product;
  position?: Position | null;
  inputAmount?: number;
  comfortPayment?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
  items?: CommissionResultItemDTO[];
  total?: number;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;
  duplicateLookupKey?: string | null;
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

  createdAt?: FirestoreTimestamp | Date | string | number | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | number | null;
  policyStartDate?: FirestoreTimestamp | Date | string | number | null;
  policyEndDate?: FirestoreTimestamp | Date | string | number | null;
};

export type TipPayoutDoc = {
  sourceKey: string;
  sourceOwnerEmail: string;
  sourceEntryId: string;
  sourceEntryType: "contract" | "endorsement";
  adviserEmail: string;
  tipsterEmail: string;
  tipsterUserDocId: string;
  tipsterName?: string | null;
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
export type ContractListResponseShape = "full" | "home";
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
  categories: Set<ContractListProductCategory>;
  institutions: Set<ProductInstitutionId>;
  signedFrom: Date | null;
};

export type UserNode = {
  email: string;
  managerEmail: string | null;
  position: Position | null;
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

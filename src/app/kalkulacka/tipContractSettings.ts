export type UserAccountType = "advisor" | "tipster";
export type TipLifecycleStatus = "pending" | "contracted" | "failed";

export const TIP_CONTRACT_PERCENT_OPTIONS = Array.from(
  { length: 19 },
  (_, idx) => (idx + 1) * 5
);

export const TIP_CONTRACT_STATUS_LABELS: Record<TipLifecycleStatus, string> = {
  pending: "Čeká na zpracování",
  contracted: "Sjednáno",
  failed: "Obchod neproběhl",
};

export const TIP_CONTRACT_TIPS_FILTER_OPTIONS = [
  { key: "all", label: "Všechny" },
  { key: "new", label: "Nové" },
  { key: "contracted", label: "Sjednané" },
] as const;

export const ACCOUNT_TYPE_LABELS: Record<UserAccountType, string> = {
  advisor: "Vázaný zástupce",
  tipster: "Tipař",
};

export type TipContractTipsFilter =
  (typeof TIP_CONTRACT_TIPS_FILTER_OPTIONS)[number]["key"];

export type TipContractUserOption = {
  email: string;
  name: string;
  managerEmail: string | null;
  accountType: UserAccountType;
};

export type UserSearchApiResponse = {
  ok?: boolean;
  users?: TipContractUserOption[];
  error?: string;
};

export type TipsterLookupApiResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
  accountType?: UserAccountType | null;
  error?: string;
};

export type TipsterLookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; email: string; name: string | null; accountType: UserAccountType }
  | { status: "notFound" }
  | { status: "error"; message: string };

export type TipContractTipOption = {
  id: string;
  title: string;
  product: string;
  productLabel: string;
  status: TipLifecycleStatus;
  tipsterEmail: string;
  tipsterName: string;
  clientName: string;
  phone: string;
  email: string;
  createdAtMs: number | null;
};

export type AdvisorTipsByUserApiResponse = {
  ok?: boolean;
  items?: TipContractTipOption[];
  error?: string;
};

export type TipContractConfig = {
  tipsterEmail: string | null;
  tipsterName: string | null;
  tipsterAccountType: UserAccountType | null;
  tipsterPercent: number;
  sourceTipId: string | null;
  sourceTipTitle: string | null;
  sourceTipProductLabel: string | null;
  sourceTipClientName: string | null;
  sourceTipCreatedAtMs: number | null;
};

export const formatTipCreatedAt = (createdAtMs: number | null): string => {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return "Datum neuvedeno";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(createdAtMs));
  } catch {
    return "Datum neuvedeno";
  }
};

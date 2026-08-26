import {
  type PaymentFrequency,
  type Product,
} from "@/app/types/domain";
import {
  AUTO_PRODUCTS,
  COMFORT_PRODUCTS,
  LIFE_PRODUCTS,
  LIABILITY_PRODUCTS,
  PROPERTY_PRODUCTS,
  TRAVEL_PRODUCTS,
  productLabel,
} from "@/app/lib/productCatalog";

export type ContractActivityNotificationKind =
  | "new_contract"
  | "contract_increase";

type ContractActivityInput = {
  entryType: "contract" | "endorsement";
  productKey: Product | null | undefined;
  inputAmount: number;
  frequencyRaw: PaymentFrequency | null | undefined;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
};

export type ContractActivityNotificationContent = {
  kind: ContractActivityNotificationKind;
  mailboxTitle: string;
  message: string;
  premiumIncreaseAmount: number | null;
};

const finiteNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const resolveEndorsementPremiumIncrease = ({
  premiumDelta,
  premiumIncreaseAmount,
  previousInputAmount,
  newInputAmount,
}: Pick<
  ContractActivityInput,
  | "premiumDelta"
  | "premiumIncreaseAmount"
  | "previousInputAmount"
  | "newInputAmount"
>): number | null => {
  const explicitIncrease = finiteNumber(premiumIncreaseAmount);
  if (explicitIncrease != null && explicitIncrease > 0) {
    return explicitIncrease;
  }

  const explicitDelta = finiteNumber(premiumDelta);
  if (explicitDelta != null && explicitDelta > 0) {
    return explicitDelta;
  }

  const previous = finiteNumber(previousInputAmount);
  const next = finiteNumber(newInputAmount);
  if (previous == null || next == null) return null;

  const derivedIncrease = next - previous;
  return derivedIncrease > 0 ? derivedIncrease : null;
};

export const resolveContractActivityNotificationKind = (
  input: ContractActivityInput
): ContractActivityNotificationKind | null => {
  if (input.entryType === "contract") return "new_contract";
  return resolveEndorsementPremiumIncrease(input) != null
    ? "contract_increase"
    : null;
};

const paymentsPerYear = (frequency: PaymentFrequency): number =>
  frequency === "monthly"
    ? 12
    : frequency === "quarterly"
      ? 4
      : frequency === "semiannual"
        ? 2
        : 1;

const normalizedFrequency = (
  value: PaymentFrequency | null | undefined
): PaymentFrequency =>
  value === "monthly" ||
  value === "quarterly" ||
  value === "semiannual" ||
  value === "annual"
    ? value
    : "annual";

const thematicEmojiForProduct = (productKey: Product | null | undefined): string => {
  if (!productKey) return "📄";
  if (AUTO_PRODUCTS.includes(productKey)) return "🚗";
  if (TRAVEL_PRODUCTS.includes(productKey)) return "✈️";
  if (COMFORT_PRODUCTS.includes(productKey)) return "⚡";
  if (LIABILITY_PRODUCTS.includes(productKey)) return "🛡️";
  if (PROPERTY_PRODUCTS.includes(productKey)) return "🏠";
  if (LIFE_PRODUCTS.includes(productKey)) return "❤️";
  return "📄";
};

const formatPremium = (value: number): string =>
  `${new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} Kč`;

export const buildContractActivityNotificationContent = ({
  ownerDisplayName,
  ...input
}: ContractActivityInput & {
  ownerDisplayName: string;
}): ContractActivityNotificationContent | null => {
  const kind = resolveContractActivityNotificationKind(input);
  if (!kind) return null;

  const frequency = normalizedFrequency(input.frequencyRaw);
  const isLifeProduct = Boolean(
    input.productKey && LIFE_PRODUCTS.includes(input.productKey)
  );
  const productName = productLabel(
    input.productKey,
    "Neznámý produkt"
  ).toLocaleUpperCase("cs-CZ");
  const thematicEmoji = thematicEmojiForProduct(input.productKey);

  if (kind === "contract_increase") {
    const increase = resolveEndorsementPremiumIncrease(input);
    if (increase == null) return null;
    const annualIncrease = increase * paymentsPerYear(frequency);
    const displayIncrease = isLifeProduct ? annualIncrease / 12 : annualIncrease;
    const cadence = isLifeProduct ? "měsíčně" : "ročně";

    return {
      kind,
      mailboxTitle: "Navýšení smlouvy v týmu",
      message: `📈 ${ownerDisplayName} navýšil pojistné o ${formatPremium(displayIncrease)} ${cadence} – ${productName} ${thematicEmoji}`,
      premiumIncreaseAmount: increase,
    };
  }

  const safeInputAmount = Number.isFinite(input.inputAmount)
    ? Math.max(0, input.inputAmount)
    : 0;
  const annualPremium = safeInputAmount * paymentsPerYear(frequency);
  const displayPremium = isLifeProduct ? annualPremium / 12 : annualPremium;

  return {
    kind,
    mailboxTitle: "Nová smlouva v týmu",
    message: `🎉 ${ownerDisplayName} sepsal právě ${productName} za ${formatPremium(displayPremium)} ${thematicEmoji}`,
    premiumIncreaseAmount: null,
  };
};

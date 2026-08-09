import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { User } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { LIFE_PRODUCTS } from "@/app/lib/productCatalog";
import type {
  CommissionMode,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";

import type { ContractsFindApiResponse } from "./calculatorApi";
import {
  normalizeEmailValue,
  normalizedDurationMonths,
  normalizedDurationYears,
  parseNumber,
  productLabel,
  shouldShowDuration,
  shouldShowDurationMonths,
  toNonNegativeNumber,
  type EndorsementDraft,
  type EndorsementSourceEntry,
} from "./calculatorHelpers";
import {
  buildEndorsementSourceEntries,
  prepareEndorsementDraft,
} from "./endorsementCalculation";

export type PrepareEndorsementOptions = {
  productOverride?: Product;
  contractNumberOverride?: string | null;
  contractSignedDateOverride?: string | null;
  newPremiumAmountOverride?: number | null;
  source?: "manual" | "pdf";
};

type UseEndorsementPreparationParams = {
  user: User | null;
  hasSelectedProduct: boolean;
  product: Product;
  effectiveSaveOwnerEmail: string | null;
  tipsterModeEnabled: boolean;
  contractNumber: string;
  contractSignedDate: string;
  policyStartDate: string;
  amountText: string;
  durationYears: number | null;
  durationMonths: number | null;
  endorsementDurationManualOverride: boolean;
  mode: CommissionMode;
  frequency: PaymentFrequency;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPaymentText: string;
  comfortGradual: boolean;
  comfortTargetAmountText: string;
  isSavingForSubordinate: boolean;
  resolveEndorsementPositionForSignedDate: (signedDateIso: string) => Position | null;
  setEndorsementWorkflowActive: Dispatch<SetStateAction<boolean>>;
  setEndorsementPreviewSource: Dispatch<SetStateAction<EndorsementSourceEntry | null>>;
  setEndorsementDraft: Dispatch<SetStateAction<EndorsementDraft | null>>;
  setEndorsementDraftModalOpen: Dispatch<SetStateAction<boolean>>;
  setDurationYears: Dispatch<SetStateAction<number | null>>;
  setDurationMonths: Dispatch<SetStateAction<number | null>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  setSaveMessage: Dispatch<SetStateAction<string | null>>;
  setMissingFields: Dispatch<SetStateAction<string[]>>;
};

/** Keeps the network/UI workflow for preparing a contract endorsement out of the page. */
export const useEndorsementPreparation = ({
  user,
  hasSelectedProduct,
  product,
  effectiveSaveOwnerEmail,
  tipsterModeEnabled,
  contractNumber,
  contractSignedDate,
  policyStartDate,
  amountText,
  durationYears,
  durationMonths,
  endorsementDurationManualOverride,
  mode,
  frequency,
  maxCizinKomplexVariant,
  comfortPaymentText,
  comfortGradual,
  comfortTargetAmountText,
  isSavingForSubordinate,
  resolveEndorsementPositionForSignedDate,
  setEndorsementWorkflowActive,
  setEndorsementPreviewSource,
  setEndorsementDraft,
  setEndorsementDraftModalOpen,
  setDurationYears,
  setDurationMonths,
  setValidationError,
  setSaveMessage,
  setMissingFields,
}: UseEndorsementPreparationParams) =>
  useCallback(
    async (options: PrepareEndorsementOptions = {}): Promise<boolean> => {
      if (!user) {
        setValidationError("Nejdřív se prosím přihlas.");
        return false;
      }
      const targetProduct = options.productOverride ?? (hasSelectedProduct ? product : null);
      const targetOwnerEmail = effectiveSaveOwnerEmail || normalizeEmailValue(user.email);
      if (!targetOwnerEmail) {
        setValidationError("Chybí cílový vlastník smlouvy.");
        return false;
      }

      if (tipsterModeEnabled) {
        setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
        return false;
      }

      if (!targetProduct) {
        setValidationError("Nejdřív vyber produkt.");
        return false;
      }

      if (!LIFE_PRODUCTS.includes(targetProduct)) {
        setValidationError("Změnu zatím umíme jen pro ŽP produkty.");
        return false;
      }

      const trimmedContractNumber = (
        options.contractNumberOverride ?? contractNumber
      ).trim();
      const signedDateIso = (
        options.contractSignedDateOverride ?? contractSignedDate
      ).trim();
      const endorsementPolicyStartDateIso = policyStartDate.trim();
      const newPremiumAmount =
        options.newPremiumAmountOverride == null
          ? parseNumber(amountText)
          : toNonNegativeNumber(options.newPremiumAmountOverride);

      const missing: string[] = [];
      if (!trimmedContractNumber) missing.push("číslo smlouvy");
      if (!signedDateIso) missing.push("datum sjednání");
      if (!endorsementPolicyStartDateIso) missing.push("datum počátku");
      if (newPremiumAmount <= 0) missing.push("částku");
      if (
        targetProduct === "maximaMaxEfekt" &&
        durationYears == null &&
        endorsementDurationManualOverride
      ) {
        missing.push("dobu trvání smlouvy");
      }

      if (missing.length > 0) {
        const msg = `Pro změnu doplň: ${missing.join(", ")}.`;
        setSaveMessage(msg);
        setValidationError(msg);
        setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
        return false;
      }

      setEndorsementWorkflowActive(true);
      const positionForEndorsement = resolveEndorsementPositionForSignedDate(signedDateIso);
      if (!positionForEndorsement) return false;

      try {
        const params = new URLSearchParams({
          scope: isSavingForSubordinate ? "team" : "my",
          q: trimmedContractNumber,
        });
        const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
          user,
          `/api/contracts/find?${params.toString()}`,
          { method: "GET" }
        );
        const contracts = (Array.isArray(payload?.contracts) ? payload.contracts : []).filter(
          (entry) =>
            (normalizeEmailValue(entry.userEmail) ||
              normalizeEmailValue(entry.adviserEmail)) === targetOwnerEmail
        );

        if (contracts.length === 0) {
          setValidationError(
            `Smlouvu č. ${trimmedContractNumber} jsem u vybraného poradce nenašel. Nejdřív musí být uložená jako původní smlouva.`
          );
          return false;
        }

        const productMatches = buildEndorsementSourceEntries(contracts, targetProduct);
        if (productMatches.length === 0) {
          setValidationError(
            `Pro smlouvu č. ${trimmedContractNumber} není uložený produkt ${productLabel(targetProduct)}.`
          );
          return false;
        }

        const latestEntry = productMatches[0];
        setEndorsementPreviewSource(latestEntry);
        const prepared = prepareEndorsementDraft({
          source: latestEntry,
          targetProduct,
          contractNumber: trimmedContractNumber,
          contractSignedDateIso: signedDateIso,
          policyStartDateIso: endorsementPolicyStartDateIso,
          newPremiumAmount,
          position: positionForEndorsement,
          commissionMode: mode,
          durationYears,
          durationMonths,
          durationManualOverride: endorsementDurationManualOverride,
          frequency,
          maxCizinKomplexVariant,
          comfortPayment: parseNumber(comfortPaymentText),
          comfortGradual,
          comfortTargetAmount: parseNumber(comfortTargetAmountText),
        });

        if (prepared.sourceDurationYears != null && shouldShowDuration(targetProduct)) {
          setDurationYears(normalizedDurationYears(targetProduct, prepared.sourceDurationYears));
        }
        if (prepared.sourceDurationMonths != null && shouldShowDurationMonths(targetProduct)) {
          setDurationMonths(
            normalizedDurationMonths(targetProduct, prepared.sourceDurationMonths)
          );
        }

        if (!prepared.ok) {
          setValidationError(prepared.message);
          if (prepared.showSaveMessage) {
            setSaveMessage(prepared.message);
          }
          return false;
        }

        setEndorsementDraft(prepared.draft);
        setValidationError(null);
        setSaveMessage("Změna je připravená. Uloží se až po kliknutí na Uložit jako sepsáno.");
        setEndorsementDraftModalOpen(targetProduct !== "neon");
        return true;
      } catch (error) {
        console.error("Chyba při přípravě dodatku", error);
        setValidationError("Nepodařilo se připravit změnu smlouvy. Zkus to prosím znovu.");
        return false;
      }
    },
    [
      amountText,
      comfortGradual,
      comfortPaymentText,
      comfortTargetAmountText,
      contractNumber,
      contractSignedDate,
      durationMonths,
      durationYears,
      effectiveSaveOwnerEmail,
      endorsementDurationManualOverride,
      frequency,
      hasSelectedProduct,
      isSavingForSubordinate,
      maxCizinKomplexVariant,
      mode,
      policyStartDate,
      product,
      resolveEndorsementPositionForSignedDate,
      setDurationMonths,
      setDurationYears,
      setEndorsementDraft,
      setEndorsementDraftModalOpen,
      setEndorsementPreviewSource,
      setEndorsementWorkflowActive,
      setMissingFields,
      setSaveMessage,
      setValidationError,
      tipsterModeEnabled,
      user,
    ]
  );

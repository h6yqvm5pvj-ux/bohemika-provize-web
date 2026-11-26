import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { User } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { withDefaultAdminImpersonationHeader } from "@/app/lib/adminImpersonation";
import { LIFE_PRODUCTS } from "@/app/lib/productCatalog";
import type {
  CommissionMode,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";

import { findContractByNumber, type ContractsFindApiResponse } from "./calculatorApi";
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
  signal?: AbortSignal;
  productOverride?: Product;
  contractNumberOverride?: string | null;
  contractSignedDateOverride?: string | null;
  policyStartDateOverride?: string | null;
  frequencyOverride?: PaymentFrequency;
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
  isSavingForSubordinate: boolean;
  resolveEndorsementPositionForSignedDate: (signedDateIso: string) => Position | null;
  setEndorsementWorkflowActive: Dispatch<SetStateAction<boolean>>;
  setEndorsementPreviewSource: Dispatch<SetStateAction<EndorsementSourceEntry | null>>;
  setEndorsementDraft: Dispatch<SetStateAction<EndorsementDraft | null>>;
  setEndorsementDraftModalOpen: Dispatch<SetStateAction<boolean>>;
  setDurationYears: Dispatch<SetStateAction<number | null>>;
  setDurationMonths: Dispatch<SetStateAction<number | null>>;
  setClientName: Dispatch<SetStateAction<string>>;
  useLiveNeonClientName?: boolean;
  impersonatedUserEmail?: string;
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
  isSavingForSubordinate,
  resolveEndorsementPositionForSignedDate,
  setEndorsementWorkflowActive,
  setEndorsementPreviewSource,
  setEndorsementDraft,
  setEndorsementDraftModalOpen,
  setDurationYears,
  setDurationMonths,
  setClientName,
  useLiveNeonClientName = false,
  impersonatedUserEmail,
  setValidationError,
  setSaveMessage,
  setMissingFields,
}: UseEndorsementPreparationParams) =>
  useCallback(
    async (options: PrepareEndorsementOptions = {}): Promise<boolean> => {
      if (options.signal?.aborted) return false;
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
      const endorsementPolicyStartDateIso = (options.policyStartDateOverride ?? policyStartDate).trim();
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
        const scope = isSavingForSubordinate ? "team" : "my";
        const useLiveClientName = targetProduct === "neon" && options.source !== "pdf" && useLiveNeonClientName;
        const payload = useLiveClientName
          ? await findContractByNumber({ user, scope, contractNumber: trimmedContractNumber, signal: options.signal,
            headers: withDefaultAdminImpersonationHeader(undefined, impersonatedUserEmail ?? "") })
          : await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(user,
            `/api/contracts/find?${new URLSearchParams({ scope, q: trimmedContractNumber })}`, { signal: options.signal });
        if (options.signal?.aborted) return false;
        const contracts = (Array.isArray(payload?.contracts) ? payload.contracts : []).filter(
          (entry) =>
            (normalizeEmailValue(entry.userEmail) ||
              normalizeEmailValue(entry.adviserEmail)) === targetOwnerEmail &&
            typeof entry.contractNumber === "string" &&
            entry.contractNumber.replace(/\s+/g, "") === trimmedContractNumber.replace(/\s+/g, "")
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
          frequency: options.frequencyOverride ?? frequency,
          maxCizinKomplexVariant,
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
        const original = contracts.find(entry => entry.id === latestEntry.id && entry.productKey === targetProduct);
        if (original?.clientName?.trim() && !useLiveClientName) {
          setClientName(original.clientName.trim());
        }
        setValidationError(null);
        setSaveMessage("Změna je připravená. Uloží se až po kliknutí na Uložit jako sepsáno.");
        setEndorsementDraftModalOpen(targetProduct !== "neon" && targetProduct !== "flexi");
        return true;
      } catch {
        if (options.signal?.aborted) return false;
        console.error("Chyba při přípravě dodatku.");
        setValidationError("Nepodařilo se připravit změnu smlouvy. Zkus to prosím znovu.");
        return false;
      }
    },
    [
      amountText,
      contractNumber,
      contractSignedDate,
      durationMonths,
      durationYears,
      effectiveSaveOwnerEmail,
      endorsementDurationManualOverride,
      frequency,
      hasSelectedProduct,
      impersonatedUserEmail,
      isSavingForSubordinate,
      maxCizinKomplexVariant,
      mode,
      policyStartDate,
      product,
      resolveEndorsementPositionForSignedDate,
      setDurationMonths,
      setClientName,
      setDurationYears,
      setEndorsementDraft,
      setEndorsementDraftModalOpen,
      setEndorsementPreviewSource,
      setEndorsementWorkflowActive,
      setMissingFields,
      setSaveMessage,
      setValidationError,
      tipsterModeEnabled,
      useLiveNeonClientName,
      user,
    ]
  );

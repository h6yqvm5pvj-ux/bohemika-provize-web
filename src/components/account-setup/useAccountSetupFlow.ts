// src/components/account-setup/useAccountSetupFlow.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  FactorId,
  multiFactor,
  reauthenticateWithCredential,
  TotpMultiFactorGenerator,
  type TotpSecret,
  type User as FirebaseUser,
} from "firebase/auth";

import { auth } from "@/app/firebase-auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { confirmEmailForMfaEnrollment } from "@/app/lib/mfaEmailVerification";
import * as userProfileCache from "@/app/lib/userProfileCache";
import { getNextCareerTimelineStart } from "@/app/lib/careerTimeline";
import type { Position } from "@/app/types/domain";
import { useAresIcoLookup } from "@/components/profile/useAresIcoLookup";
import { formatProfilePhoneInput, isValidProfilePhone } from "@/lib/profileFields";

export type AccountType = "advisor" | "tipster";
export type AccountSetupStepId = "phone" | "career" | "security";

export type AccountSetupTimelineItem = {
  id: string;
  position: Position | "";
  validFrom: string;
  validTo: string;
};

type SubscriptionAccessStateForSetup = "none" | "active" | "grace" | "blocked";

type UseAccountSetupFlowOptions = {
  user: FirebaseUser | null;
  loadingProfile: boolean;
  accountType: AccountType;
  subscriptionAccessState: SubscriptionAccessStateForSetup;
  formatIsoDayLabel: (value: string | null) => string;
  onInternalProfileReady: () => void;
};

export const ACCOUNT_SETUP_POSITIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

export const PHONE_NUMBER_MAX_LEN = 40;
export const PROFILE_ICO_MAX_LEN = 8;
export const PROFILE_FULL_NAME_MAX_LEN = 120;
export const AGENCY_NUMBER_MAX_LEN = 80;
export const ACCOUNT_SETUP_STEPS: { id: AccountSetupStepId; label: string }[] = [
  { id: "phone", label: "Profil" },
  { id: "career", label: "Kariéra" },
  { id: "security", label: "2FA" },
];

const POSITION_SET = new Set<Position>(ACCOUNT_SETUP_POSITIONS.map((item) => item.id));
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MFA_ISSUER = "Bohemka.App";
const MFA_FACTOR_LABEL = "Microsoft Authenticator";
const MFA_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const PHONE_STEP_INDEX = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "phone");
const CAREER_STEP_INDEX = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "career");
const SECURITY_STEP_INDEX = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "security");

const createTimelineRowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
};

export const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

const parsePositionTimeline = (value: unknown): AccountSetupTimelineItem[] => {
  if (!Array.isArray(value)) return [];
  const rows: AccountSetupTimelineItem[] = [];

  value.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const position = row.position as Position;
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || "";

    if (!POSITION_SET.has(position)) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : createTimelineRowId(),
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo || "9999-12-31";
    const bTo = b.validTo || "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

const normalizeIsoDateTime = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseIsoDateTimeMs = (value: string | null): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const resolveAccountSetupMfaErrorMessage = (error: unknown, fallback: string): string => {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    code === "auth/wrong-password" ||
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials"
  ) {
    return "Aktuální heslo není správné.";
  }
  if (code === "auth/invalid-verification-code") {
    return "Neplatný 2FA kód. Zadej aktuální kód z aplikace.";
  }
  if (code === "auth/code-expired") {
    return "2FA kód vypršel. Zadej nový aktuální kód.";
  }
  if (code === "auth/requires-recent-login") {
    return "Pro tuto změnu je potřeba znovu ověřit heslo.";
  }
  if (code === "auth/unverified-email") {
    return "E-mail se nepodařilo automaticky potvrdit pro zapnutí 2FA. Zadej heslo znovu a spusť 2FA ještě jednou.";
  }
  if (code === "auth/user-not-found") {
    return "Účet s tímto e-mailem neexistuje ve Firebase Authentication.";
  }
  if (code === "auth/invalid-email") {
    return "Účet nemá platný e-mail.";
  }
  if (code === "auth/too-many-requests") {
    return "Příliš mnoho pokusů. Zkus to prosím později.";
  }
  if (code === "auth/network-request-failed") {
    return "Síťová chyba. Zkontroluj připojení a zkus to znovu.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase nemá zapnutou potřebnou metodu. Zkontroluj Authentication > Sign-in method a Multi-factor.";
  }
  if (code) {
    return `${fallback} Firebase vrátil chybu ${code}.`;
  }
  if (message) {
    return message;
  }
  return fallback;
};

export function useAccountSetupFlow({
  user,
  loadingProfile,
  accountType,
  subscriptionAccessState,
  formatIsoDayLabel,
  onInternalProfileReady,
}: UseAccountSetupFlowOptions) {
  const [needsCareerTimelineSetup, setNeedsCareerTimelineSetup] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [ico, setIco] = useState("");
  const [savedIco, setSavedIco] = useState("");
  const [fullName, setFullName] = useState("");
  const [agencyNumber, setAgencyNumber] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [timelineDraft, setTimelineDraft] = useState<AccountSetupTimelineItem[]>([]);
  const [timelineSaving, setTimelineSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mfaReady, setMfaReady] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaSecret, setMfaSecret] = useState<TotpSecret | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaQrDataUrl, setMfaQrDataUrl] = useState("");
  const [mfaQrLoading, setMfaQrLoading] = useState(false);
  const [mfaQrError, setMfaQrError] = useState<string | null>(null);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [mfaGraceStartedAt, setMfaGraceStartedAt] = useState<string | null>(null);
  const [, setSecurityHardRequired] = useState(false);
  const [, setWizardManuallyOpened] = useState(false);
  const aresIcoLookup = useAresIcoLookup({
    user,
    ico,
    enabled: showWizard && stepIndex === PHONE_STEP_INDEX,
  });

  const clearMfaDraft = useCallback(() => {
    setMfaSecret(null);
    setMfaCode("");
    setMfaQrDataUrl("");
    setMfaQrLoading(false);
    setMfaQrError(null);
  }, []);

  const resetAll = useCallback(() => {
    setNeedsCareerTimelineSetup(false);
    setShowWizard(false);
    setCompleted(false);
    setStepIndex(0);
    setPhone("");
    setSavedPhone("");
    setIco("");
    setSavedIco("");
    setFullName("");
    setAgencyNumber("");
    setTimelineDraft([]);
    setError(null);
    setInfo(null);
    setMfaReady(false);
    setMfaEnabled(false);
    setMfaPassword("");
    clearMfaDraft();
    setMfaSaving(false);
    setCompletionSaving(false);
    setCompletedAt(null);
    setMfaGraceStartedAt(null);
    setSecurityHardRequired(false);
    setWizardManuallyOpened(false);
  }, [clearMfaDraft]);

  const resetForMissingUser = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const resetAfterProfileLoadFailure = useCallback(() => {
    setNeedsCareerTimelineSetup(false);
    setSavedPhone("");
    setIco("");
    setSavedIco("");
    setFullName("");
    setAgencyNumber("");
    setCompletedAt(null);
    setMfaGraceStartedAt(null);
    setSecurityHardRequired(false);
    setWizardManuallyOpened(false);
  }, []);

  const syncFromProfileData = useCallback(
    (
      data: Record<string, unknown>,
      options: { accountType: AccountType; hasInternalProfile: boolean }
    ) => {
      const parsedTimeline = parsePositionTimeline(data.positionTimeline);
      const nextPhoneNumber = formatProfilePhoneInput(
        typeof data.phoneNumber === "string" ? data.phoneNumber : ""
      );
      const nextIco =
        typeof data.ico === "string"
          ? data.ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN)
          : "";
      const nextFullName =
        typeof data.fullName === "string" && data.fullName.trim()
          ? data.fullName.trim()
          : typeof data.name === "string"
            ? data.name.trim()
            : "";
      const nextAgencyNumber =
        typeof data.agencyNumber === "string" ? data.agencyNumber.trim() : "";
      const nextCompletedAt = normalizeIsoDateTime(data.accountSetupCompletedAt);
      const nextMfaGraceStartedAt = normalizeIsoDateTime(data.mfaSetupGraceStartedAt);
      const timelineRequired =
        options.accountType !== "tipster" &&
        (!options.hasInternalProfile || parsedTimeline.length === 0);

      setPhone(nextPhoneNumber);
      setSavedPhone(nextPhoneNumber);
      setIco(nextIco);
      setSavedIco(nextIco);
      setFullName(nextFullName);
      setAgencyNumber(nextAgencyNumber);
      setCompletedAt(nextCompletedAt);
      setMfaGraceStartedAt(nextMfaGraceStartedAt);
      setTimelineDraft(parsedTimeline);
      setSecurityHardRequired((prev) => prev || timelineRequired);
      setNeedsCareerTimelineSetup(timelineRequired);
    },
    []
  );

  const syncMfaState = useCallback(async (targetUser: FirebaseUser) => {
    await targetUser.reload();
    const activeUser = auth.currentUser ?? targetUser;
    const totpFactor =
      multiFactor(activeUser).enrolledFactors.find(
        (factor) => factor.factorId === FactorId.TOTP
      ) ?? null;
    setMfaEnabled(Boolean(totpFactor));
    return Boolean(totpFactor);
  }, []);

  useEffect(() => {
    if (!user) {
      resetAll();
      return;
    }

    let cancelled = false;
    setMfaReady(false);

    void syncMfaState(user)
      .catch((syncError) => {
        console.warn("Chyba při načítání stavu 2FA:", syncError);
        if (!cancelled) {
          setMfaEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMfaReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resetAll, syncMfaState, user]);

  useEffect(() => {
    if (!mfaSecret) {
      setMfaQrDataUrl("");
      setMfaQrLoading(false);
      setMfaQrError(null);
      return;
    }

    let cancelled = false;
    const accountName = user?.email?.trim().toLowerCase() || user?.email || "bohemika-user";
    const qrUri = mfaSecret.generateQrCodeUrl(accountName, MFA_ISSUER);
    setMfaQrLoading(true);
    setMfaQrError(null);

    void import("qrcode")
      .then((qrCodeModule) =>
        qrCodeModule.default.toDataURL(qrUri, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        })
      )
      .then((dataUrl) => {
        if (!cancelled) {
          setMfaQrDataUrl(dataUrl);
        }
      })
      .catch((qrError) => {
        console.error("Chyba při generování QR kódu pro onboarding 2FA:", qrError);
        if (!cancelled) {
          setMfaQrError("QR kód se nepodařilo vygenerovat.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMfaQrLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mfaSecret, user]);

  useEffect(() => {
    if (!user) return;
    if (loadingProfile || !mfaReady || subscriptionAccessState === "blocked") return;
    if (accountType === "tipster") {
      setShowWizard(false);
      return;
    }
    const mfaMissing = !mfaEnabled;
    const contactMissing = !savedPhone.trim() || !savedIco.trim();
    const setupRequired = contactMissing || needsCareerTimelineSetup || mfaMissing;

    if (!setupRequired) {
      if (!completed) {
        setShowWizard(false);
      }
      return;
    }
    setShowWizard(true);
  }, [
    accountType,
    completed,
    completedAt,
    loadingProfile,
    mfaEnabled,
    mfaGraceStartedAt,
    mfaReady,
    needsCareerTimelineSetup,
    savedIco,
    savedPhone,
    subscriptionAccessState,
    user,
  ]);

  useEffect(() => {
    if (!showWizard || timelineDraft.length > 0) return;
    setTimelineDraft([
      {
        id: createTimelineRowId(),
        position: "",
        validFrom: "",
        validTo: "",
      },
    ]);
  }, [showWizard, timelineDraft.length]);

  useEffect(() => {
    if (!showWizard || completed) return;

    if (!savedPhone.trim() || !savedIco.trim()) {
      setStepIndex(PHONE_STEP_INDEX);
      return;
    }
    if (needsCareerTimelineSetup) {
      setStepIndex(CAREER_STEP_INDEX);
      return;
    }
    if (!mfaEnabled) {
      setStepIndex(SECURITY_STEP_INDEX);
    }
  }, [
    completed,
    mfaEnabled,
    needsCareerTimelineSetup,
    savedIco,
    savedPhone,
    showWizard,
  ]);

  useEffect(() => {
    if (!completed) return;
    const timeoutId = window.setTimeout(() => {
      setShowWizard(false);
      setCompleted(false);
      setStepIndex(0);
      setError(null);
      setInfo(null);
      setWizardManuallyOpened(false);
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [completed]);

  const markCompleted = useCallback(async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }

    const nextCompletedAt = new Date().toISOString();
    setCompletionSaving(true);
    setError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ accountSetupCompletedAt: nextCompletedAt }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      onInternalProfileReady();
      setCompletedAt(nextCompletedAt);
      setWizardManuallyOpened(false);
      setCompleted(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
    } catch (saveError) {
      const message =
        saveError instanceof Error && saveError.message.trim().length > 0
          ? saveError.message.trim()
          : "Dokončení nastavení účtu se nepodařilo uložit.";
      setError(message);
    } finally {
      setCompletionSaving(false);
    }
  }, [onInternalProfileReady, user]);

  const savePhone = useCallback(async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }

    const nextPhoneNumber = formatProfilePhoneInput(phone);
    const nextIco = ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN);
    const nextFullName = fullName.trim();
    const nextAgencyNumber = agencyNumber.trim();
    if (!nextFullName) {
      setError("Vyplň jméno a příjmení.");
      return;
    }
    if (nextFullName.length > PROFILE_FULL_NAME_MAX_LEN) {
      setError(`Jméno a příjmení může mít maximálně ${PROFILE_FULL_NAME_MAX_LEN} znaků.`);
      return;
    }
    if (!nextPhoneNumber) {
      setError("Vyplň telefonní číslo.");
      return;
    }
    if (!isValidProfilePhone(nextPhoneNumber)) {
      setError("Telefonní číslo musí obsahovat alespoň 9 číslic.");
      return;
    }
    if (nextPhoneNumber.length > PHONE_NUMBER_MAX_LEN) {
      setError(`Telefonní číslo může mít maximálně ${PHONE_NUMBER_MAX_LEN} znaků.`);
      return;
    }
    if (!nextIco) {
      setError("Vyplň IČO.");
      return;
    }
    if (nextIco.length !== PROFILE_ICO_MAX_LEN) {
      setError(`IČO musí mít ${PROFILE_ICO_MAX_LEN} číslic.`);
      return;
    }
    if (nextAgencyNumber.length > AGENCY_NUMBER_MAX_LEN) {
      setError(`Agenturní číslo může mít maximálně ${AGENCY_NUMBER_MAX_LEN} znaků.`);
      return;
    }

    setPhoneSaving(true);
    setError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: nextFullName,
          agencyNumber: nextAgencyNumber,
          phoneNumber: nextPhoneNumber,
          ico: nextIco,
        }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      onInternalProfileReady();
      setPhone(nextPhoneNumber);
      setSavedPhone(nextPhoneNumber);
      setIco(nextIco);
      setSavedIco(nextIco);
      setFullName(nextFullName);
      setAgencyNumber(nextAgencyNumber);
      setStepIndex(CAREER_STEP_INDEX);
    } catch (saveError) {
      const message =
        saveError instanceof Error && saveError.message.trim().length > 0
          ? saveError.message.trim()
          : "Kontaktní údaje se nepodařilo uložit.";
      setError(message);
    } finally {
      setPhoneSaving(false);
    }
  }, [agencyNumber, fullName, ico, onInternalProfileReady, phone, user]);

  const addTimelineRow = useCallback(() => {
    setError(null);
    setTimelineDraft((prev) => [
      ...prev,
      {
        id: createTimelineRowId(),
        position: "",
        validFrom: getNextCareerTimelineStart(prev),
        validTo: "",
      },
    ]);
  }, []);

  const updateTimelineRow = useCallback(
    (rowId: string, patch: Partial<AccountSetupTimelineItem>) => {
      setError(null);
      setTimelineDraft((prev) =>
        prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const removeTimelineRow = useCallback((rowId: string) => {
    setError(null);
    setTimelineDraft((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      return next.length > 0
        ? next
        : [
            {
              id: createTimelineRowId(),
              position: "",
              validFrom: "",
              validTo: "",
            },
          ];
    });
  }, []);

  const buildTimelinePayload = useCallback(():
    | {
        ok: true;
        payload: Array<{
          id: string;
          position: Position;
          validFrom: string;
          validTo: string | null;
        }>;
      }
    | { ok: false; error: string } => {
    const normalized = timelineDraft
      .map((row) => ({
        ...row,
        validFrom: row.validFrom.trim(),
        validTo: row.validTo.trim(),
      }))
      .filter(
        (row) => row.position || row.validFrom.length > 0 || row.validTo.length > 0
      );

    if (normalized.length === 0) {
      return { ok: false, error: "Přidej aspoň jednu pozici do kariéry." };
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const row = normalized[i];
      const rowNo = i + 1;
      if (!POSITION_SET.has(row.position as Position)) {
        return { ok: false, error: `Řádek ${rowNo}: vyber platnou pozici.` };
      }
      if (!row.validFrom) {
        return { ok: false, error: `Řádek ${rowNo}: vyplň datum OD.` };
      }
      if (!isIsoDay(row.validFrom)) {
        return { ok: false, error: `Řádek ${rowNo}: datum OD musí být platné.` };
      }
      if (row.validTo && !isIsoDay(row.validTo)) {
        return { ok: false, error: `Řádek ${rowNo}: datum DO musí být platné.` };
      }
      if (hasInvalidRangeOrder(row.validFrom, row.validTo)) {
        return {
          ok: false,
          error: `Řádek ${rowNo}: datum DO nemůže být dřív než datum OD.`,
        };
      }
    }

    const sorted = [...normalized].sort((a, b) => {
      if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
      const aTo = a.validTo || "9999-12-31";
      const bTo = b.validTo || "9999-12-31";
      return aTo.localeCompare(bTo);
    });

    const openEndedIndexes = sorted
      .map((row, index) => (!row.validTo ? index : -1))
      .filter((index) => index >= 0);
    if (openEndedIndexes.length > 1) {
      return {
        ok: false,
        error: "Současnost (prázdné datum DO) může být jen u jedné poslední pozice.",
      };
    }
    if (openEndedIndexes.length === 1 && openEndedIndexes[0] !== sorted.length - 1) {
      return {
        ok: false,
        error: "Současnost (prázdné datum DO) je povolena jen u poslední aktuální pozice.",
      };
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      const prevTo = prev.validTo || "9999-12-31";
      if (prevTo > current.validFrom) {
        return {
          ok: false,
          error: `Rozsahy se překrývají mezi řádky ${i} a ${i + 1}. Uprav datum OD/DO.`,
        };
      }
    }

    return {
      ok: true,
      payload: sorted.map((row) => ({
        id: row.id,
        position: row.position as Position,
        validFrom: row.validFrom,
        validTo: row.validTo || null,
      })),
    };
  }, [timelineDraft]);

  const saveCareer = useCallback(async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }

    const timeline = buildTimelinePayload();
    if (!timeline.ok) {
      setError(timeline.error);
      return;
    }
    const nextIco = ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN);

    setTimelineSaving(true);
    setError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          phoneNumber: phone.trim(),
          ico: nextIco,
          positionTimeline: timeline.payload,
        }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      onInternalProfileReady();
      setIco(nextIco);
      setSavedIco(nextIco);
      setTimelineDraft(
        timeline.payload.map((row) => ({
          id: row.id,
          position: row.position,
          validFrom: row.validFrom,
          validTo: row.validTo ?? "",
        }))
      );
      setNeedsCareerTimelineSetup(false);
      if (mfaEnabled) {
        await markCompleted();
      } else {
        setStepIndex(SECURITY_STEP_INDEX);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
    } catch (saveError) {
      const message =
        saveError instanceof Error && saveError.message.trim().length > 0
          ? saveError.message.trim()
          : "Historii kariéry se nepodařilo uložit.";
      setError(message);
    } finally {
      setTimelineSaving(false);
    }
  }, [
    buildTimelinePayload,
    ico,
    markCompleted,
    mfaEnabled,
    onInternalProfileReady,
    phone,
    user,
  ]);

  const startMfaEnrollment = useCallback(async () => {
    if (!user) {
      setError("Nejsi přihlášený.");
      return;
    }

    const activeUserEmail = (auth.currentUser ?? user).email?.trim();
    if (!activeUserEmail) {
      setError("Pro nastavení 2FA musí mít účet e-mail.");
      return;
    }

    const currentPassword = mfaPassword;
    if (!currentPassword) {
      setError("Zadej aktuální heslo k účtu.");
      return;
    }

    setMfaSaving(true);
    setError(null);
    setInfo(null);
    try {
      await user.reload();
      const activeUser = auth.currentUser ?? user;
      const totpAlreadyEnabled = multiFactor(activeUser).enrolledFactors.some(
        (factor) => factor.factorId === FactorId.TOTP
      );
      if (totpAlreadyEnabled) {
        setMfaEnabled(true);
        clearMfaDraft();
        setMfaPassword("");
        await markCompleted();
        return;
      }

      const credential = EmailAuthProvider.credential(activeUserEmail, currentPassword);
      await reauthenticateWithCredential(activeUser, credential);
      if (!activeUser.emailVerified) {
        setInfo("Potvrzuji e-mail pro zapnutí 2FA.");
        await confirmEmailForMfaEnrollment(activeUser);
      }
      const enrollmentUser = auth.currentUser ?? activeUser;
      const session = await multiFactor(enrollmentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setMfaSecret(secret);
      setMfaCode("");
      setInfo(null);
    } catch (enrollmentError) {
      console.warn("[AccountSetupMFA] start enrollment failed", {
        code: (enrollmentError as { code?: string })?.code,
        message:
          enrollmentError instanceof Error
            ? enrollmentError.message
            : String(enrollmentError),
      });
      setError(
        resolveAccountSetupMfaErrorMessage(
          enrollmentError,
          "Nepodařilo se spustit nastavení 2FA."
        )
      );
    } finally {
      setMfaSaving(false);
    }
  }, [clearMfaDraft, markCompleted, mfaPassword, user]);

  const confirmMfaEnrollment = useCallback(async () => {
    if (!user || !mfaSecret) {
      setError("Nejprve spusť nastavení 2FA.");
      return;
    }

    const verificationCode = mfaCode.replace(/\D+/g, "").slice(0, 6);
    if (verificationCode.length !== 6) {
      setError("Zadej aktuální 6místný kód z aplikace.");
      return;
    }

    setMfaSaving(true);
    setError(null);
    try {
      const activeUser = auth.currentUser ?? user;
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        mfaSecret,
        verificationCode
      );
      await multiFactor(activeUser).enroll(assertion, MFA_FACTOR_LABEL);
      await syncMfaState(activeUser);
      setMfaPassword("");
      clearMfaDraft();
      await markCompleted();
    } catch (confirmationError) {
      console.warn("[AccountSetupMFA] confirm enrollment failed", {
        code: (confirmationError as { code?: string })?.code,
        message:
          confirmationError instanceof Error
            ? confirmationError.message
            : String(confirmationError),
      });
      setError(
        resolveAccountSetupMfaErrorMessage(
          confirmationError,
          "2FA se nepodařilo dokončit. Zkus to prosím znovu."
        )
      );
    } finally {
      setMfaSaving(false);
    }
  }, [clearMfaDraft, markCompleted, mfaCode, mfaSecret, syncMfaState, user]);

  const currentStep = ACCOUNT_SETUP_STEPS[stepIndex]?.id ?? "phone";
  const busy = phoneSaving || timelineSaving || mfaSaving || completionSaving;
  const isTipsterAccount = accountType === "tipster";
  const mfaGraceStartMs = parseIsoDateTimeMs(mfaGraceStartedAt);
  const mfaGraceDeadlineMs =
    mfaGraceStartMs == null ? null : mfaGraceStartMs + MFA_GRACE_PERIOD_MS;
  const mfaGraceEligible = false;
  const mfaGraceActive =
    mfaGraceEligible && mfaGraceDeadlineMs != null && Date.now() < mfaGraceDeadlineMs;
  const mfaGraceExpired =
    mfaGraceEligible && mfaGraceDeadlineMs != null && Date.now() >= mfaGraceDeadlineMs;
  const mfaHardRequired = !mfaEnabled;
  const contactMissing = !savedPhone.trim() || !savedIco.trim();
  const gateRequired = contactMissing || needsCareerTimelineSetup || mfaHardRequired;
  const mfaGraceRemainingDays =
    mfaGraceDeadlineMs == null
      ? 0
      : Math.max(1, Math.ceil((mfaGraceDeadlineMs - Date.now()) / (24 * 60 * 60 * 1000)));
  const mfaGraceDeadlineLabel =
    mfaGraceDeadlineMs == null
      ? ""
      : formatIsoDayLabel(new Date(mfaGraceDeadlineMs).toISOString().slice(0, 10));
  const timelineSetupGateActive =
    !!user &&
    !isTipsterAccount &&
    !loadingProfile &&
    mfaReady &&
    subscriptionAccessState !== "blocked" &&
    gateRequired;

  const handlePrimaryAction = useCallback(() => {
    if (currentStep === "phone") {
      void savePhone();
      return;
    }
    if (currentStep === "career") {
      void saveCareer();
      return;
    }
    if (mfaEnabled) {
      void markCompleted();
      return;
    }
    if (mfaSecret) {
      void confirmMfaEnrollment();
      return;
    }
    void startMfaEnrollment();
  }, [
    confirmMfaEnrollment,
    currentStep,
    markCompleted,
    mfaEnabled,
    mfaSecret,
    saveCareer,
    savePhone,
    startMfaEnrollment,
  ]);

  return useMemo(
    () => ({
      resetAll,
      resetForMissingUser,
      resetAfterProfileLoadFailure,
      syncFromProfileData,
      needsCareerTimelineSetup,
      timelineSetupGateActive,
      showWizard,
      showMfaGraceBanner: mfaGraceActive && !showWizard,
      steps: ACCOUNT_SETUP_STEPS,
      stepIndex,
      completed,
      currentStep,
      phone,
      phoneMaxLength: PHONE_NUMBER_MAX_LEN,
      phoneSaving,
      ico,
      icoMaxLength: PROFILE_ICO_MAX_LEN,
      fullName,
      fullNameMaxLength: PROFILE_FULL_NAME_MAX_LEN,
      agencyNumber,
      agencyNumberMaxLength: AGENCY_NUMBER_MAX_LEN,
      aresIcoLookup,
      timelineDraft,
      timelineSaving,
      positions: ACCOUNT_SETUP_POSITIONS,
      mfaGraceActive,
      mfaGraceExpired,
      mfaGraceRemainingDays,
      mfaGraceDeadlineLabel,
      mfaReady,
      mfaEnabled,
      mfaPassword,
      mfaSecretKey: mfaSecret?.secretKey ?? null,
      mfaQrLoading,
      mfaQrDataUrl,
      mfaQrError,
      mfaCode,
      mfaSaving,
      completionSaving,
      info,
      error,
      busy,
      hasInvalidRangeOrder,
      onPhoneChange: (value: string) => {
        setPhone(formatProfilePhoneInput(value));
        setError(null);
      },
      onIcoChange: (value: string) => {
        setIco(value);
        setError(null);
      },
      onFullNameChange: (value: string) => {
        setFullName(value);
        setError(null);
      },
      onAgencyNumberChange: (value: string) => {
        setAgencyNumber(value);
        setError(null);
      },
      onTimelineRowChange: updateTimelineRow,
      onRemoveTimelineRow: removeTimelineRow,
      onAddTimelineRow: addTimelineRow,
      onMfaPasswordChange: (value: string) => {
        setMfaPassword(value);
        setError(null);
        setInfo(null);
      },
      onMfaCodeChange: (value: string) => {
        setMfaCode(value.replace(/\D+/g, "").slice(0, 6));
        setError(null);
      },
      onDismissGrace: () => {
        setError(null);
        setWizardManuallyOpened(false);
        setShowWizard(false);
      },
      onBack: () => {
        setError(null);
        setStepIndex((prev) => Math.max(prev - 1, 0));
      },
      onPrimaryAction: handlePrimaryAction,
      openSecuritySetup: () => {
        setError(null);
        setStepIndex(SECURITY_STEP_INDEX);
        setWizardManuallyOpened(true);
        setShowWizard(true);
      },
    }),
    [
      addTimelineRow,
      busy,
      completed,
      completionSaving,
      currentStep,
      error,
      agencyNumber,
      aresIcoLookup,
      fullName,
      handlePrimaryAction,
      ico,
      info,
      mfaCode,
      mfaEnabled,
      mfaGraceActive,
      mfaGraceDeadlineLabel,
      mfaGraceExpired,
      mfaGraceRemainingDays,
      mfaPassword,
      mfaQrDataUrl,
      mfaQrError,
      mfaQrLoading,
      mfaReady,
      mfaSaving,
      mfaSecret,
      needsCareerTimelineSetup,
      phone,
      phoneSaving,
      removeTimelineRow,
      resetAfterProfileLoadFailure,
      resetAll,
      resetForMissingUser,
      showWizard,
      stepIndex,
      syncFromProfileData,
      timelineDraft,
      timelineSaving,
      timelineSetupGateActive,
      updateTimelineRow,
    ]
  );
}

// src/components/profile/useUserProfileAccess.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import * as userProfileCache from "@/app/lib/userProfileCache";
import type { UserProfileResponse } from "@/app/lib/userProfileCache";
import type { AccountType } from "@/components/account-setup/useAccountSetupFlow";
import { resolveAppLanguage, type AppLanguage } from "@/lib/appLanguage";
import {
  evaluateSubscriptionFromProfile,
  type EvaluatedSubscriptionAccess,
} from "@/lib/subscriptionAccess";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";

export type SubscriptionAccessUiState = "none" | "active" | "grace" | "blocked";
export type SubscriptionBlockReason = "none" | "unpaid" | "expired";

type AccountSetupProfileSync = {
  version: number;
  data: Record<string, unknown>;
  accountType: AccountType;
  hasInternalProfile: boolean;
};

type UseUserProfileAccessOptions = {
  user: FirebaseUser | null;
  onLanguageResolved: (language: AppLanguage) => void;
};

const PROFILE_CACHE_MAX_AGE_MS = 60 * 1000;
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const LAST_ACTIVE_THROTTLE_MS = 60 * 1000;

const resolveAccountType = (data: Record<string, unknown>): AccountType => {
  const raw =
    typeof data.accountType === "string"
      ? data.accountType
      : typeof data.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const hasTeamCacheKey = (email: string): string =>
  `app.hasTeam:${email.trim().toLowerCase()}`;

const readCachedHasTeam = (email?: string | null): boolean | null => {
  if (typeof window === "undefined" || !email) return null;
  const cached = window.sessionStorage.getItem(hasTeamCacheKey(email));
  if (cached === "0") return false;
  if (cached === "1") return true;
  return null;
};

const writeCachedHasTeam = (email: string | null | undefined, value: boolean): void => {
  if (typeof window === "undefined" || !email) return;
  window.sessionStorage.setItem(hasTeamCacheKey(email), value ? "1" : "0");
};

const effectiveProfileEmail = (fallbackEmail: string | null | undefined): string | null => {
  const impersonatedEmail = readAdminImpersonationState()?.email;
  return impersonatedEmail || fallbackEmail || null;
};

export function useUserProfileAccess({
  user,
  onLanguageResolved,
}: UseUserProfileAccessOptions) {
  const profileEmail = useEffectiveUserEmail(user?.email);
  const [subscriptionAccessState, setSubscriptionAccessState] =
    useState<SubscriptionAccessUiState>("none");
  const [subscriptionBlockReason, setSubscriptionBlockReason] =
    useState<SubscriptionBlockReason>("none");
  const [subscriptionEvaluation, setSubscriptionEvaluation] =
    useState<EvaluatedSubscriptionAccess | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [hasInternalProfile, setHasInternalProfile] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [hasTeam, setHasTeam] = useState<boolean>(true);
  const [hasTipsters, setHasTipsters] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [accountSetupProfileSync, setAccountSetupProfileSync] =
    useState<AccountSetupProfileSync | null>(null);
  const [profileLoadFailureVersion, setProfileLoadFailureVersion] = useState(0);
  const lastActiveUpdateRef = useRef(0);

  const resetProfileAccess = useCallback(() => {
    setSubscriptionAccessState("none");
    setSubscriptionBlockReason("none");
    setSubscriptionEvaluation(null);
    setHasInternalProfile(false);
    setLoadingProfile(false);
    setAccountType("advisor");
    setHasTeam(false);
    setHasTipsters(false);
    setProfileAvatar("");
    setAccountSetupProfileSync(null);
  }, []);

  const markInternalProfileReady = useCallback(() => {
    setHasInternalProfile(true);
  }, []);

  const applyProfilePayload = useCallback(
    (payload: UserProfileResponse, currentUser: FirebaseUser) => {
      const data = (payload?.profile ?? {}) as Record<string, unknown>;
      const nextHasInternalProfile = payload?.hasProfile === true;
      const nextAccountType = resolveAccountType(data);
      const nextLanguage = resolveAppLanguage(data.language);
      const evaluation = nextHasInternalProfile
        ? evaluateSubscriptionFromProfile(data)
        : null;

      setAccountType(nextAccountType);
      setProfileAvatar(normalizeProfileAvatar(data.profileAvatar));
      onLanguageResolved(nextLanguage);
      setHasInternalProfile(nextHasInternalProfile);
      setAccountSetupProfileSync((prev) => ({
        version: (prev?.version ?? 0) + 1,
        data,
        accountType: nextAccountType,
        hasInternalProfile: nextHasInternalProfile,
      }));
      setSubscriptionEvaluation(evaluation);
      if (!evaluation) {
        setSubscriptionAccessState("none");
        setSubscriptionBlockReason("none");
      } else {
        setSubscriptionAccessState(
          evaluation.state === "blocked" ? "blocked" : evaluation.state
        );
        setSubscriptionBlockReason(
          evaluation.reason === "unpaid"
            ? "unpaid"
            : evaluation.reason === "expired"
              ? "expired"
              : "none"
        );
      }

      const has = payload?.hasTeam === true;
      const hasTipsterAccounts = payload?.hasTipsters === true;
      setHasTeam(has);
      setHasTipsters(hasTipsterAccounts);
      writeCachedHasTeam(effectiveProfileEmail(currentUser.email), has);
    },
    [onLanguageResolved]
  );

  const loadProfileForUser = useCallback(
    async (currentUser: FirebaseUser, options?: { force?: boolean }) => {
      const requestScopeEmail = effectiveUserEmail(currentUser.email);
      if (!requestScopeEmail) return;
      const force = options?.force === true;
      const warmPayload =
        !force && typeof userProfileCache.peekUserProfileCached === "function"
          ? userProfileCache.peekUserProfileCached(currentUser, {
              maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
            })
          : null;

      if (warmPayload) {
        if (effectiveUserEmail(currentUser.email) === requestScopeEmail) {
          applyProfilePayload(warmPayload, currentUser);
          setLoadingProfile(false);
        }
      } else {
        setLoadingProfile(true);
      }

      try {
        const payload = await userProfileCache.getUserProfileCached(currentUser, {
          maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
          force,
        });
        if (effectiveUserEmail(currentUser.email) !== requestScopeEmail) return;
        applyProfilePayload(payload, currentUser);
      } catch (error) {
        if (effectiveUserEmail(currentUser.email) !== requestScopeEmail) return;
        console.warn("Chyba při načítání subscription profilu:", error);
        setSubscriptionAccessState("none");
        setSubscriptionBlockReason("none");
        setSubscriptionEvaluation(null);
        setHasInternalProfile(false);
        setAccountType("advisor");
        setHasTeam(false);
        setHasTipsters(false);
        setProfileAvatar("");
        setProfileLoadFailureVersion((prev) => prev + 1);
      } finally {
        if (effectiveUserEmail(currentUser.email) === requestScopeEmail) {
          setLoadingProfile(false);
        }
      }
    },
    [applyProfilePayload]
  );

  useEffect(() => {
    if (!user) {
      resetProfileAccess();
      return;
    }

    setLoadingProfile(true);
    setHasInternalProfile(false);
    setHasTeam(readCachedHasTeam(profileEmail) ?? true);
    void loadProfileForUser(user);
  }, [loadProfileForUser, profileEmail, resetProfileAccess, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const onRefreshProfile = () => {
      void loadProfileForUser(user, { force: true });
    };

    window.addEventListener("app:refresh-user-profile", onRefreshProfile);
    return () => {
      window.removeEventListener("app:refresh-user-profile", onRefreshProfile);
    };
  }, [loadProfileForUser, user]);

  useEffect(() => {
    const currentUser = user;
    const email = currentUser?.email?.toLowerCase();
    if (!currentUser || !email || !hasInternalProfile) return;
    if (readAdminImpersonationState()) return;
    let cancelled = false;
    const shouldLog = process.env.NODE_ENV !== "production";

    const updateLastActive = async (reason: string) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastActiveUpdateRef.current < LAST_ACTIVE_THROTTLE_MS) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      lastActiveUpdateRef.current = now;
      try {
        await fetchAuthedJsonOrThrow(currentUser, "/api/user/profile", {
          method: "PATCH",
          body: JSON.stringify({ lastActivePing: true }),
          cache: "no-store",
        });
        if (shouldLog) {
          console.info("[lastActive] updated", { email, reason });
        }
      } catch (error) {
        console.error("Failed to update lastActive", error);
      }
    };

    void updateLastActive("login");

    const intervalId = window.setInterval(() => {
      void updateLastActive("interval");
    }, LAST_ACTIVE_UPDATE_INTERVAL_MS);

    const onFocus = () => {
      void updateLastActive("focus");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void updateLastActive("visibility");
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasInternalProfile, user]);

  const reloadProfile = useCallback(async () => {
    if (!user) {
      resetProfileAccess();
      return;
    }
    await loadProfileForUser(user, { force: true });
  }, [loadProfileForUser, resetProfileAccess, user]);

  const isTipsterAccount = accountType === "tipster";
  const showPaywall =
    !!user &&
    hasInternalProfile &&
    !isTipsterAccount &&
    subscriptionAccessState === "blocked" &&
    !loadingProfile;

  return useMemo(
    () => ({
      accountSetupProfileSync,
      accountType,
      hasInternalProfile,
      hasTeam,
      hasTipsters,
      isTipsterAccount,
      loadingProfile,
      markInternalProfileReady,
      profileLoadFailureVersion,
      profileAvatar,
      reloadProfile,
      showPaywall,
      subscriptionAccessState,
      subscriptionBlockReason,
      subscriptionEvaluation,
    }),
    [
      accountSetupProfileSync,
      accountType,
      hasInternalProfile,
      hasTeam,
      hasTipsters,
      isTipsterAccount,
      loadingProfile,
      markInternalProfileReady,
      profileLoadFailureVersion,
      profileAvatar,
      reloadProfile,
      showPaywall,
      subscriptionAccessState,
      subscriptionBlockReason,
      subscriptionEvaluation,
    ]
  );
}

import type { User as FirebaseUser } from "firebase/auth";

import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

export type UserProfileResponse = {
  ok?: boolean;
  hasProfile?: boolean;
  hasTeam?: boolean;
  hasTipsters?: boolean;
  profile?: Record<string, unknown>;
};

type ProfileCacheEntry = {
  ts: number;
  payload: UserProfileResponse;
};

const PROFILE_CACHE_TTL_MS = 60 * 1000;
const profileCache: Record<string, ProfileCacheEntry> = {};
const profileInFlight: Partial<Record<string, Promise<UserProfileResponse>>> = {};

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const cacheKeyForUser = (user: FirebaseUser): string => {
  const impersonatedEmail = readAdminImpersonationState()?.email;
  if (impersonatedEmail) return `impersonated:${impersonatedEmail}`;
  const email = normalizeEmail(user.email);
  if (email) return email;
  return `uid:${user.uid}`;
};

export const invalidateUserProfileCache = (email?: string | null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  delete profileCache[normalized];
  delete profileInFlight[normalized];
  delete profileCache[`impersonated:${normalized}`];
  delete profileInFlight[`impersonated:${normalized}`];
};

export function peekUserProfileCached(
  user: FirebaseUser,
  options?: { maxAgeMs?: number }
): UserProfileResponse | null {
  const key = cacheKeyForUser(user);
  const maxAgeMs =
    typeof options?.maxAgeMs === "number" && Number.isFinite(options.maxAgeMs)
      ? Math.max(0, options.maxAgeMs)
      : PROFILE_CACHE_TTL_MS;
  const cached = profileCache[key];
  if (!cached) return null;
  if (Date.now() - cached.ts >= maxAgeMs) return null;
  return cached.payload;
}

export async function getUserProfileCached(
  user: FirebaseUser,
  options?: { maxAgeMs?: number; force?: boolean }
): Promise<UserProfileResponse> {
  const key = cacheKeyForUser(user);
  const maxAgeMs =
    typeof options?.maxAgeMs === "number" && Number.isFinite(options.maxAgeMs)
      ? Math.max(0, options.maxAgeMs)
      : PROFILE_CACHE_TTL_MS;
  const force = options?.force === true;

  const cached = profileCache[key];
  if (!force && cached && Date.now() - cached.ts < maxAgeMs) {
    return cached.payload;
  }

  if (!force && profileInFlight[key]) {
    return profileInFlight[key];
  }

  profileInFlight[key] = fetchAuthedJsonOrThrow<UserProfileResponse>(
    user,
    "/api/user/profile",
    { method: "GET" }
  )
    .then((payload) => {
      profileCache[key] = {
        ts: Date.now(),
        payload,
      };
      return payload;
    })
    .finally(() => {
      delete profileInFlight[key];
    });

  return profileInFlight[key];
}

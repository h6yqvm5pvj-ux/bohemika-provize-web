"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_IMPERSONATION_EVENT,
  ADMIN_IMPERSONATION_STORAGE_KEY,
  readAdminImpersonationState,
  type AdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import { normalizeImpersonationEmail } from "@/lib/adminImpersonationShared";

export function effectiveUserEmail(actorEmail: unknown): string {
  return (
    normalizeImpersonationEmail(readAdminImpersonationState()?.email) ||
    normalizeImpersonationEmail(actorEmail)
  );
}

export function useAdminImpersonationState(): AdminImpersonationState | null {
  const [state, setState] = useState<AdminImpersonationState | null>(null);

  useEffect(() => {
    const sync = () => setState(readAdminImpersonationState());
    const onStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_IMPERSONATION_STORAGE_KEY) sync();
    };

    sync();
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return state;
}

export function useEffectiveUserEmail(actorEmail: unknown): string {
  const impersonation = useAdminImpersonationState();
  return (
    normalizeImpersonationEmail(impersonation?.email) ||
    normalizeImpersonationEmail(actorEmail)
  );
}

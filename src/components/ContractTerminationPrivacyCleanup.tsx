"use client";

import { useEffect } from "react";
import { flushSync } from "react-dom";
import { beforeAuthStateChanged, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import {
  ADMIN_IMPERSONATION_EVENT,
  ADMIN_IMPERSONATION_STORAGE_KEY,
  readAdminImpersonationState,
} from "@/app/lib/adminImpersonation";
import {
  clearContractTerminationPrefills,
  clearLegacyContractTerminationPrefills,
  getContractTerminationContext,
  isLegacyContractTerminationPrefillKey,
  setContractTerminationIdentity,
} from "@/app/lib/contractTerminationPrivacy";

export function ContractTerminationPrivacyCleanup() {
  useEffect(() => {
    let hidden = false;
    clearLegacyContractTerminationPrefills();
    const syncIdentity = (user: User | null = auth.currentUser) => {
      if (!hidden) setContractTerminationIdentity(user?.uid ?? null, readAdminImpersonationState()?.email);
    };
    // Clear before a different Firebase user becomes visible to page listeners.
    const stopBeforeAuth = beforeAuthStateChanged(auth, (nextUser) => {
      if (nextUser?.uid !== getContractTerminationContext()?.uid) clearContractTerminationPrefills();
    });
    const stopAuth = onAuthStateChanged(auth, syncIdentity);
    const onImpersonation = () => syncIdentity();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || isLegacyContractTerminationPrefillKey(event.key)) clearLegacyContractTerminationPrefills();
      if (!event.key || event.key === ADMIN_IMPERSONATION_STORAGE_KEY) syncIdentity();
    };
    const onPageHide = () => {
      hidden = true;
      // Also unmount an already filled form before the history snapshot freezes.
      flushSync(() => setContractTerminationIdentity(null));
    };
    const onPageShow = (event: PageTransitionEvent) => {
      clearLegacyContractTerminationPrefills();
      if (event.persisted) window.location.reload();
    };
    window.addEventListener(ADMIN_IMPERSONATION_EVENT, onImpersonation);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopBeforeAuth();
      stopAuth();
      window.removeEventListener(ADMIN_IMPERSONATION_EVENT, onImpersonation);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
  return null;
}

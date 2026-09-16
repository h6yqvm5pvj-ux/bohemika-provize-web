"use client";

import { useEffect } from "react";
import { flushSync } from "react-dom";
import { beforeAuthStateChanged, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/app/firebase-auth";
import { ADMIN_IMPERSONATION_EVENT, ADMIN_IMPERSONATION_STORAGE_KEY, readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import {
  clearLegacyMeetingRecords, clearMeetingRecords, getMeetingRecordContext,
  isLegacyMeetingRecordKey, setMeetingRecordIdentity, suspendMeetingRecordSession,
} from "@/app/lib/meetingRecordPrivacy";

export function MeetingRecordPrivacyCleanup() {
  useEffect(() => {
    let hidden = false;
    clearLegacyMeetingRecords();
    const syncIdentity = (user: User | null = auth.currentUser) => {
      if (!hidden) setMeetingRecordIdentity(user?.uid ?? null, readAdminImpersonationState()?.email);
    };
    const stopBeforeAuth = beforeAuthStateChanged(auth, (nextUser) => {
      const previous = getMeetingRecordContext();
      if (previous && nextUser?.uid !== previous.uid) clearMeetingRecords();
    });
    const stopAuth = onAuthStateChanged(auth, syncIdentity);
    const onImpersonation = () => syncIdentity();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || isLegacyMeetingRecordKey(event.key)) clearLegacyMeetingRecords();
      if (!event.key || event.key === ADMIN_IMPERSONATION_STORAGE_KEY) syncIdentity();
    };
    const onPageHide = () => {
      hidden = true;
      flushSync(suspendMeetingRecordSession);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      clearLegacyMeetingRecords();
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

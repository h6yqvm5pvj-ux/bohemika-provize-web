"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { readAdminImpersonationState, withDefaultAdminImpersonationHeader } from "@/app/lib/adminImpersonation";
import { isVehicleOverlapResult, type VehicleOverlapCheck, type VehicleOverlapDraft } from "@/app/lib/vehicleOverlap";

export type VehicleOverlapPreview =
  | { status: "pending"; startedAt: number | null }
  | (VehicleOverlapCheck & { finishedAt: number });
type Lookup = {
  key: string;
  controller: AbortController;
  checkedAt: number | null;
  outcome: VehicleOverlapCheck | null;
  promise: Promise<VehicleOverlapCheck>;
};

const failed: VehicleOverlapCheck = { status: "failed" };
const pending: VehicleOverlapPreview = { status: "pending", startedAt: null };

export function useVehicleOverlapPreview(user: User | null, impersonatedEmail: string, draft: VehicleOverlapDraft | null) {
  const key = user && draft ? JSON.stringify([user.uid, impersonatedEmail, draft]) : "";
  const active = useRef<Lookup | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; preview: VehicleOverlapPreview } | null>(null);

  const start = useCallback((retry = false) => {
    const sameSession = () => auth.currentUser?.uid === user?.uid &&
      (readAdminImpersonationState()?.email ?? "") === impersonatedEmail;
    if (!user || !draft || !sameSession()) return null;

    const previous = active.current;
    if (previous?.key === key && (!retry || !previous.outcome ||
      (previous.outcome.status === "checked" && previous.checkedAt && Date.now() - previous.checkedAt < 60_000))) {
      return previous;
    }
    previous?.controller.abort();

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 16_000);
    setSnapshot({ key, preview: { status: "pending", startedAt: Date.now() } });
    const aborted = new Promise<VehicleOverlapCheck>(resolve => {
      controller.signal.addEventListener("abort", () => resolve(failed), { once: true });
    });
    const request = async (): Promise<VehicleOverlapCheck> => {
      const headers = withDefaultAdminImpersonationHeader({ "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, impersonatedEmail);
      const result = await fetchAuthedJsonOrThrow(user, "/api/contracts/vehicle-overlaps/preview", {
        method: "POST", body: new URLSearchParams(draft), headers, signal: controller.signal,
      });
      return sameSession() && isVehicleOverlapResult(result) ? { status: "checked", result } : failed;
    };
    const lookup: Lookup = { key, controller, checkedAt: null, outcome: null, promise: Promise.race([request().catch(() => failed), aborted]).then(outcome => {
      window.clearTimeout(timer);
      lookup.checkedAt = Date.now();
      lookup.outcome = outcome;
      if (active.current === lookup && sameSession()) {
        setSnapshot({ key, preview: { ...outcome, finishedAt: lookup.checkedAt } });
      }
      return outcome;
    }) };
    active.current = lookup;
    return lookup;
  }, [draft, impersonatedEmail, key, user]);

  useEffect(() => {
    if (active.current?.key !== key) {
      active.current?.controller.abort();
      active.current = null;
    }
    if (!key) return;
    const timer = window.setTimeout(() => start(), 250);
    return () => window.clearTimeout(timer);
  }, [key, start]);

  useEffect(() => () => {
    active.current?.controller.abort();
    active.current = null;
  }, []);

  return { preview: key ? snapshot?.key === key ? snapshot.preview : pending : null, startForSave: () => start(true) };
}

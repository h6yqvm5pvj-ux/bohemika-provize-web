"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { readAdminImpersonationState, withDefaultAdminImpersonationHeader } from "@/app/lib/adminImpersonation";
import type { VehicleOverlapCheck, VehicleOverlapResult } from "@/app/lib/vehicleOverlap";

export function useVehicleOverlapWarning(user: User | null, impersonatedEmail: string) {
  const scope = user ? `${user.uid}:${impersonatedEmail}` : "";
  const pending = useRef(new Set<AbortController>());
  const [notice, setNotice] = useState<{ scope: string; result: VehicleOverlapResult | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controllers = pending.current;
    return () => controllers.forEach(controller => controller.abort());
  }, [scope]);
  const current = notice && notice.scope === scope ? notice : null;
  const sameSession = useCallback(() => Boolean(user) && auth.currentUser?.uid === user?.uid &&
    (readAdminImpersonationState()?.email ?? "") === impersonatedEmail, [user, impersonatedEmail]);

  const present = useCallback((outcome: VehicleOverlapCheck) => {
    if (!sameSession()) return;
    if (outcome.status === "failed") {
      setNotice(previous => ({ scope, result: previous?.scope === scope ? previous.result : null, failed: true }));
      return;
    }
    const { result } = outcome;
    if (result.matches.length === 0) return;
    setNotice(previous => {
      const prior = previous?.scope === scope ? previous : null;
      const byEntry = new Map(prior?.result?.matches.map(match => [`${match.ownerEmail}:${match.entryId}`, match]));
      for (const match of result.matches) {
        const key = `${match.ownerEmail}:${match.entryId}`;
        if (!match.vinMismatch || !byEntry.has(key)) byEntry.set(key, match);
      }
      return { scope, failed: prior?.failed ?? false, result: {
        matches: [...byEntry.values()], truncated: result.truncated || Boolean(prior?.result?.truncated),
      } };
    });
  }, [sameSession, scope]);

  const check = useCallback(async (ownerEmail: string, entryIds: string[]) => {
    if (!user || entryIds.length === 0 || !sameSession()) return;
    const controller = new AbortController();
    pending.current.add(controller);
    const fail = () => {
      if (!controller.signal.aborted) present({ status: "failed" });
    };
    const timer = window.setTimeout(() => {
      fail();
      controller.abort();
    }, 16_000);
    const aborted = new Promise<null>(resolve => {
      controller.signal.addEventListener("abort", () => resolve(null), { once: true });
    });
    try {
      const body = new URLSearchParams({ ownerEmail });
      entryIds.forEach(id => body.append("entryId", id));
      const headers = withDefaultAdminImpersonationHeader({ "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, impersonatedEmail);
      const result = await Promise.race([
        fetchAuthedJsonOrThrow<VehicleOverlapResult>(user, "/api/contracts/vehicle-overlaps",
          { method: "POST", body, headers, signal: controller.signal }),
        aborted,
      ]);
      if (result && !controller.signal.aborted) present({ status: "checked", result });
    } catch {
      fail();
    } finally {
      window.clearTimeout(timer);
      pending.current.delete(controller);
    }
  }, [impersonatedEmail, present, sameSession, user]);
  return { notice: current, check, present, dismiss: () => setNotice(null) };
}

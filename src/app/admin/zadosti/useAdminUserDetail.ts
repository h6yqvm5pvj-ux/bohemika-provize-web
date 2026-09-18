import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { AdminUserSummary, AdminUsersRow } from "./adminUsers";

/** Replacing the directory summary after a save also invalidates this detail. */
export function useAdminUserDetail(summary: AdminUserSummary | null, user: User | null) {
  const [result, setResult] = useState<{ summary: AdminUserSummary; actor: string; revision: number; detail?: AdminUsersRow; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!summary || !user) return;
    const controller = new AbortController();
    let active = true;
    void fetchAuthedJsonOrThrow<{ user: AdminUsersRow }>(user, `/api/admin/users?email=${encodeURIComponent(summary.email)}`, {
      method: "GET", signal: controller.signal,
    }).then((payload) => {
      if (active) setResult({ summary, actor: user.uid, revision, detail: payload.user });
    }).catch((error: unknown) => {
      if (active) setResult({ summary, actor: user.uid, revision, error: error instanceof Error ? error.message : "Detail se nepodařilo načíst." });
    });
    return () => { active = false; controller.abort(); };
  }, [summary, user, revision]);
  const current = result?.summary === summary && result?.actor === user?.uid && result?.revision === revision ? result : null;
  return { detail: current?.detail ?? null, error: current?.error ?? null, reload };
}

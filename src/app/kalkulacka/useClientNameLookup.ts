"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { createClientNameIndex, matchClientName } from "./clientNameMatching";

export type ClientNameLookupStatus = "idle" | "loading" | "ready" | "error";
type LookupState = { contextKey: string; names: string[]; status: ClientNameLookupStatus };

export function useClientNameLookup({
  user, ownerEmail, isSavingForSubordinate, impersonatedUserEmail, query,
}: {
  user: User | null;
  ownerEmail: string;
  isSavingForSubordinate: boolean;
  impersonatedUserEmail: string;
  query: string;
}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<LookupState>({ contextKey: "", names: [], status: "idle" });
  const contextKey = JSON.stringify([user?.uid, ownerEmail, isSavingForSubordinate, impersonatedUserEmail]);

  useEffect(() => {
    const controller = new AbortController();
    const publish = (status: ClientNameLookupStatus, names?: string[]) => {
      if (!controller.signal.aborted) setState(previous => ({ contextKey, status,
        names: names ?? (previous.contextKey === contextKey ? previous.names : []),
      }));
    };
    if (!user || !ownerEmail) {
      publish("idle");
      return () => controller.abort();
    }
    publish("loading");

    const load = async () => {
      try {
        const params = new URLSearchParams({ ownerEmail });
        const payload = await fetchAuthedJsonOrThrow<{ ok?: boolean; names?: string[] }>(user, `/api/contracts/client-names?${params}`, {
          signal: controller.signal,
          headers: { [ADMIN_IMPERSONATION_HEADER]: impersonatedUserEmail },
        });
        controller.signal.throwIfAborted();
        if (!payload?.ok || !Array.isArray(payload.names) || payload.names.some(name => typeof name !== "string")) {
          throw new Error("Invalid client name response");
        }
        publish("ready", payload.names);
      } catch {
        publish("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [user, ownerEmail, impersonatedUserEmail, contextKey, revision]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRevision((value) => value + 1), 200);
    };
    window.addEventListener("contracts:updated", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("contracts:updated", refresh); };
  }, []);

  // Do not expose the old owner's names even during the render before the effect runs.
  const currentState = state.contextKey === contextKey ? state : null;
  const index = useMemo(() => createClientNameIndex(currentState?.names ?? []), [currentState?.names]);
  const matches = useMemo(() => matchClientName(query, index), [query, index]);
  return {
    matches,
    status: currentState?.status ?? (user && ownerEmail ? "loading" : "idle"),
    retry: () => setRevision((value) => value + 1),
  };
}

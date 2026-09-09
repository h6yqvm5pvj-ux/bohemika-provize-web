"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { ContractsApiResponse } from "./calculatorApi";
import { clientNameExactKey, createClientNameIndex, matchClientName } from "./clientNameMatching";

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
  const contextKey = JSON.stringify([user?.uid, ownerEmail, isSavingForSubordinate, impersonatedUserEmail, revision]);

  useEffect(() => {
    const controller = new AbortController();
    const names = new Map<string, string>();
    const publish = (status: ClientNameLookupStatus) => {
      if (!controller.signal.aborted) setState({ contextKey, names: [...names.values()], status });
    };
    if (!user || !ownerEmail) {
      publish("idle");
      return () => controller.abort();
    }
    publish("loading");

    const load = async () => {
      try {
        let cursor: string | null = null;
        const seenCursors = new Set<string>();
        do {
          controller.signal.throwIfAborted();
          const params = new URLSearchParams({
            scope: isSavingForSubordinate ? "team" : "my", limit: "50", shape: "clientNames",
          });
          if (isSavingForSubordinate) params.set("subordinates", ownerEmail);
          if (cursor) params.set("cursor", cursor);
          const payload = await fetchAuthedJsonOrThrow<ContractsApiResponse>(user, `/api/contracts/list?${params}`, {
            signal: controller.signal,
            // Pin every page to the same viewing identity, even if impersonation changes mid-request.
            headers: { [ADMIN_IMPERSONATION_HEADER]: impersonatedUserEmail },
          });
          controller.signal.throwIfAborted();
          if (!payload || payload.ok === false || !Array.isArray(payload.contracts)) throw new Error("Invalid client name response");
          for (const contract of payload.contracts) {
            const name = contract.clientName?.trim();
            if (name && !names.has(clientNameExactKey(name))) names.set(clientNameExactKey(name), name);
          }
          if (!payload.hasMore) {
            publish("ready");
            return;
          }
          const nextCursor = payload.nextCursorToken;
          if (!nextCursor || seenCursors.has(nextCursor)) throw new Error("Incomplete client name pagination");
          seenCursors.add(nextCursor);
          cursor = nextCursor;
          publish("loading");
        } while (!controller.signal.aborted);
      } catch {
        publish("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [user, ownerEmail, isSavingForSubordinate, impersonatedUserEmail, contextKey]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("contracts:updated", refresh);
    return () => window.removeEventListener("contracts:updated", refresh);
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

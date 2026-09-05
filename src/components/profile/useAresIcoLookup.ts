"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";

import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

export type AresIcoMatch = {
  ico: string;
  companyName: string;
  address: string;
  legalForm: string;
  active: boolean;
};

export type AresIcoLookupState =
  | { status: "idle"; ico: string }
  | { status: "loading"; ico: string }
  | { status: "match"; ico: string; entity: AresIcoMatch }
  | { status: "not-found"; ico: string }
  | { status: "error"; ico: string; message: string };

type LookupResponse = {
  ok?: boolean;
  entity?: {
    ico?: unknown;
    companyName?: unknown;
    address?: unknown;
    legalForm?: unknown;
    active?: unknown;
  } | null;
  error?: string;
};

const normalizeIco = (value: string): string =>
  value.replace(/\D+/g, "").slice(0, 8);

const parseMatch = (value: LookupResponse["entity"]): AresIcoMatch | null => {
  if (!value) return null;
  const ico = typeof value.ico === "string" ? normalizeIco(value.ico) : "";
  const companyName =
    typeof value.companyName === "string" ? value.companyName.trim() : "";
  if (ico.length !== 8 || !companyName) return null;
  return {
    ico,
    companyName,
    address: typeof value.address === "string" ? value.address.trim() : "",
    legalForm: typeof value.legalForm === "string" ? value.legalForm.trim() : "",
    active: value.active !== false,
  };
};

export function useAresIcoLookup({
  user,
  ico,
  enabled = true,
}: {
  user: FirebaseUser | null;
  ico: string;
  enabled?: boolean;
}): AresIcoLookupState {
  const normalizedIco = normalizeIco(ico);
  const requestVersionRef = useRef(0);
  const cacheRef = useRef(new Map<string, AresIcoLookupState>());
  const [result, setResult] = useState<AresIcoLookupState>({ status: "idle", ico: "" });

  useEffect(() => {
    if (!enabled || !user || normalizedIco.length !== 8) return;
    const requestVersion = ++requestVersionRef.current;
    const cached = cacheRef.current.get(normalizedIco);
    const timeout = window.setTimeout(() => {
      if (cached) {
        setResult(cached);
        return;
      }

      setResult({ status: "loading", ico: normalizedIco });
      void fetchAuthedJsonOrThrow<LookupResponse>(user, "/api/user/profile/ico-lookup", {
        method: "POST",
        body: JSON.stringify({ ico: normalizedIco }),
      })
        .then((payload) => {
          if (requestVersion !== requestVersionRef.current) return;
          const entity = parseMatch(payload.entity);
          const next: AresIcoLookupState = entity
            ? { status: "match", ico: normalizedIco, entity }
            : { status: "not-found", ico: normalizedIco };
          cacheRef.current.set(normalizedIco, next);
          setResult(next);
        })
        .catch((error: unknown) => {
          if (requestVersion !== requestVersionRef.current) return;
          setResult({
            status: "error",
            ico: normalizedIco,
            message:
              error instanceof Error && error.message.trim()
                ? error.message.trim()
                : "IČO se nepodařilo ověřit v ARESu.",
          });
        });
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      requestVersionRef.current += 1;
    };
  }, [enabled, normalizedIco, user]);

  return useMemo(() => {
    if (!enabled || normalizedIco.length !== 8) {
      return { status: "idle", ico: normalizedIco };
    }
    if (result.ico !== normalizedIco) {
      return { status: "loading", ico: normalizedIco };
    }
    return result;
  }, [enabled, normalizedIco, result]);
}

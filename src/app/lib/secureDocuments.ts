"use client";

import { useEffect, useState } from "react";

import { auth } from "@/app/firebase-auth";
import { fetchAuthedBlobOrThrow } from "@/app/lib/authenticatedApi";

export type SecureDocumentId =
  | "cpp-storno-dohodou"
  | "cpp-vypoved-zp"
  | "cpp-vypoved-zp-zadanky"
  | "generali-nezivot"
  | "koop-vypoved"
  | "max-denni-cpp"
  | "koop-prijem"
  | "metlife-vypoved";

export const SECURE_DOCUMENT_FILE_NAMES: Record<SecureDocumentId, string> = {
  "cpp-storno-dohodou": "zpneonstornodohodou.pdf",
  "cpp-vypoved-zp": "Výpověď_PS_ŽP_062023.pdf",
  "cpp-vypoved-zp-zadanky": "ŽP DOKUMENTY Žádanky Výpověď_PS_ŽP_062023.pdf",
  "generali-nezivot": "generalinezivot.pdf",
  "koop-vypoved": "koopvypoved.pdf",
  "max-denni-cpp": "maxdenni.jpg",
  "koop-prijem": "koopprijem.jpg",
  "metlife-vypoved": "metlifevypoved.pdf",
};

type SecureDocumentState = {
  blob: Blob | null;
  url: string | null;
  loading: boolean;
  error: string | null;
};

export function secureDocumentPath(
  id: SecureDocumentId,
  options?: { download?: boolean }
): string {
  const params = new URLSearchParams({ id });
  if (options?.download) params.set("download", "1");
  return `/api/documents/file?${params.toString()}`;
}

export function useSecureDocumentBlob(id: SecureDocumentId | null): SecureDocumentState {
  const [state, setState] = useState<SecureDocumentState>({
    blob: null,
    url: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ blob: null, url: null, loading: false, error: null });
      return;
    }

    const documentId = id;
    let cancelled = false;
    let objectUrl: string | null = null;

    setState({ blob: null, url: null, loading: true, error: null });

    async function loadDocument() {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Pro načtení dokumentu je nutné přihlášení.");
        }

        const blob = await fetchAuthedBlobOrThrow(
          currentUser,
          secureDocumentPath(documentId)
        );
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setState({ blob, url: objectUrl, loading: false, error: null });
        }
      } catch (error) {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }

        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Dokument se nepodařilo načíst.";
        if (!cancelled) {
          setState({ blob: null, url: null, loading: false, error: message });
        }
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [id]);

  return state;
}

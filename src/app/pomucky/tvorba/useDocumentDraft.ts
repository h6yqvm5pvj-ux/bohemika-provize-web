"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { openDocumentDraftVault, type DocumentDraft, type DocumentDraftVault } from "./documentDraft";

type DraftState = Omit<DocumentDraft, "version" | "updatedAt">;

/** Mount a separate editor per owner so drafts can never migrate between accounts. */
export function useDocumentDraft(user: FirebaseUser, state: DraftState, editorRef: RefObject<HTMLDivElement | null>, restore: (draft: DocumentDraft) => void) {
  const owner = user.uid;
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const openVault = useEffectEvent(() => openDocumentDraftVault(user));
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<{ active: boolean; loaded: boolean; vault: DocumentDraftVault | null; revision: number; pending: DocumentDraft | null; timer?: ReturnType<typeof setTimeout>; queue: Promise<void> } | null>(null);
  const capture = useEffectEvent((): DocumentDraft => ({
    ...state, version: 1, updatedAt: Date.now(),
    pages: state.pages.map(page => page.id === state.activePageId ? { ...page, html: editorRef.current?.innerHTML ?? page.html } : page),
  }));
  const restoreDraft = useEffectEvent(restore);
  const flush = useCallback(() => {
    const current = session.current;
    if (!current?.pending || !current.vault) return;
    clearTimeout(current.timer);
    const draft = current.pending;
    const revision = current.revision;
    current.pending = null;
    // Serialize writes so a slower earlier save cannot replace the newest revision.
    current.queue = current.queue.catch(() => {}).then(() => current.vault!.write(draft)).then(() => {
      if (current.active && current.revision === revision) setStatus("saved");
    }).catch(() => {
      if (current.active && current.revision === revision) setStatus("error");
    });
  }, []);
  const schedule = useEffectEvent(() => {
    const current = session.current;
    if (!current?.loaded || !current.active) return;
    current.pending = capture();
    current.revision++;
    setStatus("saving");
    clearTimeout(current.timer);
    current.timer = setTimeout(flush, 500);
  });

  useEffect(() => {
    const current = { active: true, loaded: false, vault: null, revision: 0, pending: null, queue: Promise.resolve() } as NonNullable<typeof session.current>;
    session.current = current;
    void openVault().then(async vault => {
      if (!current.active) { vault.dispose(); return; }
      current.vault = vault;
      const draft = await vault.read();
      if (!current.active) { vault.dispose(); return; }
      if (draft) { restoreDraft(draft); setRestoredAt(draft.updatedAt); }
      current.loaded = true;
      setReady(true);
      setStatus("saved");
    }).catch(error => {
      current.vault?.dispose();
      current.vault = null;
      if (!current.active) return;
      setErrorMessage(error instanceof Error ? error.message : "Koncept se nepodařilo odemknout.");
      setStatus("error");
    });
    const observer = new MutationObserver(() => schedule());
    if (editorRef.current) observer.observe(editorRef.current, { childList: true, subtree: true, characterData: true, attributes: true });
    const saveNow = () => { if (current.loaded) { schedule(); flush(); } };
    const onVisibility = () => { if (document.visibilityState === "hidden") saveNow(); };
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("visibilitychange", onVisibility);
      current.active = false;
      flush();
      clearTimeout(current.timer);
      void current.queue.finally(() => current.vault?.dispose());
    };
  }, [owner, editorRef, flush, loadAttempt]);

  useEffect(() => { if (ready) schedule(); }, [state, ready]);
  useEffect(() => {
    if (!attempt) return;
    schedule();
    flush();
  }, [attempt, flush]);
  const saveNow = () => setAttempt(value => value + 1);
  return { ready, status, restoredAt, errorMessage, retry: () => {
    if (ready) saveNow();
    else { setStatus("loading"); setErrorMessage(null); setLoadAttempt(value => value + 1); }
  }, saveNow };
}

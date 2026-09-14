import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import type { SharedClientContractsResponse } from "./sharedClientContracts";

function nextPage(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 750);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function loadSharedClientContracts(user: User, slug: string, query: string, signal: AbortSignal, onUpdate: (response: SharedClientContractsResponse) => void) {
  while (true) {
    signal.throwIfAborted();
    const result = await fetchAuthedJsonOrThrow<SharedClientContractsResponse>(user, `/api/client-cards/${encodeURIComponent(slug)}/shared-contracts${query ? `?${query}` : ""}`, {
      signal, headers: { [ADMIN_IMPERSONATION_HEADER]: "" },
    });
    signal.throwIfAborted();
    if (!result?.ok || !Array.isArray(result.contracts) || !Array.isArray(result.summaries) || typeof result.indexing !== "boolean" || typeof result.matchingAvailable !== "boolean") throw new Error("Neplatný přehled sdílených smluv.");
    onUpdate(result);
    if (!result.indexing) return;
    await nextPage(signal);
  }
}

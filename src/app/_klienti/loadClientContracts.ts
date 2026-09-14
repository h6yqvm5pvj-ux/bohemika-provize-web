import type { User } from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import { uniqueContracts, type ClientAdviser, type ClientContractItem } from "./clientCardHelpers";
import { clientScopeQuery, type ClientScopeSelection } from "./clientScope";

type IndexedContractsResponse = {
  ok: boolean;
  indexing?: boolean;
  indexedContracts?: number;
  contracts?: ClientContractItem[];
  teamAdvisers?: ClientAdviser[];
};

export async function loadClientContracts(
  user: User,
  signal: AbortSignal,
  onProgress?: (count: number) => void,
  onTeamAdvisers?: (advisers: ClientAdviser[]) => void,
  options: { selection?: ClientScopeSelection | null; slug?: string } = {},
): Promise<ClientContractItem[]> {
  const params = new URLSearchParams(options.selection === null ? { scope: "all" } : clientScopeQuery(options.selection ?? { scope: "my", advisers: [] }));
  if (options.slug) params.set("clientSlug", options.slug);
  let lastProgress = -1;
  let stalled = 0;
  // Usually one request. Only the first legacy migration needs further bounded
  // requests; the API checkpoints each page, including after an aborted visit.
  while (true) {
    signal.throwIfAborted();
    const payload = await fetchAuthedJsonOrThrow<IndexedContractsResponse>(user, `/api/client-cards/contracts?${params}`, {
      signal, headers: { [ADMIN_IMPERSONATION_HEADER]: "" },
    });
    signal.throwIfAborted();
    if (!payload?.ok) throw new Error("Neplatná odpověď seznamu smluv.");
    if (Array.isArray(payload.teamAdvisers)) onTeamAdvisers?.(payload.teamAdvisers);
    if (!payload.indexing) {
      if (!Array.isArray(payload.contracts)) throw new Error("Neplatná odpověď seznamu smluv.");
      return uniqueContracts(payload.contracts);
    }
    const progress = payload.indexedContracts;
    if (!Number.isSafeInteger(progress) || Number(progress) < 0) throw new Error("Neplatný průběh propojení smluv.");
    stalled = progress === lastProgress ? stalled + 1 : 0;
    if (stalled >= 2) throw new Error("Propojení smluv se nepodařilo dokončit. Zkus to znovu.");
    lastProgress = progress!;
    onProgress?.(progress!);
  }
}

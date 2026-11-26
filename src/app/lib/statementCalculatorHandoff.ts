import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";

export const STATEMENT_CALCULATOR_HANDOFF_PARAM = "statementDraft";

export type StatementCalculatorHandoff = {
  id: string;
  getAccount: () => string | null;
};

export function statementCalculatorDraftAccount(uid: string | undefined): string | null {
  if (!uid) return null;
  return JSON.stringify([uid, readAdminImpersonationState()?.email ?? null]);
}

function openChannel(id: string, account: string): BroadcastChannel {
  return new BroadcastChannel(`bohemka:statement-calculator:${id}:${account}`);
}

// Keep the draft in memory while the statement panel is open.
export function publishStatementCalculatorDraft(
  { id, getAccount }: StatementCalculatorHandoff,
  params: URLSearchParams
) {
  const owner = getAccount();
  if (!owner || typeof BroadcastChannel === "undefined") return;
  const channel = openChannel(id, owner);
  channel.onmessage = ({ data }) => {
    if (data === "request" && getAccount() === owner) {
      channel.postMessage({ draft: params.toString() });
    }
  };
  return () => channel.close();
}

export function receiveStatementCalculatorDraft(
  { id, getAccount }: StatementCalculatorHandoff,
  onResult: (draft: URLSearchParams | null) => void
): () => void {
  const owner = getAccount();
  if (!owner || !/^[0-9a-f-]{36}$/.test(id) || typeof BroadcastChannel === "undefined") {
    onResult(null);
    return () => {};
  }

  const channel = openChannel(id, owner);
  const timeout = window.setTimeout(() => {
    close();
    onResult(null);
  }, 3000);
  const close = () => {
    window.clearTimeout(timeout);
    channel.close();
  };

  channel.onmessage = ({ data }) => {
    if (typeof data?.draft !== "string") return;
    close();
    onResult(getAccount() === owner ? new URLSearchParams(data.draft) : null);
  };
  channel.postMessage("request");
  return close;
}

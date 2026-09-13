import { NextRequest } from "next/server";

import type { CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import { dedupeCashflowCommissionStatements } from "@/app/cashflow/helpers";
import { isSubscriptionCashflowOwner } from "@/app/cashflow/subscriptionCashflow";
import type { CashflowCommissionStatementSummary, EntryDoc } from "@/app/cashflow/types";

const MAX_REQUESTS = 50;
const MAX_DURATION_MS = 20_000;
const CONTRACT_PAGE_LIMIT = 100;
const TIP_PAGE_LIMIT = 100;
const STATEMENTS_LIMIT = 240;
const SUBSCRIPTIONS_LIMIT = 5_000;

type Source = "profile" | "contracts" | "tips" | "subscriptions" | "statements";
type JsonObject = Record<string, unknown>;

export type CashflowShadowInputsErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_allowed"
  | "upstream_failed"
  | "incomplete"
  | "limit"
  | "aborted"
  | "timeout";

export class CashflowShadowInputsError extends Error {
  constructor(
    public readonly code: CashflowShadowInputsErrorCode,
    public readonly status = 503
  ) {
    super("Cashflow shadow inputs are unavailable.");
    this.name = "CashflowShadowInputsError";
  }
}

export type CashflowShadowInputs = {
  snapshot: CashflowSnapshot;
  statements: CashflowCommissionStatementSummary[];
  effectiveEmail: string;
  tipsterMode: boolean;
};

type LoadOptions = {
  /** Evaluated after authentication, before any portfolio reads. */
  authorizeEmail?: (email: string) => boolean | Promise<boolean>;
  /** Bypass process-local role/team/subscription caches for a fenced candidate read. */
  freshCashflowContext?: boolean;
};

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const incomplete = (): never => {
  throw new CashflowShadowInputsError("incomplete");
};

function rows(data: JsonObject, key: string, limit: number): JsonObject[] {
  const values = data[key];
  if (!Array.isArray(values) || values.length > limit || !values.every(isObject)) {
    return incomplete();
  }
  return values;
}

function nextCursor(data: JsonObject, chunkSize: number, seen: Set<string>): string | null {
  if (typeof data.hasMore !== "boolean") return incomplete();
  const token = typeof data.nextCursorToken === "string" ? data.nextCursorToken.trim() : "";
  const legacy = typeof data.nextCursor === "number" && Number.isFinite(data.nextCursor)
    ? String(data.nextCursor)
    : "";
  const cursor = token || legacy || null;
  if (cursor && seen.has(cursor)) return incomplete();
  if (data.hasMore && (!cursor || chunkSize === 0)) return incomplete();
  if (cursor) seen.add(cursor);
  return data.hasMore ? cursor : null;
}

async function invoke(source: Source, request: NextRequest, freshCashflowContext: boolean): Promise<Response> {
  // Direct authorized handlers: no HTTP request, user supplied URL or auth bypass.
  switch (source) {
    case "profile":
      return (await import("@/app/api/user/profile/route")).GET(request);
    case "contracts":
      return (await import("@/app/api/contracts/_lib/contractsApi")).handleContractsList(request, { freshCashflowContext });
    case "tips":
      return (await import("@/app/api/tip-payouts/list/route")).GET(request);
    case "subscriptions":
      return (await import("@/app/api/subscription-payments/list/route")).GET(request);
    case "statements":
      return (await import("@/app/api/commission-statements/route")).GET(request);
  }
}

/**
 * Independent, bounded reread for shadow comparison only. These reads are not a
 * transaction and must never be treated as proof of snapshot freshness.
 */
export async function loadCashflowShadowInputs(
  request: NextRequest,
  options: LoadOptions = {}
): Promise<CashflowShadowInputs> {
  const controller = new AbortController();
  let stopError: CashflowShadowInputsError | null = null;
  let rejectStopped: (error: CashflowShadowInputsError) => void = () => undefined;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  // The signal may already be aborted before the first asynchronous read.
  void stopped.catch(() => undefined);
  const stop = (code: "aborted" | "timeout") => {
    if (stopError) return;
    stopError = new CashflowShadowInputsError(code, code === "timeout" ? 504 : 499);
    controller.abort();
    rejectStopped(stopError);
  };
  const onAbort = () => stop("aborted");
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) onAbort();
  const timer = setTimeout(() => stop("timeout"), MAX_DURATION_MS);
  let requests = 0;

  const read = async (source: Source, path: string, params?: URLSearchParams): Promise<JsonObject> => {
    if (stopError) throw stopError;
    if (controller.signal.aborted) throw new CashflowShadowInputsError("aborted", 499);
    if (requests >= MAX_REQUESTS) throw new CashflowShadowInputsError("limit");
    requests += 1;
    const url = new URL(path, "http://cashflow-shadow.internal");
    if (params) url.search = params.toString();
    const child = new NextRequest(url, {
      method: "GET",
      headers: new Headers(request.headers),
      signal: controller.signal,
    });
    try {
      const response = await Promise.race([invoke(source, child, options.freshCashflowContext === true), stopped]);
      if (!response.ok) {
        const code = response.status === 401 ? "unauthorized"
          : response.status === 403 ? "forbidden" : "upstream_failed";
        throw new CashflowShadowInputsError(code, [401, 403, 429].includes(response.status) ? response.status : 503);
      }
      const body: unknown = await Promise.race([response.json(), stopped]);
      if (!isObject(body) || body.ok !== true) return incomplete();
      return body;
    } catch (error) {
      if (error instanceof CashflowShadowInputsError) throw error;
      throw new CashflowShadowInputsError("upstream_failed");
    }
  };

  try {
    const profile = await read("profile", "/api/user/profile");
    const effectiveEmail = normalizeEmail(profile.email);
    if (!effectiveEmail || !isObject(profile.profile) || profile.hasProfile !== true) return incomplete();
    if (options.authorizeEmail && !await Promise.race([options.authorizeEmail(effectiveEmail), stopped])) {
      throw new CashflowShadowInputsError("not_allowed", 403);
    }
    const accountType = typeof profile.profile.accountType === "string" ? profile.profile.accountType
      : typeof profile.profile.userRole === "string" ? profile.profile.userRole : "";
    const tipsterMode = accountType.trim().toLowerCase() === "tipster";

    const collectContracts = async (scope: "my" | "team") => {
      const entries: EntryDoc[] = [];
      const seenIds = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let first: JsonObject | null = null;
      let totalCount = 0;
      do {
        const params = new URLSearchParams({ scope, limit: String(CONTRACT_PAGE_LIMIT), shape: "cashflow" });
        if (cursor) params.set("cursor", cursor);
        const data = await read("contracts", "/api/contracts/list", params);
        if (!first) {
          first = data;
          if (typeof data.totalCount !== "number" || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0) return incomplete();
          if (typeof data.hasTeam !== "boolean" || !Array.isArray(data.teamEmails) || !data.teamEmails.every(email => typeof email === "string")) return incomplete();
          totalCount = data.totalCount;
        } else if (data.totalCount != null && data.totalCount !== totalCount) {
          return incomplete();
        }
        const chunk = rows(data, "contracts", CONTRACT_PAGE_LIMIT);
        for (const item of chunk) {
          const ownerEmail = normalizeEmail(item.adviserEmail ?? item.userEmail ?? effectiveEmail);
          const id = String(item.id ?? "").trim();
          if (!ownerEmail || !id) return incomplete();
          const key = `${ownerEmail}___${id}`;
          if (seenIds.has(key)) continue;
          seenIds.add(key);
          entries.push({ ...item, id, userEmail: ownerEmail } as EntryDoc);
        }
        if (entries.length > totalCount) return incomplete();
        cursor = nextCursor(data, chunk.length, seenCursors);
      } while (cursor);
      if (entries.length !== totalCount) return incomplete();
      return { entries, first };
    };

    const collectTips = async (): Promise<CashflowSnapshot["tipPayouts"]> => {
      const payouts: CashflowSnapshot["tipPayouts"] = [];
      const seenIds = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({ limit: String(TIP_PAGE_LIMIT) });
        if (cursor) params.set("cursor", cursor);
        const data = await read("tips", "/api/tip-payouts/list", params);
        const chunk = rows(data, "payouts", TIP_PAGE_LIMIT);
        for (const item of chunk) {
          const id = String(item.id ?? "").trim();
          if (!id) return incomplete();
          if (!seenIds.has(id)) payouts.push(item);
          seenIds.add(id);
        }
        cursor = nextCursor(data, chunk.length, seenCursors);
      } while (cursor);
      return payouts;
    };

    const collectSubscriptions = async (): Promise<CashflowSnapshot["subscriptionPayments"]> => {
      if (tipsterMode || !isSubscriptionCashflowOwner(effectiveEmail)) return [];
      const data = await read("subscriptions", "/api/subscription-payments/list", new URLSearchParams({ limit: String(SUBSCRIPTIONS_LIMIT) }));
      if (data.hasMore !== false) return incomplete();
      return rows(data, "payments", SUBSCRIPTIONS_LIMIT);
    };

    const collectStatements = async () => {
      const data = await read("statements", "/api/commission-statements", new URLSearchParams({ shape: "cashflow", limit: String(STATEMENTS_LIMIT) }));
      // This uses raw-query metadata, since deduplication can hide hitting the cap.
      if (data.hasMore !== false || data.processingComplete !== true) return incomplete();
      const items = rows(data, "items", STATEMENTS_LIMIT);
      if (items.some(item => typeof item.id !== "string" || !item.id.trim())) return incomplete();
      return dedupeCashflowCommissionStatements(items as CashflowCommissionStatementSummary[]);
    };

    const collectPortfolio = async (): Promise<Pick<CashflowSnapshot, "myPosition" | "myCommissionMode" | "hasAnyTeam" | "ownEntries" | "teamEntriesRaw">> => {
      if (tipsterMode) return { myPosition: null, myCommissionMode: null, hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [] };
      const own = await collectContracts("my");
      const hasTeam = own.first.hasTeam === true || (own.first.teamEmails as string[]).some(email => normalizeEmail(email));
      const teamEntriesRaw = hasTeam ? (await collectContracts("team")).entries : [];
      return {
        myPosition: (own.first.position ?? null) as CashflowSnapshot["myPosition"],
        myCommissionMode: (own.first.commissionMode ?? null) as CashflowSnapshot["myCommissionMode"],
        hasAnyTeam: hasTeam || teamEntriesRaw.length > 0,
        ownEntries: own.entries,
        teamEntriesRaw,
      };
    };

    const [portfolio, tipPayouts, subscriptionPayments, statements] = await Promise.all([
      collectPortfolio(), collectTips(), collectSubscriptions(), collectStatements(),
    ]);
    if (stopError) throw stopError;
    return {
      snapshot: { email: effectiveEmail, ...portfolio, tipPayouts, subscriptionPayments },
      statements,
      effectiveEmail,
      tipsterMode,
    };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    controller.abort();
    rejectStopped(new CashflowShadowInputsError("aborted", 499));
  }
}

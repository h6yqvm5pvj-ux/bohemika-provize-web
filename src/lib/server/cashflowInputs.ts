import { NextRequest } from "next/server";

import type { CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import { dedupeCashflowCommissionStatements } from "@/app/cashflow/helpers";
import { isSubscriptionCashflowOwner } from "@/app/cashflow/subscriptionCashflow";
import type { CashflowCommissionStatementSummary, EntryDoc } from "@/app/cashflow/types";
import { CASHFLOW_CONTRACTS_PAGE_SIZE } from "@/app/lib/cashflowPagination";
import { CASHFLOW_CONTRACT_TIMING_PHASES, type CashflowInputTimingName } from "@/app/cashflow/candidateCheckProtocol";
import type { CashflowContractTimingObserver } from "./cashflowContractTiming";
import type { AuthorizedContractsContext } from "@/app/api/contracts/_lib/contractsApi";

const CONTRACT_PAGE_LIMIT = CASHFLOW_CONTRACTS_PAGE_SIZE;
const TIP_PAGE_LIMIT = 100;
const STATEMENTS_LIMIT = 240;
const SUBSCRIPTIONS_LIMIT = 5_000;

type Source = "profile" | "own_contracts" | "team_contracts" | "tips" | "subscriptions" | "statements";
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

export type CashflowInputLoadOptions = {
  /** Evaluated after authentication, before any portfolio reads. */
  authorizeEmail?: (email: string) => boolean | Promise<boolean>;
  /** Bypass process-local role/team/subscription caches for a fenced candidate read. */
  freshCashflowContext?: boolean;
  /** Trusted server-only observer. No request/account/portfolio values are passed. */
  onSourceTiming?: (name: CashflowInputTimingName, durationMs: number) => void;
};

export type CashflowInputLimits = {
  maxRequests: number;
  maxDurationMs: number;
  maxContractRows: number;
};

// Preserve the diagnostic aggregate limit, including duplicate rows.
export const CASHFLOW_SHADOW_INPUT_LIMITS: CashflowInputLimits = {
  maxRequests: 50, maxDurationMs: 20_000, maxContractRows: 5_000,
};

type SharedLoadOptions = CashflowInputLoadOptions & {
  limits?: CashflowInputLimits;
  /** Server-verified context only; source handlers still authorize every read. */
  trustedProfile?: { email: string; accountType: "advisor" | "tipster" };
  /** Already loaded by the same authenticated server request. */
  statements?: CashflowCommissionStatementSummary[];
  /** Request-scoped capability issued by requireContractsEntryGuard. */
  authorizedContext?: AuthorizedContractsContext;
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

async function invoke(
  source: Source, request: NextRequest, freshCashflowContext: boolean,
  onCashflowTiming?: CashflowContractTimingObserver,
  onCashflowTeamReady?: (ownTotalCount: number) => void,
  authorizedContext?: AuthorizedContractsContext
): Promise<Response> {
  // Direct authorized handlers: no HTTP request, user supplied URL or auth bypass.
  switch (source) {
    case "profile":
      return (await import("@/app/api/user/profile/route")).GET(request);
    case "own_contracts":
    case "team_contracts":
      return (await import("@/app/api/contracts/_lib/contractsApi")).handleContractsList(request, {
        freshCashflowContext, ...(onCashflowTiming ? { onCashflowTiming } : {}),
        ...(authorizedContext ? { authorizedContext } : {}),
        ...(source === "own_contracts" && onCashflowTeamReady ? { onCashflowTeamReady } : {}),
      });
    case "tips":
      return (await import("@/app/api/tip-payouts/list/route")).GET(request);
    case "subscriptions":
      return (await import("@/app/api/subscription-payments/list/route")).GET(request);
    case "statements":
      return (await import("@/app/api/commission-statements/route")).GET(request);
  }
}

type SourceRead = (
  source: Source, path: string, params?: URLSearchParams,
  onCashflowTeamReady?: (ownTotalCount: number) => void
) => Promise<JsonObject>;

type CashflowReadScope = {
  read: SourceRead;
  wait: <T>(promise: Promise<T>) => Promise<T>;
  isActive: () => boolean;
  ensureActive: () => void;
};

async function withCashflowReads<T>(
  request: NextRequest,
  options: CashflowInputLoadOptions & { authorizedContext?: AuthorizedContractsContext },
  limits: CashflowInputLimits,
  work: (scope: CashflowReadScope) => Promise<T>
): Promise<T> {
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
  const timer = setTimeout(() => stop("timeout"), limits.maxDurationMs);
  let requests = 0;
  const read = async (
    source: Source, path: string, params?: URLSearchParams,
    onCashflowTeamReady?: (ownTotalCount: number) => void
  ): Promise<JsonObject> => {
    if (stopError) throw stopError;
    if (controller.signal.aborted) throw new CashflowShadowInputsError("aborted", 499);
    if (requests >= limits.maxRequests) throw new CashflowShadowInputsError("limit");
    requests += 1;
    const url = new URL(path, "http://cashflow-shadow.internal");
    if (params) url.search = params.toString();
    const child = new NextRequest(url, {
      method: "GET",
      headers: new Headers(request.headers),
      signal: controller.signal,
    });
    const started = options.onSourceTiming ? performance.now() : 0;
    const onCashflowTiming: CashflowContractTimingObserver | undefined = options.onSourceTiming &&
      (source === "own_contracts" || source === "team_contracts") ? (phase, durationMs) => {
        if (!CASHFLOW_CONTRACT_TIMING_PHASES.includes(phase) || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3_600_000) return;
        try { options.onSourceTiming?.(`cashflow_inputs_${source}_${phase}`, durationMs); }
        catch { /* Optional telemetry must not affect access checks or input loading. */ }
      } : undefined;
    try {
      const response = await Promise.race([invoke(source, child, options.freshCashflowContext === true, onCashflowTiming, onCashflowTeamReady, options.authorizedContext), stopped]);
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
    } finally {
      // Diagnostics cannot turn a successful read into an error, or conceal a failed read.
      try { options.onSourceTiming?.(`cashflow_inputs_${source}`, Math.max(0, performance.now() - started)); }
      catch { /* Optional telemetry must not affect data loading. */ }
    }
  };

  try {
    return await work({
      read,
      wait: promise => Promise.race([promise, stopped]),
      isActive: () => !stopError && !controller.signal.aborted,
      ensureActive: () => {
        if (stopError) throw stopError;
        if (controller.signal.aborted) throw new CashflowShadowInputsError("aborted", 499);
      },
    });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
    controller.abort();
    rejectStopped(new CashflowShadowInputsError("aborted", 499));
  }
}

function completeStatements(data: JsonObject): CashflowCommissionStatementSummary[] {
  // Raw-query metadata remains required: deduplication can conceal the cap.
  if (data.hasMore !== false || data.processingComplete !== true) return incomplete();
  const items = rows(data, "items", STATEMENTS_LIMIT);
  if (items.some(item => typeof item.id !== "string" || !item.id.trim())) return incomplete();
  return dedupeCashflowCommissionStatements(items as CashflowCommissionStatementSummary[]);
}

async function readCompleteStatements(read: SourceRead): Promise<CashflowCommissionStatementSummary[]> {
  return completeStatements(await read("statements", "/api/commission-statements",
    new URLSearchParams({ shape: "cashflow", limit: String(STATEMENTS_LIMIT) })));
}

/** Complete statement inputs through their ordinary authenticated handler. */
export async function loadCashflowStatements(
  request: NextRequest,
  options: Pick<CashflowInputLoadOptions, "onSourceTiming"> = {}
): Promise<CashflowCommissionStatementSummary[]> {
  return withCashflowReads(request, options, CASHFLOW_SHADOW_INPUT_LIMITS,
    async ({ read }) => readCompleteStatements(read));
}

/**
 * Complete, bounded source reads through the existing protected handlers.
 * These reads are not transactional and do not prove snapshot freshness.
 */
export async function loadCashflowInputs(
  request: NextRequest,
  options: SharedLoadOptions = {}
): Promise<CashflowShadowInputs> {
  const limits = options.limits ?? CASHFLOW_SHADOW_INPUT_LIMITS;
  return withCashflowReads(request, options, limits, async ({ read, wait, isActive, ensureActive }) => {
    let contractRows = 0;
    const declaredContractCounts = new Map<"my" | "team", number>();
    let declaredContractRows = 0;
    const reserveContractCount = (scope: "my" | "team", count: number) => {
      const reserved = declaredContractCounts.get(scope);
      if (reserved !== undefined) {
        if (reserved !== count) return incomplete();
        return;
      }
      if (count > limits.maxContractRows - declaredContractRows) throw new CashflowShadowInputsError("limit");
      declaredContractCounts.set(scope, count);
      declaredContractRows += count;
    };

    const profile: JsonObject = options.trustedProfile
      ? { email: options.trustedProfile.email, hasProfile: true, profile: { accountType: options.trustedProfile.accountType } }
      : await read("profile", "/api/user/profile");
    const effectiveEmail = normalizeEmail(profile.email);
    if (!effectiveEmail || !isObject(profile.profile) || profile.hasProfile !== true) return incomplete();
    if (options.authorizeEmail && !await wait(Promise.resolve(options.authorizeEmail(effectiveEmail)))) {
      throw new CashflowShadowInputsError("not_allowed", 403);
    }
    const accountType = typeof profile.profile.accountType === "string" ? profile.profile.accountType
      : typeof profile.profile.userRole === "string" ? profile.profile.userRole : "";
    const tipsterMode = accountType.trim().toLowerCase() === "tipster";

    const collectContracts = async (scope: "my" | "team", onCashflowTeamReady?: (ownTotalCount: number) => void) => {
      const entries: EntryDoc[] = [];
      const seenIds = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      let first: JsonObject | null = null;
      let totalCount = 0;
      do {
        const params = new URLSearchParams({ scope, limit: String(CONTRACT_PAGE_LIMIT), shape: "cashflow" });
        if (cursor) params.set("cursor", cursor);
        const data = await read(scope === "my" ? "own_contracts" : "team_contracts", "/api/contracts/list", params,
          cursor === null ? onCashflowTeamReady : undefined);
        if (!first) {
          first = data;
          if (typeof data.totalCount !== "number" || !Number.isSafeInteger(data.totalCount) || data.totalCount < 0) return incomplete();
          if (typeof data.hasTeam !== "boolean" || !Array.isArray(data.teamEmails) || !data.teamEmails.every(email => typeof email === "string")) return incomplete();
          totalCount = data.totalCount;
          reserveContractCount(scope, totalCount);
          if (totalCount > limits.maxContractRows - contractRows) throw new CashflowShadowInputsError("limit");
        } else if (data.totalCount != null && data.totalCount !== totalCount) {
          return incomplete();
        }
        const chunk = rows(data, "contracts", CONTRACT_PAGE_LIMIT);
        if (chunk.length > limits.maxContractRows - contractRows) throw new CashflowShadowInputsError("limit");
        contractRows += chunk.length;
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

    const collectStatements = async () => options.statements === undefined
      ? readCompleteStatements(read)
      : completeStatements({ items: options.statements, hasMore: false, processingComplete: true });

    const collectPortfolio = async (): Promise<Pick<CashflowSnapshot, "myPosition" | "myCommissionMode" | "hasAnyTeam" | "ownEntries" | "teamEntriesRaw">> => {
      if (tipsterMode) return { myPosition: null, myCommissionMode: null, hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [] };
      let team: ReturnType<typeof collectContracts> | undefined;
      const onCashflowTeamReady = options.freshCashflowContext ? (ownTotalCount: number) => {
        if (team || !isActive() ||
          !Number.isSafeInteger(ownTotalCount) || ownTotalCount < 0 || ownTotalCount > limits.maxContractRows) return;
        // Reserve the whole declared own portfolio before launching the team,
        // so interleaving cannot defer rejection of an oversized combined read.
        reserveContractCount("my", ownTotalCount);
        team = collectContracts("team");
        // A fast team denial must not become an unhandled rejection while own
        // pages finish. Await the original promise below and propagate its error.
        void team.catch(() => undefined);
      } : undefined;
      const own = await collectContracts("my", onCashflowTeamReady);
      const hasTeam = own.first.hasTeam === true || (own.first.teamEmails as string[]).some(email => normalizeEmail(email));
      const teamEntriesRaw = hasTeam ? (await (team ?? collectContracts("team"))).entries : [];
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
    ensureActive();
    return {
      snapshot: { email: effectiveEmail, ...portfolio, tipPayouts, subscriptionPayments },
      statements,
      effectiveEmail,
      tipsterMode,
    };
  });
}

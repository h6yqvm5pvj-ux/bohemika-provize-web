// @vitest-environment happy-dom

import { webcrypto } from "node:crypto";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CASHFLOW_SHADOW_MAX_AGE_MS, hashCashflowValue } from "./shadowProtocol";
import type { reportCashflowShadow as Reporter } from "./reportCashflowShadow";

type ReportInput = Parameters<typeof Reporter>[0];

describe("reportCashflowShadow", () => {
  let report: typeof Reporter;
  let now: number;
  let visibility: DocumentVisibilityState;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let user: User;

  const matched = { ok: true, status: "match", itemsMatch: true, monthsMatch: true } as const;
  const verified = { ...matched, candidate: "verified" } as const;
  const storedSummary = () => JSON.parse(sessionStorage.getItem("cashflow_shadow_last_result") ?? "null");

  const input = (): ReportInput => {
    const item = {
      id: "private-entry-payout-id",
      date: new Date(now),
      amount: 7_774_321.89,
      productKey: "cppAuto" as const,
      clientName: "Private Client Name",
      contractNumber: "PRIVATE-CONTRACT-NUMBER",
      ownerEmail: "private-owner@example.cz",
      entryId: "private-entry-id",
    };
    return {
      user,
      snapshot: {
        email: "private-owner@example.cz",
        myPosition: "poradce3",
        myCommissionMode: "standard",
        hasAnyTeam: false,
        ownEntries: [{
          id: item.entryId,
          userEmail: item.ownerEmail,
          productKey: item.productKey,
          clientName: item.clientName,
          contractNumber: item.contractNumber,
          items: [{ title: "Private commission title", amount: item.amount, code: "A101" }],
        }],
        teamEntriesRaw: [],
        tipPayouts: [],
        subscriptionPayments: [],
      },
      statements: [{
        id: "private-statement-id",
        fileName: "private-statement-filename.html",
        statementNumber: "private-statement-number",
        statementDate: null,
        period: "2026-09",
        advisorNumber: "private-advisor-number",
        periodStartMs: null,
        periodEndMs: null,
        statementDateMs: null,
        payoutMonthKey: "2026-10",
        paidContractNumbers: [item.contractNumber],
        paidCommissionKeys: [],
        commissionTotal: item.amount,
        payoutTotal: item.amount,
        otherPaymentsTotal: 0,
        managerCommissionTotal: 0,
        createdAtMs: now,
        updatedAtMs: now,
      }],
      items: [item],
      months: [{
        key: "2026-09",
        year: 2026,
        monthIndex: 8,
        label: "září",
        total: item.amount,
        predictedTotal: item.amount,
        totalSource: "predicted",
        statementPayoutTotal: null,
        items: [item],
      }],
      options: {
        scopeFilter: "combined",
        productFilter: "all",
        tipsterMode: false,
        showPastYears: false,
        intelligentPredictionEnabled: false,
        contractNumberQuery: "",
      },
      asOf: new Date(now),
      signal: new AbortController().signal,
    };
  };

  beforeEach(async () => {
    vi.resetModules();
    now = new Date(2026, 8, 12, 12).getTime();
    visibility = "visible";
    sessionStorage.clear();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.stubGlobal("crypto", webcrypto);
    user = { uid: "authenticated-uid", email: "private-owner@example.cz", getIdToken: vi.fn(async () => "test-token") } as unknown as User;
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(matched));
    vi.stubGlobal("fetch", fetchMock);
    report = (await import("./reportCashflowShadow")).reportCashflowShadow;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends only real fingerprints and calculation context, with authenticated no-store transport", async () => {
    const args = input();
    const before = structuredClone({ snapshot: args.snapshot, statements: args.statements, items: args.items, months: args.months });
    expect(await report(args)).toEqual(matched);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/cashflow/shadow");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", signal: args.signal });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      version: "cashflow-shadow-v1",
      asOfMs: now,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      inputHash: await hashCashflowValue({ snapshot: args.snapshot, statements: args.statements }),
      itemsHash: await hashCashflowValue(args.items),
      monthsHash: await hashCashflowValue(args.months),
      options: args.options,
    });
    expect([body.inputHash, body.itemsHash, body.monthsHash].every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
    expect(String(init?.body)).not.toMatch(/private|7774321|Private Client/i);
    expect({ snapshot: args.snapshot, statements: args.statements, items: args.items, months: args.months }).toEqual(before);
  });

  it("does no hashing or network work in a hidden tab, and allows the visible attempt", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    visibility = "hidden";
    expect(await report(input())).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    visibility = "visible";
    expect(await report(input())).toEqual(matched);
  });

  it("skips impersonated accounts before hashing and accepts a normalized own-account email", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    const args = input();
    args.snapshot.email = "impersonated@example.cz";
    expect(await report(args)).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    const normalizedUser = { ...user, email: "  PRIVATE-OWNER@EXAMPLE.CZ " } as User;
    expect(await report({ ...input(), user: normalizedUser })).toEqual(matched);
  });

  it("skips a calculation from the previous local day even when less than five minutes old", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    now = new Date(2026, 8, 13, 0, 1).getTime();
    const asOf = new Date(2026, 8, 12, 23, 59);
    expect(now - asOf.getTime()).toBeLessThan(CASHFLOW_SHADOW_MAX_AGE_MS);
    expect(await report({ ...input(), asOf })).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await report(input())).toEqual(matched);
  });

  it("skips more than 25,000 cashflow items before hashing or requesting a comparison", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    const args = input();
    args.items = Array.from({ length: 25_001 }, () => args.items[0]);
    expect(await report(args)).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await report(input())).toEqual(matched);
  });

  it("does no hashing or network work for an already aborted render", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    const controller = new AbortController();
    controller.abort();
    expect(await report({ ...input(), signal: controller.signal })).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await report(input())).toEqual(matched);
  });

  it.each(["past", "future", "invalid"] as const)("skips %s calculation context before hashing", async (kind) => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    const asOf = kind === "invalid" ? new Date(Number.NaN) : new Date(now + (kind === "past" ? -1 : 1) * (CASHFLOW_SHADOW_MAX_AGE_MS + 1));
    expect(await report({ ...input(), asOf })).toBeNull();
    expect(digest).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await report(input())).toEqual(matched);
  });

  it("throttles hashing and requests for five minutes during concurrent renders and filter changes", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    const results = await Promise.all([
      report(input()),
      report(input()),
      report({ ...input(), options: { ...input().options, productFilter: "life" } }),
    ]);
    expect(results).toEqual([matched, null, null]);
    expect(digest).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += CASHFLOW_SHADOW_MAX_AGE_MS - 1;
    expect(await report(input())).toBeNull();
    expect(digest).toHaveBeenCalledTimes(3);
    now += 1;
    expect(await report(input())).toEqual(matched);
    expect(digest).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the throttle separate for authenticated UIDs and effective accounts", async () => {
    expect(await report(input())).toEqual(matched);
    const otherAccount = input();
    otherAccount.snapshot.email = "other-effective@example.cz";
    otherAccount.user = { ...user, email: "other-effective@example.cz" } as User;
    expect(await report(otherAccount)).toEqual(matched);
    const otherUser = { ...user, uid: "other-authenticated-uid" } as User;
    expect(await report({ ...input(), user: otherUser })).toEqual(matched);
    expect(await report(input())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["aborted", "hidden", "stale"] as const)("skips the request if the render becomes %s during hashing", async (kind) => {
    const controller = new AbortController();
    const gate = Promise.withResolvers<void>();
    const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
    const digest = vi.spyOn(webcrypto.subtle, "digest").mockImplementation(async (...args) => {
      await gate.promise;
      return realDigest(...args);
    });
    const pending = report({ ...input(), signal: controller.signal });
    expect(digest).toHaveBeenCalledTimes(3);
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    gate.resolve();
    expect(await pending).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["aborted", "hidden", "stale", "account"] as const)("does not fetch when context becomes %s while obtaining a token", async (kind) => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const token = Promise.withResolvers<string>();
    vi.mocked(user.getIdToken).mockImplementationOnce(() => {
      started.resolve();
      return token.promise;
    });
    const pending = report({ ...input(), signal: controller.signal });
    await started.promise;
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    if (kind === "account") Object.assign(user, { email: "different@example.test" });
    token.resolve("late-token");
    expect(await pending).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["visible", "hidden"] as const)("retries 401 with a refreshed token only if the tab remains visible (%s)", async (nextVisibility) => {
    const refreshStarted = Promise.withResolvers<void>();
    const refreshedToken = Promise.withResolvers<string>();
    vi.mocked(user.getIdToken)
      .mockResolvedValueOnce("expired-token")
      .mockImplementationOnce(() => {
        refreshStarted.resolve();
        return refreshedToken.promise;
      });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Expired" }, { status: 401 }));
    const args = input();
    const pending = report(args);
    await refreshStarted.promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer expired-token");
    expect(vi.mocked(user.getIdToken).mock.calls).toEqual([[false], [true]]);
    visibility = nextVisibility;
    refreshedToken.resolve("refreshed-token");
    expect(await pending).toEqual(nextVisibility === "visible" ? matched : null);
    expect(fetchMock).toHaveBeenCalledTimes(nextVisibility === "visible" ? 2 : 1);
    if (nextVisibility === "visible") {
      const retry = fetchMock.mock.calls[1][1];
      expect(new Headers(retry?.headers).get("Authorization")).toBe("Bearer refreshed-token");
      expect(retry).toMatchObject({ body: fetchMock.mock.calls[0][1]?.body, signal: args.signal, cache: "no-store" });
    }
  });

  it.each(["aborted", "hidden", "stale"] as const)("ignores late successful responses when the render is %s", async (kind) => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const deferred = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return deferred.promise;
    });
    const pending = report({ ...input(), signal: controller.signal });
    await started.promise;
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    deferred.resolve(Response.json(matched));
    expect(await pending).toBeNull();
  });

  it.each(["hash", "auth", "network", "server"] as const)("isolates %s failures and throttles retries", async (kind) => {
    if (kind === "hash") vi.spyOn(webcrypto.subtle, "digest").mockRejectedValue(new Error("Hash unavailable"));
    if (kind === "auth") vi.mocked(user.getIdToken).mockRejectedValue(new Error("Signed out"));
    if (kind === "network") fetchMock.mockRejectedValue(new Error("Network unavailable"));
    if (kind === "server") fetchMock.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    expect(await report(input())).toBeNull();
    const attempts = fetchMock.mock.calls.length;
    expect(attempts).toBe(kind === "hash" || kind === "auth" ? 0 : 1);
    expect(await report(input())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
  });

  it("returns mismatches and skipped comparisons without replacing the supplied cashflow", async () => {
    const args = input();
    const before = structuredClone({ items: args.items, months: args.months });
    const mismatch = { ok: true, status: "mismatch", itemsMatch: false, monthsMatch: true };
    fetchMock.mockResolvedValueOnce(Response.json(mismatch));
    expect(await report(args)).toEqual(mismatch);
    now += CASHFLOW_SHADOW_MAX_AGE_MS;
    const skipped = { ok: true, status: "skipped", reason: "different_inputs" };
    fetchMock.mockResolvedValueOnce(Response.json(skipped));
    expect(await report({ ...args, asOf: new Date(now) })).toEqual(skipped);
    expect({ items: args.items, months: args.months }).toEqual(before);
  });

  it("replays one verified candidate with identical context and persists only numerical aggregates", async () => {
    const digest = vi.spyOn(webcrypto.subtle, "digest");
    vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(125).mockReturnValueOnce(130).mockReturnValueOnce(137);
    vi.mocked(user.getIdToken).mockResolvedValueOnce("shadow-token").mockResolvedValueOnce("check-token");
    fetchMock
      .mockResolvedValueOnce(Response.json({ ...verified, email: "private@example.test", amount: 123 }, { headers: {
        "Server-Timing": 'cashflow_total;dur=20, cashflow_inputs;dur=15;desc="private text", other;dur=999',
      } }))
      .mockResolvedValueOnce(Response.json({ ...matched, inputHash: "private-hash", options: { private: true } }, { headers: {
        "Server-Timing": "cashflow_total;dur=4.5, cashflow_storage;dur=3, cashflow_hash;dur=Infinity",
      } }));
    const args = input();
    const before = structuredClone({ items: args.items, months: args.months });
    expect(await report(args)).toEqual(verified);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(3);
    const [shadowUrl, shadowRequest] = fetchMock.mock.calls[0];
    const [checkUrl, checkRequest] = fetchMock.mock.calls[1];
    expect(shadowUrl).toBe("/api/cashflow/shadow");
    expect(checkUrl).toBe("/api/cashflow/candidate-check");
    expect(checkRequest).toMatchObject({ body: shadowRequest?.body, method: "POST", cache: "no-store", signal: args.signal });
    expect(new Headers(checkRequest?.headers).get("Authorization")).toBe("Bearer check-token");
    expect(vi.mocked(user.getIdToken).mock.calls).toEqual([[false], [false]]);
    expect(storedSummary()).toEqual({
      version: "cashflow-shadow-v1",
      shadow: { status: "match", candidate: "verified", requestMs: 25, serverTimingMs: { cashflow_total: 20, cashflow_inputs: 15 } },
      check: { status: "match", requestMs: 7, serverTimingMs: { cashflow_total: 4.5, cashflow_storage: 3 } },
    });
    expect(sessionStorage.getItem("cashflow_shadow_last_result")).not.toMatch(/private|123|authenticated|hash|options|amount|email/i);
    expect({ items: args.items, months: args.months }).toEqual(before);
    expect(await report(input())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    matched,
    { ...matched, candidate: "not_stored" },
    { ...matched, candidate: "revision_changed" },
    { ...matched, candidate: "storage_mismatch" },
    { ok: true, status: "mismatch", itemsMatch: false, monthsMatch: true, candidate: "not_stored" },
    { ok: true, status: "skipped", reason: "different_inputs" },
  ])("does not request a replay for unverified outcomes %j", async result => {
    fetchMock.mockResolvedValueOnce(Response.json(result));
    expect(await report(input())).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedSummary()).toMatchObject({ version: "cashflow-shadow-v1", shadow: { status: result.status } });
    expect(storedSummary().check).toBeUndefined();
  });

  it.each(["401", "403", "429", "503", "network", "json", "bogus"] as const)("preserves the shadow result after a %s replay failure without retry or fallback", async kind => {
    fetchMock.mockResolvedValueOnce(Response.json(verified));
    if (kind === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    else if (kind === "json") fetchMock.mockResolvedValueOnce(new Response("invalid-json"));
    else if (kind === "bogus") fetchMock.mockResolvedValueOnce(Response.json({ ...matched, status: "mismatch", email: "private@example.test" }));
    else fetchMock.mockResolvedValueOnce(Response.json({ error: "private backend failure" }, { status: Number(kind) }));
    expect(await report(input())).toEqual(verified);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(user.getIdToken).mock.calls).toEqual([[false], [false]]);
    expect(storedSummary().shadow).toMatchObject({ status: "match", candidate: "verified" });
    expect(storedSummary().check).toBeUndefined();
    expect(await report(input())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the shadow result when only the replay token cannot be obtained", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(verified));
    vi.mocked(user.getIdToken).mockResolvedValueOnce("shadow-token").mockRejectedValueOnce(new Error("token unavailable"));
    expect(await report(input())).toEqual(verified);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedSummary().shadow).toMatchObject({ status: "match", candidate: "verified" });
    expect(storedSummary().check).toBeUndefined();
  });

  it.each([
    { ok: true, status: "miss" },
    { ok: true, status: "skipped", reason: "different_inputs" },
    { ok: true, status: "mismatch", itemsMatch: true, monthsMatch: false },
  ])("records a valid replay outcome %j without changing the shadow result", async check => {
    fetchMock.mockResolvedValueOnce(Response.json(verified)).mockResolvedValueOnce(Response.json(check));
    expect(await report(input())).toEqual(verified);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storedSummary().check).toMatchObject({ status: check.status });
    if ("reason" in check) expect(storedSummary().check.reason).toBe(check.reason);
    else expect(storedSummary().check).not.toHaveProperty("reason");
  });

  it("retains only a known skip reason for pilot diagnosis", async () => {
    const result = { ok: true, status: "skipped", reason: "time_zone", details: "private account information" };
    fetchMock.mockResolvedValueOnce(Response.json(result));
    expect(await report(input())).toEqual({ ok: true, status: "skipped", reason: "time_zone" });
    expect(storedSummary().shadow).toMatchObject({ status: "skipped", reason: "time_zone" });
    expect(sessionStorage.getItem("cashflow_shadow_last_result")).not.toContain("private");
  });

  it.each(["aborted", "hidden", "stale", "account"] as const)("does not replay or persist when %s while obtaining the replay token", async kind => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const token = Promise.withResolvers<string>();
    vi.mocked(user.getIdToken).mockResolvedValueOnce("shadow-token").mockImplementationOnce(() => {
      started.resolve(); return token.promise;
    });
    fetchMock.mockResolvedValueOnce(Response.json(verified));
    const pending = report({ ...input(), signal: controller.signal });
    await started.promise;
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    if (kind === "account") Object.assign(user, { email: "different@example.test" });
    token.resolve("late-token");
    expect(await pending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedSummary()).toBeNull();
  });

  it.each(["aborted", "hidden", "stale", "account"] as const)("discards a replay response when context becomes %s", async kind => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const response = Promise.withResolvers<Response>();
    fetchMock.mockResolvedValueOnce(Response.json(verified)).mockImplementationOnce(() => {
      started.resolve(); return response.promise;
    });
    const pending = report({ ...input(), signal: controller.signal });
    await started.promise;
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    if (kind === "account") Object.assign(user, { uid: "different-user" });
    response.resolve(Response.json(matched));
    expect(await pending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storedSummary()).toBeNull();
  });

  it.each([
    ["shadow", "aborted"], ["shadow", "hidden"], ["shadow", "stale"], ["shadow", "account"],
    ["check", "aborted"], ["check", "hidden"], ["check", "stale"], ["check", "account"],
  ] as const)("honors %s response decoding becoming %s before starting another request or persisting", async (stage, kind) => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const parsed = Promise.withResolvers<unknown>();
    const response = Response.json(stage === "shadow" ? verified : matched);
    vi.spyOn(response, "json").mockImplementationOnce(() => {
      started.resolve(); return parsed.promise;
    });
    if (stage === "check") fetchMock.mockResolvedValueOnce(Response.json(verified));
    fetchMock.mockResolvedValueOnce(response);
    const pending = report({ ...input(), signal: controller.signal });
    await started.promise;
    if (kind === "aborted") controller.abort();
    if (kind === "hidden") visibility = "hidden";
    if (kind === "stale") now += CASHFLOW_SHADOW_MAX_AGE_MS + 1;
    if (kind === "account") Object.assign(user, { email: "different@example.test" });
    parsed.resolve(stage === "shadow" ? verified : matched);
    expect(await pending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(stage === "shadow" ? 1 : 2);
    expect(storedSummary()).toBeNull();
  });

  it.each([
    { ...verified, status: "mismatch" },
    { ...verified, itemsMatch: "true" },
    { ok: true, status: "skipped", reason: "private reason", candidate: "verified" },
  ])("excludes bogus shadow results from replay and storage: %j", async bogus => {
    fetchMock.mockResolvedValueOnce(Response.json(bogus));
    expect(await report(input())).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storedSummary()).toBeNull();
  });

  it("ignores denied session storage without changing a valid diagnostic result", async () => {
    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    expect(await report(input())).toEqual(matched);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } from "@/app/cashflow/subscriptionCashflow";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), contracts: vi.fn(), setup: vi.fn(), admin: vi.fn() }));
vi.mock("@/app/api/user/profile/route", () => ({ GET: mocks.profile }));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.contracts }));
vi.mock("./advisorSetupGuard", () => ({ getAdvisorSetupError: mocks.setup }));
vi.mock("./adminAuth", () => ({ getAdminAuthContext: mocks.admin }));
import { authorizeCashflowCandidateRead } from "./cashflowCandidateAccess";

const identity = { email: "advisor@example.test", uid: "advisor-uid" };
const owner = { email: SUBSCRIPTION_CASHFLOW_OWNER_EMAIL, uid: "owner-uid" };
const profile = (email = identity.email, accountType = "advisor") => ({ ok: true, hasProfile: true, email, profile: { accountType } });
const guard = (current = identity) => ({ ok: true, ctx: { ...current, accountType: "advisor", isImpersonating: false } });
const request = (signal?: AbortSignal) => new NextRequest("https://example.test/api/cashflow/candidate-check?targetEmail=victim@example.test", {
  method: "POST", headers: { Authorization: "Bearer synthetic-token", Cookie: "synthetic-cookie", "X-Request-ID": "synthetic-request" },
  body: JSON.stringify({ email: "victim@example.test" }), signal,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.profile.mockImplementation(async () => Response.json(profile()));
  mocks.contracts.mockResolvedValue(guard());
  mocks.setup.mockResolvedValue(null);
  mocks.admin.mockResolvedValue({ adminEmail: owner.email, adminUid: owner.uid, adminRole: "owner" });
});

describe("fresh authorization for diagnostic candidate reads", () => {
  it("reads the fixed profile endpoint with original auth context and fresh contract access", async () => {
    const req = request();
    expect(await authorizeCashflowCandidateRead(req, identity, false)).toBe(true);
    const child: NextRequest = mocks.profile.mock.calls[0][0];
    expect(child.url).toBe("http://cashflow-candidate.internal/api/user/profile");
    expect(child.method).toBe("GET");
    expect(child.body).toBeNull();
    expect(Array.from(child.headers)).toEqual(Array.from(req.headers));
    expect(mocks.contracts).toHaveBeenCalledExactlyOnceWith(req, {
      namespace: "api:cashflow:candidate-access", limit: 30, windowMs: 60_000,
    }, { freshCashflowContext: true });
    // The real contracts guard includes setup/MFA checks itself.
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([
    null, [], { ok: false }, { ...profile(), hasProfile: false },
    { ...profile(), profile: null }, { ...profile(), profile: [] },
    { ...profile(), email: "victim@example.test" },
  ])("rejects an incomplete or different profile %j before other access checks", async body => {
    mocks.profile.mockResolvedValue(Response.json(body));
    expect(await authorizeCashflowCandidateRead(request(), identity, false)).toBe(false);
    expect(mocks.contracts).not.toHaveBeenCalled();
    expect(mocks.setup).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500])("rejects profile HTTP %s", async status => {
    mocks.profile.mockResolvedValue(new Response(null, { status }));
    expect(await authorizeCashflowCandidateRead(request(), identity, false)).toBe(false);
    expect(mocks.contracts).not.toHaveBeenCalled();
  });

  it("rejects invalid profile JSON without leaking its contents", async () => {
    mocks.profile.mockResolvedValue(new Response("private invalid response"));
    expect(await authorizeCashflowCandidateRead(request(), identity, false)).toBe(false);
  });

  it.each([["tipster", false], ["advisor", true]] as const)("rejects changed role %s for tipster mode %s", async (role, mode) => {
    mocks.profile.mockResolvedValue(Response.json(profile(identity.email, role)));
    expect(await authorizeCashflowCandidateRead(request(), identity, mode)).toBe(false);
    expect(mocks.contracts).not.toHaveBeenCalled();
    expect(mocks.setup).not.toHaveBeenCalled();
  });

  it("normalizes the server profile email and legacy role, then checks tipster access", async () => {
    mocks.profile.mockResolvedValue(Response.json({ ...profile(" ADVISOR@EXAMPLE.TEST "), profile: { userRole: " TIPSTER " } }));
    expect(await authorizeCashflowCandidateRead(request(), identity, true)).toBe(true);
    expect(mocks.setup).toHaveBeenCalledExactlyOnceWith(identity);
    expect(mocks.contracts).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects a fresh tipster setup failure", async () => {
    mocks.profile.mockResolvedValue(Response.json(profile(identity.email, "tipster")));
    mocks.setup.mockResolvedValue({ status: 403, error: "changed setup" });
    expect(await authorizeCashflowCandidateRead(request(), identity, true)).toBe(false);
  });

  it.each([
    { ok: false, response: new Response(null, { status: 403 }) },
    { ok: true, ctx: { ...guard().ctx, uid: "another-uid" } },
    { ok: true, ctx: { ...guard().ctx, email: "victim@example.test" } },
    { ok: true, ctx: { ...guard().ctx, accountType: "tipster" } },
    { ok: true, ctx: { ...guard().ctx, isImpersonating: true } },
  ])("rejects a denied or changed contract authorization %j", async result => {
    mocks.contracts.mockResolvedValue(result);
    expect(await authorizeCashflowCandidateRead(request(), identity, false)).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("requires owner-role authorization for cashflow subscription payments", async () => {
    mocks.profile.mockResolvedValue(Response.json(profile(owner.email)));
    mocks.contracts.mockResolvedValue(guard(owner));
    const req = request();
    expect(await authorizeCashflowCandidateRead(req, owner, false)).toBe(true);
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith(req, { minimumRole: "owner", actionLabel: "cashflow předplatného" });
  });

  it.each([
    { error: "owner role revoked", status: 403 },
    { adminEmail: owner.email, adminUid: "other-uid" },
    { adminEmail: "other@example.test", adminUid: owner.uid },
  ])("rejects revoked or mismatched subscription access %j", async result => {
    mocks.profile.mockResolvedValue(Response.json(profile(owner.email)));
    mocks.contracts.mockResolvedValue(guard(owner));
    mocks.admin.mockResolvedValue(result);
    expect(await authorizeCashflowCandidateRead(request(), owner, false)).toBe(false);
  });

  it("does not load subscription authorization for tipster-only cashflow", async () => {
    mocks.profile.mockResolvedValue(Response.json(profile(owner.email, "tipster")));
    expect(await authorizeCashflowCandidateRead(request(), owner, true)).toBe(true);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["profile", "contracts", "setup", "admin"] as const)("contains thrown %s failures", async dependency => {
    const current = dependency === "admin" ? owner : identity;
    const tipsterMode = dependency === "setup";
    mocks.profile.mockResolvedValue(Response.json(profile(current.email, tipsterMode ? "tipster" : "advisor")));
    mocks.contracts.mockResolvedValue(guard(current));
    mocks[dependency].mockRejectedValue(new Error("private authorization details"));
    expect(await authorizeCashflowCandidateRead(request(), current, tipsterMode)).toBe(false);
  });

  it("does no work for an already aborted request or invalid trusted identity", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await authorizeCashflowCandidateRead(request(controller.signal), identity, false)).toBe(false);
    expect(await authorizeCashflowCandidateRead(request(), { ...identity, uid: "" }, false)).toBe(false);
    expect(await authorizeCashflowCandidateRead(request(), { ...identity, email: " Advisor@example.test " }, false)).toBe(false);
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("relays abort to the profile request and stops subsequent authorization", async () => {
    const controller = new AbortController();
    mocks.profile.mockImplementation(async (child: NextRequest) => {
      controller.abort();
      expect(child.signal.aborted).toBe(true);
      return Response.json(profile());
    });
    expect(await authorizeCashflowCandidateRead(request(controller.signal), identity, false)).toBe(false);
    expect(mocks.contracts).not.toHaveBeenCalled();
  });

  it.each(["contracts", "setup", "admin"] as const)("discards completion after abort during %s", async dependency => {
    const controller = new AbortController();
    const current = dependency === "admin" ? owner : identity;
    const tipsterMode = dependency === "setup";
    mocks.profile.mockResolvedValue(Response.json(profile(current.email, tipsterMode ? "tipster" : "advisor")));
    mocks.contracts.mockResolvedValue(guard(current));
    mocks[dependency].mockImplementation(async () => {
      controller.abort();
      return dependency === "contracts" ? guard(current)
        : dependency === "admin" ? { adminEmail: owner.email, adminUid: owner.uid } : null;
    });
    expect(await authorizeCashflowCandidateRead(request(controller.signal), current, tipsterMode)).toBe(false);
  });
});

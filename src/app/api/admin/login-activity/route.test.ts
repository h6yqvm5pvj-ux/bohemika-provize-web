import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), web: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/server/adminAuth", () => ({ getAdminAuthContext: state.auth, adminAuthErrorResponse: (ctx: { status: number; error: string }) => NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status }) }));
vi.mock("@/lib/server/rateLimit", () => ({ consumeRateLimit: state.rate }));
vi.mock("@/lib/server/loginActivity", () => ({ readLoginActivity: state.web }));
vi.mock("@/lib/server/firebaseLoginActivity", () => ({ readFirebaseLoginActivity: state.provider }));
import { GET } from "./route";
const req = (query = "") => new NextRequest(`https://bohemka.app/api/admin/login-activity${query}`);
beforeEach(() => { vi.clearAllMocks(); state.auth.mockResolvedValue({ adminUid: "admin-1" }); state.rate.mockResolvedValue({ allowed: true }); state.web.mockResolvedValue({ ok: true, events: [] }); state.provider.mockResolvedValue({ ok: true, events: [] }); });
it.each([401, 403])("denies unauthorized access (%s) before any history read", async status => {
  state.auth.mockResolvedValue({ status, error: "Denied" }); const response = await GET(req()); expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toContain("no-store"); expect(state.web).not.toHaveBeenCalled(); expect(state.provider).not.toHaveBeenCalled();
});
it("requires the admin role and makes authorized responses non-cacheable", async () => {
  const response = await GET(req("?days=7")); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(state.auth).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ minimumRole: "admin" })); expect(state.web).toHaveBeenCalledWith(7, null);
});
it.each(["?days=999", "?source=all-logs"])("rejects unsupported query %s", async query => { expect((await GET(req(query))).status).toBe(400); expect(state.web).not.toHaveBeenCalled(); });
it("selects the provider source explicitly", async () => { await GET(req("?days=30&source=firebase")); expect(state.provider).toHaveBeenCalledWith(30, null); expect(state.web).not.toHaveBeenCalled(); });
it("does not expose backend errors or report an empty history on failure", async () => {
  state.web.mockRejectedValue(new Error("private backend detail")); const response = await GET(req()); expect(response.status).toBe(503);
  const body = await response.json(); expect(body.ok).toBe(false); expect(body.events).toBeUndefined(); expect(body.error).not.toContain("private backend detail");
});
it("fails closed when rate-limit storage is unavailable", async () => { state.rate.mockResolvedValue({ allowed: false, store: "unavailable" }); expect((await GET(req())).status).toBe(503); expect(state.web).not.toHaveBeenCalled(); });

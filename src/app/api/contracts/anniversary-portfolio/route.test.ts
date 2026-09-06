import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn(), db: {} }));
vi.mock("@/lib/server/firebaseAdmin", () => ({ adminDb: mocks.db }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("../_lib/contractsApi.anniversaryPortfolio", async importOriginal => ({
  ...await importOriginal<typeof import("../_lib/contractsApi.anniversaryPortfolio")>(),
  readAnniversaryPortfolioPage: mocks.read,
}));
import { GET } from "./route";
import { InvalidPortfolioCursorError } from "../_lib/contractsApi.anniversaryPortfolio";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: {
    email: "own@example.test", teamEmails: ["team@example.test"], accountType: "advisor",
    position: "manazer4", contractAccessEmails: ["team@example.test", "admin-only@example.test"],
  }, withRateLimit: (response: NextResponse) => response });
  mocks.read.mockResolvedValue({ contracts: [], hasMore: false, nextCursor: null });
});

describe("anniversary portfolio API", () => {
  it("uses only the server's own/team scope and forbids caching", async () => {
    const response = await GET(new NextRequest("https://example.test/api/contracts/anniversary-portfolio?ownerEmail=other@example.test&cursor=page2"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ db: mocks.db, owners: ["own@example.test", "team@example.test"], cursor: "page2" });
    expect(await response.json()).toMatchObject({ ok: true, hasMore: false });
  });

  it("rejects unauthenticated access before reading the portfolio", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await GET(new NextRequest("https://example.test/api/contracts/anniversary-portfolio"))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects tipster accounts before reading contracts", async () => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { accountType: "tipster" }, withRateLimit: (response: NextResponse) => response });
    expect((await GET(new NextRequest("https://example.test/api/contracts/anniversary-portfolio"))).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("returns a retryable error rather than a partial success on a database failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.read.mockRejectedValue(new Error("database unavailable"));
      const response = await GET(new NextRequest("https://example.test/api/contracts/anniversary-portfolio"));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ ok: false });
    } finally { log.mockRestore(); }
  });

  it("rejects a cursor that no longer belongs to the accessible team", async () => {
    mocks.read.mockRejectedValue(new InvalidPortfolioCursorError("Reload"));
    expect((await GET(new NextRequest("https://example.test/api/contracts/anniversary-portfolio?cursor=old"))).status).toBe(400);
  });
});

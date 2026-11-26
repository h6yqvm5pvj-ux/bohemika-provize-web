import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), loadStored: vi.fn() }));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/toolDocuments", () => ({ loadStoredToolDocument: mocks.loadStored, storageBucketCandidates: () => [] }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, ctx: {} });
  mocks.loadStored.mockResolvedValue({ publicDoc: null, stored: null, fallback: null });
});

describe.each([
  { id: "life-record-health-assessment-example", width: 1200, height: 1082 },
  { id: "life-record-discrepancies-example", width: 2566, height: 974 },
])("meeting record example $id", ({ id, width, height }) => {
  it("serves the bundled original PNG through the protected document endpoint", async () => {
    const response = await GET(new NextRequest(`https://example.test/api/documents/file?id=${id}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(width);
    expect(bytes.readUInt32BE(20)).toBe(height);
  });

  it("returns the authentication rejection before resolving an image", async () => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    const response = await GET(new NextRequest(`https://example.test/api/documents/file?id=${id}`));
    expect(response.status).toBe(401);
    expect(mocks.loadStored).not.toHaveBeenCalled();
  });
});

describe.each([
  ["koop-odzam-neuron-2026-09", "KOOP NEURON ODZAM 261102-04.pdf"],
  ["koop-obcan-neuron-2026-09", "KOOP NEURON OBCAN 261028-03.pdf"],
])("commission document %s", (id, fileName) => {
  const url = `https://example.test/api/documents/file?id=${id}`;

  it("serves the bundled PDF to an authorized advisor", async () => {
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(response.headers.get("content-disposition")).toContain(encodeURIComponent(fileName));
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it.each([401, 403])("rejects denied access (%i) even if the request claims an advisor role", async (status) => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });
    const response = await GET(new NextRequest(`${url}&role=advisor`));
    expect(response.status).toBe(status);
    expect(mocks.loadStored).not.toHaveBeenCalled();
  });

  it("rejects a file path supplied in place of a registered document ID", async () => {
    const response = await GET(new NextRequest(`https://example.test/api/documents/file?id=provize%2F${id}.pdf`));
    expect(response.status).toBe(404);
  });
});

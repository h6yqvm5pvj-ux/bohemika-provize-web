import { WriteBatch } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/firebaseAdmin", async () => {
  const { Firestore } = await import("firebase-admin/firestore");
  return { adminDb: new Firestore({ projectId: "demo-online-card-analytics" }) };
});

import { recordOnlineCardAnalyticsEvent, resolveOnlineCardAnalyticsOwnerEmail } from "./onlineCardAnalytics";

afterEach(() => vi.restoreAllMocks());

describe("online card analytics persistence", () => {
  it("serializes an atomic nested counter through the real Firestore SDK", async () => {
    const writes: Array<{ update?: { name?: string }; updateTransforms?: Array<{ fieldPath: string; increment?: unknown }> }> = [];
    // Intercept the commit boundary so serialization is real but no network is used.
    vi.spyOn(WriteBatch.prototype, "commit").mockImplementation(async function (this: WriteBatch) {
      const ops = (this as unknown as { _ops: Array<{ op: () => typeof writes[number] }> })._ops;
      writes.push(...ops.map(({ op }) => op()));
      return [];
    });
    await recordOnlineCardAnalyticsEvent({ ownerEmail: "owner@example.test", slug: "advisor", event: "visit" });
    expect(writes).toHaveLength(1);
    expect(writes[0].update?.name).toContain("/onlineCardAnalytics/owner@example.test/days/");
    expect(writes[0].updateTransforms).toContainEqual({ fieldPath: "events.visit", increment: { integerValue: 1 } });
    expect(writes[0].updateTransforms?.some(item => item.fieldPath === "`events.visit`")).toBe(false);
  });

  it("attributes analytics to the account, never the public contact email", () => {
    expect(resolveOnlineCardAnalyticsOwnerEmail({ email: " OWNER@Example.test ", onlineCard: { email: "contact@example.test" } }, "uid")).toBe("owner@example.test");
    expect(resolveOnlineCardAnalyticsOwnerEmail({ onlineCard: { email: "contact@example.test" } }, "owner@example.test")).toBe("owner@example.test");
    expect(resolveOnlineCardAnalyticsOwnerEmail({ onlineCard: { email: "contact@example.test" } }, "uid")).toBeNull();
  });
});

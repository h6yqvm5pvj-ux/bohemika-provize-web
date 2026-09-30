import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { privateFirestore } from "../../../../../tests/helpers/privateFirestore";

const mocks = vi.hoisted(() => ({
  db: null as Firestore | null,
  guard: vi.fn(), tokenGuard: vi.fn(), push: vi.fn(), mailbox: vi.fn(), mailboxOnce: vi.fn(),
  getUserByEmail: vi.fn(),
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  get adminDb() { return mocks.db; }, adminAuth: { getUserByEmail: mocks.getUserByEmail },
  adminMessaging: { sendEachForMulticast: mocks.push },
}));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  requireAuthedRateLimited: mocks.tokenGuard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("@/lib/server/mailbox", () => ({
  writeMailboxEntries: mocks.mailbox, writeMailboxEntryOnce: mocks.mailboxOnce,
}));

import { POST } from "./route";
import { POST as registerToken } from "../../push/token/route";
import { sendDiscussionCommentNotifications } from "@/lib/server/intranetDiscussionNotifications";

type Profile = Record<string, unknown>;
const author = "author@example.test", advisor = "advisor@example.test", tipster = "tipster@example.test";
let store: ReturnType<typeof privateFirestore>;
const user = (email: string, profile: Profile = {}, docId = email) =>
  store.records.set(`users/${docId}`, { email, ...profile });
const privateUser = (email: string, profile: Profile) => store.records.set(`usersPrivate/${email}`, profile);
const follow = (email: string) => store.records.set(`intranetWallPosts/post/viewerStates/${email}`, { following: true });
const tokens = () => mocks.push.mock.calls.flatMap(([payload]) => payload.tokens as string[]);
const postRecipients = () => mocks.mailbox.mock.calls.flatMap(([payload]) => payload.recipientEmails as string[]);
const commentRecipients = () => mocks.mailboxOnce.mock.calls.map(([payload]) => payload.recipientEmail as string);

async function publish() {
  const form = new FormData();
  form.set("title", "Internal title for advisors");
  form.set("text", "Internal post body");
  form.set("section", "pomoc");
  const response = await POST(new NextRequest("https://example.test/api/intranet/wall", { method: "POST", body: form }));
  expect(response.status).toBe(200);
}
const comment = (commentId = "comment") => sendDiscussionCommentNotifications({
  postId: "post", commentId, section: "pomoc", sectionLabel: "Pomoc",
  postAuthorEmail: tipster, commenterEmail: author, commenterName: "Author", origin: "https://example.test",
});

beforeEach(() => {
  vi.clearAllMocks();
  store = privateFirestore();
  mocks.db = { ...store.db, getAll: (...refs: { get: () => Promise<unknown> }[]) => Promise.all(refs.map(ref => ref.get())) } as unknown as Firestore;
  user(author, { accountType: "advisor", name: "Author", fcmToken: "author-token" });
  user(advisor, { accountType: "advisor", fcmToken: "advisor-token" });
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: author, uid: "author-uid" } });
  mocks.tokenGuard.mockResolvedValue({ ok: true, ctx: { email: tipster, uid: "tipster-uid" } });
  mocks.push.mockResolvedValue({ successCount: 1 });
  mocks.mailbox.mockResolvedValue({ written: 1 });
  mocks.mailboxOnce.mockResolvedValue({ written: true });
  mocks.getUserByEmail.mockImplementation(async (email: string) => ({ uid: `uid-${email}`, email }));
});
afterEach(() => vi.restoreAllMocks());

describe("intranet notification recipient authorization", () => {
  it("keeps tipster token registration available but excludes it from new-post delivery", async () => {
    user(tipster, { accountType: "tipster" });
    const response = await registerToken(new NextRequest("https://example.test/api/push/token", {
      method: "POST", body: JSON.stringify({ token: "tipster-device-token", deviceId: "test-device" }),
    }));
    expect(response.status).toBe(200);
    expect(store.records.get(`usersPrivate/${tipster}`)?.fcmToken).toBe("tipster-device-token");
    await publish();
    expect(tokens()).toEqual(["advisor-token"]);
    expect(postRecipients()).toEqual([advisor]);
    expect(mocks.push.mock.calls[0][0].data.title).toBe("Internal title for advisors");
  });

  it.each([
    { public: { accountType: "tipster" }, private: {} },
    { public: { accountType: "  TiPsTeR  " }, private: {} },
    { public: { userRole: " TIPSTER " }, private: {} },
    { public: { accountType: null, userRole: "tipster" }, private: {} },
    { public: { accountType: "advisor" }, private: { accountType: "tipster" } },
    { public: {}, private: { userRole: "tipster" } },
  ])("excludes every token representation and mailbox copy for effective role %j", async profile => {
    user(tipster, { ...profile.public, fcmToken: "public-tipster-token" });
    privateUser(tipster, {
      ...profile.private, pushToken: "single", notificationToken: "notification",
      fcmTokens: ["array"], pushTokens: ["push-array"], notificationTokens: ["notification-array"],
      fcmTokensByDevice: { phone: "fcm-map" }, pushTokensByDevice: { phone: "push-map" },
    });
    await publish();
    expect(tokens()).toEqual(["advisor-token"]);
    expect(postRecipients()).toEqual([advisor]);
  });

  it("prefers the current canonical role over an older duplicate advisor profile", async () => {
    user(tipster, { accountType: "advisor", fcmToken: "stale-token" }, "000-legacy-profile");
    user(tipster, { accountType: "tipster", fcmToken: "current-token" });
    await publish();
    expect(tokens()).toEqual(["advisor-token"]);
    expect(postRecipients()).toEqual([advisor]);
  });

  it("keeps an explicitly promoted canonical advisor eligible despite a stale tipster duplicate", async () => {
    user(tipster, { accountType: "tipster", fcmToken: "stale-token" }, "000-legacy-profile");
    user(tipster, { accountType: "advisor", fcmToken: "promoted-token" });
    await publish();
    expect(tokens().sort()).toEqual(["advisor-token", "promoted-token"]);
    expect(postRecipients().sort()).toEqual([advisor, tipster]);
  });

  it("resolves tipsters stored under legacy IDs through their email", async () => {
    user(tipster, { userRole: "tipster", fcmToken: "legacy-tipster-token" }, "legacy-uid");
    await publish();
    expect(tokens()).toEqual(["advisor-token"]);
    expect(postRecipients()).toEqual([advisor]);
  });

  it.each([false, true])("rejects a token-only canonical profile hiding a legacy tipster (mixedCase=%s)", async mixedCase => {
    user(mixedCase ? "Tipster@Example.test" : tipster, { userId: "legacy-uid", accountType: "tipster" }, "legacy-uid");
    mocks.getUserByEmail.mockResolvedValue({ uid: "legacy-uid", email: tipster });
    expect((await registerToken(new NextRequest("https://example.test/api/push/token", {
      method: "POST", body: JSON.stringify({ token: "legacy-tipster-device", deviceId: "test-device" }),
    }))).status).toBe(200);
    // Owners can edit display fields; those must not turn the token stub into
    // an authorization profile that hides the protected legacy account role.
    store.records.set(`users/${tipster}`, { ...store.records.get(`users/${tipster}`), fullName: "New display name" });
    await publish();
    expect(tokens()).toEqual(["advisor-token"]);
    expect(postRecipients()).toEqual([advisor]);
    mocks.push.mockClear();
    follow(tipster); follow(advisor);
    await comment();
    expect(commentRecipients()).toEqual([advisor]);
    expect(tokens()).toEqual(["advisor-token"]);
  });

  it("preserves mixed-case legacy advisor profiles for posts and discussions", async () => {
    store.records.delete(`users/${advisor}`);
    user("Advisor@Example.test", { userId: "legacy-advisor-uid", accountType: "advisor", fcmToken: "legacy-advisor-token" }, "legacy-advisor-uid");
    mocks.getUserByEmail.mockResolvedValue({ uid: "legacy-advisor-uid", email: "Advisor@Example.test" });
    privateUser(advisor, { pushToken: "private-advisor-token" });
    user(tipster, { accountType: "tipster" });
    await publish();
    expect(postRecipients()).toEqual([advisor]);
    expect(tokens().sort()).toEqual(["legacy-advisor-token", "private-advisor-token"]);
    mocks.push.mockClear(); follow(advisor);
    await comment();
    expect(commentRecipients()).toEqual([advisor]);
    expect(tokens().sort()).toEqual(["legacy-advisor-token", "private-advisor-token"]);
  });

  it("preserves private role precedence when a mixed-case profile is resolved through UID", async () => {
    user("Tipster@Example.test", { userId: "legacy-uid", accountType: "tipster" }, "legacy-uid");
    privateUser(tipster, { accountType: "advisor", fcmToken: "promoted-advisor" });
    mocks.getUserByEmail.mockResolvedValue({ uid: "legacy-uid", email: tipster });
    await comment();
    expect(commentRecipients()).toEqual([tipster]);
    expect(tokens()).toEqual(["promoted-advisor"]);
  });

  it("does not treat an unverifiable role-less profile as permission to receive intranet data", async () => {
    user(tipster, { fcmToken: "unverified-token" });
    mocks.getUserByEmail.mockRejectedValue(new Error("Auth temporarily unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await publish();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.mailbox).not.toHaveBeenCalled();
    follow(tipster); follow(advisor);
    await comment();
    expect(commentRecipients()).toEqual([advisor]);
    expect(tokens()).toEqual(["advisor-token"]);
  });

  it.each([
    { public: {}, private: {} },
    { public: { accountType: "advisor", userRole: "tipster" }, private: {} },
    { public: { accountType: "tipster" }, private: { accountType: "advisor" } },
  ])("preserves the guard's legacy defaults and role precedence for eligible profiles: %j", async profile => {
    user(tipster, { ...profile.public, fcmToken: "eligible-token" });
    privateUser(tipster, profile.private);
    await publish();
    expect(tokens().sort()).toEqual(["advisor-token", "eligible-token"]);
    expect(postRecipients().sort()).toEqual([advisor, tipster]);
  });

  it("preserves notification opt-outs, section selection, author exclusion and token deduplication", async () => {
    user(advisor, { fcmToken: "shared", pushTokens: ["shared"], notificationSettings: { intranet: { mode: "selected", sections: ["pomoc"] } } });
    user("off@example.test", { fcmToken: "off", notificationSettings: { types: { intranet: false } } });
    user("muted@example.test", { fcmToken: "muted", notificationSettings: { channels: { push: false } } });
    user("other-section@example.test", { fcmToken: "other", notificationSettings: { intranet: { mode: "selected", sections: ["auto"] } } });
    privateUser(advisor, { fcmTokensByDevice: { phone: "shared" } });
    await publish();
    expect(tokens()).toEqual(["shared"]);
    expect(postRecipients()).toEqual([advisor]);
  });

  it("does not send or store a notification when only a tipster is in the audience", async () => {
    store.records.delete(`users/${advisor}`);
    user(tipster, { accountType: "tipster", fcmToken: "tipster-token" });
    await publish();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.mailbox).not.toHaveBeenCalled();
  });

  it("rechecks current roles for authors and followers after conversion to tipster", async () => {
    user(tipster, { accountType: "advisor", fcmToken: "former-advisor" });
    follow(tipster); follow(advisor);
    await comment("before-conversion");
    expect(commentRecipients().sort()).toEqual([advisor, tipster]);
    mocks.push.mockClear(); mocks.mailboxOnce.mockClear();
    user(tipster, { accountType: "tipster", fcmToken: "former-advisor" });
    await comment("after-conversion");
    expect(commentRecipients()).toEqual([advisor]);
    expect(tokens()).toEqual(["advisor-token"]);
  });

  it("excludes legacy/private tipster followers and orphaned follower states from both channels", async () => {
    user(tipster, { accountType: "tipster", fcmToken: "owner-token" });
    const legacy = "legacy@example.test", overridden = "private@example.test", missing = "deleted@example.test";
    user(legacy, { userRole: " TIPSTER " }, "legacy-follower-uid");
    privateUser(legacy, { fcmToken: "legacy-token" });
    user(overridden, { accountType: "advisor" });
    privateUser(overridden, { accountType: "tipster", fcmToken: "private-token" });
    privateUser(missing, { fcmToken: "orphan-token" });
    [legacy, overridden, missing, advisor].forEach(follow);
    await comment();
    expect(commentRecipients()).toEqual([advisor]);
    expect(tokens()).toEqual(["advisor-token"]);
  });
});

import { NextRequest, NextResponse } from "next/server";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateFirestore } from "../../../../../../tests/helpers/privateFirestore";
import { withBusinessDataEncryption } from "@/lib/server/businessDataFirestore";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  db: null as Firestore | null,
  guard: vi.fn(),
  getStorage: vi.fn(),
}));

vi.mock("@/lib/server/firebaseAdmin", () => ({ get adminDb() { return mocks.db; } }));
vi.mock("@/lib/server/apiEntryGuard", () => ({
  requireAdvisorAuthedRateLimited: mocks.guard,
  withRateLimitHeaders: (response: NextResponse) => response,
}));
vi.mock("firebase-admin/storage", () => ({ getStorage: mocks.getStorage }));

const owner = "owner@example.test";
const other = "other@example.test";
const ownPost = "intranetWallPosts/post";
const otherPost = "intranetWallPosts/other";
const ownAttachment = "intranet-wall/post/attachment.pdf";
const otherAttachment = "intranet-wall/other/attachment.pdf";
const deleteFile = vi.fn();
let store: ReturnType<typeof privateFirestore>;

function remove(postId = "post", body?: object) {
  const request = new NextRequest(`https://example.test/api/intranet/wall/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    ...(body && { body: JSON.stringify(body) }),
  });
  return DELETE(request, { params: Promise.resolve({ postId }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  store = privateFirestore();
  mocks.db = withBusinessDataEncryption(store.db);
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner } });
  deleteFile.mockResolvedValue(undefined);
  mocks.getStorage.mockReturnValue({
    bucket: () => ({ file: (path: string) => ({ delete: () => deleteFile(path) }) }),
  });
  store.records.set(ownPost, {
    createdByEmail: "Owner@Example.test",
    attachments: [ownAttachment, otherAttachment].map(path => ({ path, bucketName: "synthetic.test" })),
  });
  store.records.set(`${ownPost}/comments/question`, { text: "Syntetický komentář" });
  store.records.set(`${ownPost}/comments/reply`, { parentCommentId: "question" });
  store.records.set(`${ownPost}/viewerStates/${other}`, { saved: true });
  store.records.set(otherPost, { createdByEmail: other });
  store.records.set(`${otherPost}/comments/safe`, { text: "Jiný příspěvek" });
});

afterEach(() => vi.restoreAllMocks());

describe("deleting intranet posts", () => {
  it("deletes the author's post and its discussion and viewer state through the protected Firestore adapter", async () => {
    let postExistsAtStorageCleanup: boolean | undefined;
    deleteFile.mockImplementation(async () => {
      postExistsAtStorageCleanup = store.records.has(ownPost);
    });

    const response = await remove();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, postId: "post" });
    expect([...store.records.keys()]).toEqual([otherPost, `${otherPost}/comments/safe`, "intranetUnreadCounts/wall"]);
    expect(postExistsAtStorageCleanup).toBe(false);
    expect(deleteFile).toHaveBeenCalledExactlyOnceWith(ownAttachment);
    expect((await remove()).status).toBe(404);
    expect(deleteFile).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 429])("does not open a transaction if the guard returns %s", async (status) => {
    const transaction = vi.spyOn(store.db, "runTransaction");
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ ok: false }, { status }) });

    expect((await remove()).status).toBe(status);
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it.each(["advisor", "specialist", "admin"])("denies a foreign post for role %s", async (role) => {
    mocks.guard.mockResolvedValue({ ok: true, ctx: { email: other, role } });

    expect((await remove("post", { email: owner, role: "admin" })).status).toBe(403);
    expect(store.records.has(ownPost)).toBe(true);
    expect(store.records.has(`${ownPost}/comments/question`)).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it("rejects a malformed ID that otherwise normalizes to a valid post", async () => {
    const transaction = vi.spyOn(store.db, "runTransaction");

    expect((await remove("p/ost")).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("leaves the attachments available when the database transaction fails", async () => {
    vi.spyOn(store.db, "runTransaction").mockRejectedValueOnce(new Error("synthetic failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await remove();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Nepodařilo se smazat příspěvek." });
    expect(store.records.has(ownPost)).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
    expect((await remove()).status).toBe(200);
  });

  it("reports the committed post deletion even if storage cleanup is unavailable", async () => {
    mocks.getStorage.mockImplementationOnce(() => { throw new Error("synthetic storage failure"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect((await remove()).status).toBe(200);
    expect(store.records.has(ownPost)).toBe(false);
    expect(warn).toHaveBeenCalledExactlyOnceWith("Intranet wall attachment cleanup failed.");
  });
});

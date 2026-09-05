import { describe, expect, it } from "vitest";
import { matchRemotePattern } from "next/dist/shared/lib/match-remote-pattern";
import { firebaseStorageImagePatterns } from "./firebaseImageSources";

const patterns = firebaseStorageImagePatterns(["gs://my-app.firebasestorage.app/"], "my-app");
const allowed = (url: string) => patterns.some((pattern) => matchRemotePattern(pattern, new URL(url)));

describe("Firebase image optimizer sources", () => {
  it("allows image objects from the configured application buckets", () => {
    expect(allowed("https://firebasestorage.googleapis.com/v0/b/my-app.firebasestorage.app/o/profile-avatars%2Fphoto.webp?alt=media&token=test")).toBe(true);
    expect(allowed("https://firebasestorage.googleapis.com/v0/b/my-app.appspot.com/o/office%2Fphoto.jpg?alt=media")).toBe(true);
  });
  it.each([
    "https://firebasestorage.googleapis.com/v0/b/attacker.appspot.com/o/profile-avatars%2Fphoto.avif?alt=media",
    "https://firebasestorage.googleapis.com/v0/b/my-app.firebasestorage.app.evil/o/photo.png",
    "https://firebasestorage.googleapis.com.evil/v0/b/my-app.firebasestorage.app/o/photo.png",
    "http://firebasestorage.googleapis.com/v0/b/my-app.firebasestorage.app/o/photo.png",
    "https://firebasestorage.googleapis.com:444/v0/b/my-app.firebasestorage.app/o/photo.png",
    "https://firebasestorage.googleapis.com/v0/b/my-app.firebasestorage.app",
  ])("rejects an unapproved optimizer source: %s", (url) => {
    expect(allowed(url)).toBe(false);
  });
  it("fails closed when storage is unconfigured or contains wildcards", () => {
    expect(firebaseStorageImagePatterns([], undefined)).toEqual([]);
    expect(firebaseStorageImagePatterns(["**", "bucket/o/**"], "*")).toEqual([]);
  });
});

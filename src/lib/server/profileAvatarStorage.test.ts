import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeManagedProfileAvatar, resolveProfileAvatarBuckets } from "./profileAvatarStorage";

const url = (bucket: string, path: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
beforeEach(() => {
  vi.stubEnv("FIREBASE_STORAGE_BUCKET","demo.firebasestorage.app");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET","");
  vi.stubEnv("FIREBASE_ADMIN_PROJECT_ID","");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","");
});
afterEach(() => vi.unstubAllEnvs());
describe("managed avatar provenance at server boundaries", () => {
  it.each(["demo.firebasestorage.app","demo.appspot.com"])("keeps configured and fallback bucket %s", bucket => {
    const avatar=url(bucket,"profile-avatars/user-1/123-photo.webp");
    expect(normalizeManagedProfileAvatar(avatar)).toBe(avatar);
  });
  it("keeps project-based bucket resolution used by the upload route",()=>{
    vi.stubEnv("FIREBASE_STORAGE_BUCKET","");vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID","demo-project");
    expect(resolveProfileAvatarBuckets()).toEqual(["demo-project.appspot.com","demo-project.firebasestorage.app"]);
  });
  it("fails closed without configured storage",()=>{
    vi.stubEnv("FIREBASE_STORAGE_BUCKET","");
    expect(normalizeManagedProfileAvatar(url("attacker","profile-avatars/user/photo.webp"))).toBe("");
  });
  it.each([
    "unrelated/o/profile-avatars/user/photo.webp","profile-avatars/user/photo.svg","profile-avatars/../photo.webp",
    "profile-avatars/user/nested/photo.webp","profile-avatars/user/photo.webp\u0000","profile-avatars/user\\path/photo.webp",
  ])("rejects alternate object representations: %s",path=>{
    expect(normalizeManagedProfileAvatar(url("demo.firebasestorage.app",path))).toBe("");
  });
  it("rejects another bucket and misleading URL authorities",()=>{
    const avatar=url("demo.firebasestorage.app","profile-avatars/user/photo.webp");
    expect(normalizeManagedProfileAvatar(url("attacker","profile-avatars/user/photo.webp"))).toBe("");
    expect(normalizeManagedProfileAvatar(avatar.replace("https://","https://user@"))).toBe("");
    expect(normalizeManagedProfileAvatar(avatar.replace(".com/",".com:8443/"))).toBe("");
  });
});

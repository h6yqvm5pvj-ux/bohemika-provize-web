import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROFILE_AVATAR,
  normalizeProfileAvatar,
  profileAvatarFromRecord,
} from "@/lib/profileAvatar";

const uploadedAvatar =
  "https://firebasestorage.googleapis.com/v0/b/bohemika-app/o/profile-avatars%2Fuser-1%2Fphoto.webp?alt=media&token=test-token";

describe("profile avatar normalization", () => {
  it("uses the existing team icon as the application default", () => {
    expect(DEFAULT_PROFILE_AVATAR).toBe("/icons/klient.webp");
  });

  it("accepts only uploaded profile-avatar storage URLs", () => {
    expect(normalizeProfileAvatar(uploadedAvatar)).toBe(uploadedAvatar);
    expect(normalizeProfileAvatar("https://example.com/photo.webp")).toBe("");
    expect(normalizeProfileAvatar("/avatars/preset.webp")).toBe("");
  });

  it("reads a valid avatar safely from a user record", () => {
    expect(profileAvatarFromRecord({ profileAvatar: uploadedAvatar })).toBe(
      uploadedAvatar
    );
    expect(profileAvatarFromRecord({ profileAvatar: 42 })).toBe("");
    expect(profileAvatarFromRecord(undefined)).toBe("");
  });
});

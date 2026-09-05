import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  prepareProfileAvatarFile,
  PROFILE_AVATAR_OUTPUT_SIZE,
} from "@/lib/server/profileAvatarUpload";

function imageFile(bytes: Buffer, name: string, type: string): File {
  const copy = Uint8Array.from(bytes);
  return new File([copy], name, { type });
}

describe("profile avatar upload preparation", () => {
  it("crops a valid image to a square WEBP avatar", async () => {
    const input = await sharp({
      create: {
        width: 900,
        height: 500,
        channels: 3,
        background: "#6d28d9",
      },
    })
      .png()
      .toBuffer();

    const result = await prepareProfileAvatarFile(
      imageFile(input, "profil.png", "image/png")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.avatar.contentType).toBe("image/webp");
    expect(result.avatar.safeFileName).toBe("profile-avatar.webp");
    await expect(sharp(result.avatar.bytes).metadata()).resolves.toMatchObject({
      format: "webp",
      width: PROFILE_AVATAR_OUTPUT_SIZE,
      height: PROFILE_AVATAR_OUTPUT_SIZE,
    });
  });

  it("rejects content that only pretends to be an image", async () => {
    await expect(
      prepareProfileAvatarFile(
        imageFile(Buffer.from("not an image"), "profil.png", "image/png")
      )
    ).resolves.toMatchObject({
      ok: false,
      error: "Podporované formáty jsou JPG, PNG, WEBP a AVIF.",
    });
  });
});

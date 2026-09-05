import sharp from "sharp";

import { detectSafeUserAttachment } from "@/lib/server/safeUserAttachments";

export const PROFILE_AVATAR_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const PROFILE_AVATAR_OUTPUT_SIZE = 512;

const ALLOWED_INPUT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export type PreparedProfileAvatar = {
  bytes: Buffer;
  contentType: "image/webp";
  originalName: string;
  safeFileName: string;
};

const normalizeFileName = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "profile-photo";

export async function prepareProfileAvatarFile(
  file: File
): Promise<
  | { ok: true; avatar: PreparedProfileAvatar }
  | { ok: false; error: string }
> {
  const originalName = normalizeFileName(file.name);
  if (file.size <= 0) {
    return { ok: false, error: "Vybraný soubor je prázdný." };
  }
  if (file.size > PROFILE_AVATAR_UPLOAD_MAX_BYTES) {
    return { ok: false, error: "Fotografie je příliš velká (max. 8 MB)." };
  }

  const input = Buffer.from(await file.arrayBuffer());
  const detected = detectSafeUserAttachment({
    bytes: input,
    fileName: originalName,
    declaredContentType: file.type,
  });
  if (!detected || !ALLOWED_INPUT_TYPES.has(detected.contentType)) {
    return {
      ok: false,
      error: "Podporované formáty jsou JPG, PNG, WEBP a AVIF.",
    };
  }

  try {
    const bytes = await sharp(input, { failOn: "warning" })
      .rotate()
      .resize(PROFILE_AVATAR_OUTPUT_SIZE, PROFILE_AVATAR_OUTPUT_SIZE, {
        fit: "cover",
        position: "attention",
      })
      .webp({ quality: 86, effort: 5, smartSubsample: true })
      .toBuffer();

    return {
      ok: true,
      avatar: {
        bytes,
        contentType: "image/webp",
        originalName,
        safeFileName: "profile-avatar.webp",
      },
    };
  } catch {
    return {
      ok: false,
      error: "Fotografii se nepodařilo zpracovat. Zkus jiný soubor.",
    };
  }
}

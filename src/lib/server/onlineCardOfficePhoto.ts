import { detectSafeUserAttachment } from "@/lib/server/safeUserAttachments";

export const ONLINE_CARD_OFFICE_PHOTO_MAX_BYTES = 6 * 1024 * 1024;

export type OnlineCardOfficePhotoContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type PreparedOnlineCardOfficePhoto = {
  bytes: Buffer;
  contentType: OnlineCardOfficePhotoContentType;
  originalName: string;
  safeFileName: string;
};

const FILE_NAME_MAX_LEN = 120;
const ALLOWED_OFFICE_PHOTO_TYPES = new Set<OnlineCardOfficePhotoContentType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const OFFICE_PHOTO_EXTENSIONS: Record<OnlineCardOfficePhotoContentType, string[]> = {
  "image/jpeg": [".jpg", ".jpeg", ".jfif"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const sanitizeBaseFileName = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FILE_NAME_MAX_LEN) || "office-photo";

function hasAllowedExtension(fileName: string, contentType: OnlineCardOfficePhotoContentType) {
  const normalized = fileName.trim().toLowerCase();
  return OFFICE_PHOTO_EXTENSIONS[contentType].some((extension) =>
    normalized.endsWith(extension)
  );
}

function withCanonicalExtension(
  fileName: string,
  contentType: OnlineCardOfficePhotoContentType
): string {
  if (hasAllowedExtension(fileName, contentType)) return fileName;
  const primaryExtension = OFFICE_PHOTO_EXTENSIONS[contentType][0] ?? ".jpg";
  const withoutExtension = fileName.replace(/\.[A-Za-z0-9]{1,8}$/u, "");
  return `${withoutExtension || "office-photo"}${primaryExtension}`;
}

export function sanitizeOnlineCardOfficePhotoFileName({
  originalName,
  contentType,
}: {
  originalName: string;
  contentType: OnlineCardOfficePhotoContentType;
}): string {
  return withCanonicalExtension(sanitizeBaseFileName(originalName), contentType);
}

function isOfficePhotoContentType(
  value: string
): value is OnlineCardOfficePhotoContentType {
  return ALLOWED_OFFICE_PHOTO_TYPES.has(value as OnlineCardOfficePhotoContentType);
}

export async function prepareOnlineCardOfficePhotoFile(
  file: File
): Promise<
  | { ok: true; photo: PreparedOnlineCardOfficePhoto }
  | { ok: false; error: string }
> {
  const originalName = normalizeText(file.name) || "office-photo";

  if (file.size <= 0) {
    return {
      ok: false,
      error: `Soubor ${originalName || "soubor"} je prázdný.`,
    };
  }

  if (file.size > ONLINE_CARD_OFFICE_PHOTO_MAX_BYTES) {
    return {
      ok: false,
      error: "Fotka kanceláře je příliš velká (max 6 MB).",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectSafeUserAttachment({
    bytes,
    fileName: originalName,
    declaredContentType: file.type,
  });

  if (!detected || !isOfficePhotoContentType(detected.contentType)) {
    return {
      ok: false,
      error:
        "Podporované formáty jsou JPG, PNG a WEBP. Soubor musí tomuto formátu skutečně odpovídat.",
    };
  }

  return {
    ok: true,
    photo: {
      bytes,
      contentType: detected.contentType,
      originalName,
      safeFileName: sanitizeOnlineCardOfficePhotoFileName({
        originalName,
        contentType: detected.contentType,
      }),
    },
  };
}

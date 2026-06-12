const OCTET_STREAM = "application/octet-stream";

const SAFE_ATTACHMENT_TYPES = [
  {
    contentType: "application/pdf",
    extensions: [".pdf"],
    isImage: false,
    matches: (bytes: Buffer) =>
      bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-",
    acceptedDeclaredTypes: new Set(["application/pdf", "application/x-pdf"]),
  },
  {
    contentType: "image/png",
    extensions: [".png"],
    isImage: true,
    matches: (bytes: Buffer) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
    acceptedDeclaredTypes: new Set(["image/png"]),
  },
  {
    contentType: "image/jpeg",
    extensions: [".jpg", ".jpeg", ".jfif"],
    isImage: true,
    matches: (bytes: Buffer) =>
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff,
    acceptedDeclaredTypes: new Set(["image/jpeg", "image/pjpeg"]),
  },
  {
    contentType: "image/gif",
    extensions: [".gif"],
    isImage: true,
    matches: (bytes: Buffer) => {
      if (bytes.length < 6) return false;
      const signature = bytes.subarray(0, 6).toString("latin1");
      return signature === "GIF87a" || signature === "GIF89a";
    },
    acceptedDeclaredTypes: new Set(["image/gif"]),
  },
  {
    contentType: "image/webp",
    extensions: [".webp"],
    isImage: true,
    matches: (bytes: Buffer) =>
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
      bytes.subarray(8, 12).toString("latin1") === "WEBP",
    acceptedDeclaredTypes: new Set(["image/webp"]),
  },
  {
    contentType: "image/avif",
    extensions: [".avif"],
    isImage: true,
    matches: (bytes: Buffer) => matchesIsoBrand(bytes, ["avif", "avis"]),
    acceptedDeclaredTypes: new Set(["image/avif"]),
  },
] as const;

export type SafeIntranetWallAttachment = {
  contentType: string;
  isImage: boolean;
};

export type PreparedIntranetWallAttachmentFile = SafeIntranetWallAttachment & {
  file: File;
  bytes: Buffer;
};

type SafeAttachmentType = (typeof SAFE_ATTACHMENT_TYPES)[number];

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeContentType = (value: unknown): string =>
  normalizeText(value).split(";")[0]?.trim().toLowerCase() ?? "";

const fileExtension = (fileName: string): string => {
  const normalized = fileName.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  if (index < 0) return "";
  return normalized.slice(index);
};

function matchesIsoBrand(bytes: Buffer, brands: string[]): boolean {
  if (bytes.length < 12) return false;
  if (bytes.subarray(4, 8).toString("latin1") !== "ftyp") return false;
  const brandWindow = bytes.subarray(8, Math.min(bytes.length, 64)).toString("latin1");
  return brands.some((brand) => brandWindow.includes(brand));
}

function declaredTypeMatches(
  safeType: SafeAttachmentType,
  declaredContentType: string
): boolean {
  if (!declaredContentType || declaredContentType === OCTET_STREAM) return true;
  return safeType.acceptedDeclaredTypes.has(declaredContentType);
}

function extensionMatches(safeType: SafeAttachmentType, fileName: string): boolean {
  const ext = fileExtension(fileName);
  if (!ext) return true;
  return (safeType.extensions as readonly string[]).includes(ext);
}

export function detectSafeIntranetWallAttachment({
  bytes,
  fileName,
  declaredContentType,
}: {
  bytes: Buffer;
  fileName: string;
  declaredContentType?: string | null;
}): SafeIntranetWallAttachment | null {
  const normalizedDeclared = normalizeContentType(declaredContentType);
  for (const safeType of SAFE_ATTACHMENT_TYPES) {
    if (!safeType.matches(bytes)) continue;
    if (!declaredTypeMatches(safeType, normalizedDeclared)) continue;
    if (!extensionMatches(safeType, fileName)) continue;
    return {
      contentType: safeType.contentType,
      isImage: safeType.isImage,
    };
  }
  return null;
}

export async function prepareIntranetWallAttachmentFile(
  file: File
): Promise<
  | { ok: true; file: PreparedIntranetWallAttachmentFile }
  | { ok: false; error: string }
> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const safe = detectSafeIntranetWallAttachment({
    bytes,
    fileName: normalizeText(file.name),
    declaredContentType: file.type,
  });

  if (!safe) {
    return {
      ok: false,
      error: "Povolené přílohy jsou jen PDF a obrázky PNG, JPG, GIF, WEBP nebo AVIF.",
    };
  }

  return {
    ok: true,
    file: {
      file,
      bytes,
      contentType: safe.contentType,
      isImage: safe.isImage,
    },
  };
}

export function resolveIntranetWallAttachmentServing({
  bytes,
  fileName,
  storedContentType,
  downloadRequested,
}: {
  bytes: Buffer;
  fileName: string;
  storedContentType: string;
  downloadRequested: boolean;
}): {
  contentType: string;
  shouldDownload: boolean;
  isInlineImage: boolean;
  contentSecurityPolicy: string | null;
} {
  const safe = detectSafeIntranetWallAttachment({
    bytes,
    fileName,
    declaredContentType: storedContentType,
  });

  if (!safe) {
    return {
      contentType: OCTET_STREAM,
      shouldDownload: true,
      isInlineImage: false,
      contentSecurityPolicy:
        "sandbox; default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    };
  }

  const isPdf = safe.contentType === "application/pdf";
  return {
    contentType: safe.contentType,
    shouldDownload: downloadRequested,
    isInlineImage: safe.isImage && !downloadRequested,
    contentSecurityPolicy: isPdf
      ? "sandbox; default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
      : null,
  };
}

import { createHash } from "node:crypto";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";

const MAX_PORTRAIT_BYTES = 2_000_000;

export function onlineCardShareImagePath(slug: string, card: { fullName: string; title: string; bio: string; location: string; profileAvatar: string }): string {
  const version = createHash("sha256").update(JSON.stringify([card.fullName, card.title, card.bio, card.location, card.profileAvatar])).digest("hex").slice(0, 12);
  return `/vizitka/${encodeURIComponent(slug)}/share-image?v=${version}`;
}

export async function onlineCardSharePortrait(value: string): Promise<string | null> {
  const url = normalizeProfileAvatar(value);
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_PORTRAIT_BYTES) {
      await response.body?.cancel();
      return null;
    }
    if (!response.body) return null;
    // Content-Length is optional and untrusted. Enforce the limit while reading
    // so a public sharing request cannot buffer an arbitrarily large photo.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PORTRAIT_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks, size);
    const { default: sharp } = await import("sharp");
    const png = await sharp(bytes, { limitInputPixels: 4_000_000 })
      .rotate().resize(440, 440, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Sharing the public profile must still work when its photo is unavailable.
    return null;
  }
}

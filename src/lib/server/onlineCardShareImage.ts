import { createHash } from "node:crypto";
import { normalizeProfileAvatar } from "@/lib/profileAvatar";

export function onlineCardShareImagePath(slug: string, card: { fullName: string; title: string; bio: string; location: string; profileAvatar: string }): string {
  const version = createHash("sha256").update(JSON.stringify([card.fullName, card.title, card.bio, card.location, card.profileAvatar])).digest("hex").slice(0, 12);
  return `/vizitka/${encodeURIComponent(slug)}/share-image?v=${version}`;
}

export async function onlineCardSharePortrait(value: string): Promise<string | null> {
  const url = normalizeProfileAvatar(value);
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!response.ok || Number(response.headers.get("content-length")) > 2_000_000) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 2_000_000) return null;
    const { default: sharp } = await import("sharp");
    const png = await sharp(bytes, { limitInputPixels: 4_000_000 })
      .rotate().resize(440, 440, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    // Sharing the public profile must still work when its photo is unavailable.
    return null;
  }
}

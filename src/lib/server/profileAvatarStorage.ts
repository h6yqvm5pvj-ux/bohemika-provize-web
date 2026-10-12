import { normalizeProfileAvatar } from "@/lib/profileAvatar";

export function resolveProfileAvatarBuckets(): string[] {
  const candidates: string[] = [];
  const append = (value: string | undefined) => {
    const normalized = value?.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };
  append(process.env.FIREBASE_STORAGE_BUCKET);
  append(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const explicit = candidates[0] ?? "";
  if (explicit.endsWith(".firebasestorage.app")) {
    append(explicit.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  } else if (explicit.endsWith(".appspot.com")) {
    append(explicit.replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (projectId) {
    append(`${projectId}.appspot.com`);
    append(`${projectId}.firebasestorage.app`);
  }
  return candidates;
}

/** Use at server fetch boundaries, including profiles written directly through
 * Firebase. Only the application's raster-avatar upload namespace is trusted. */
export function normalizeManagedProfileAvatar(value: unknown): string {
  const normalized = normalizeProfileAvatar(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.username || url.password || (url.port && url.port !== "443")) return "";
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || !resolveProfileAvatarBuckets().includes(decodeURIComponent(match[1]!))) return "";
    const objectPath = decodeURIComponent(match[2]!);
    if (!/^profile-avatars\/[^/]+\/[^/]+\.webp$/.test(objectPath)) return "";
    if (objectPath.split("/").some(part => part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part))) return "";
    return normalized;
  } catch {
    return "";
  }
}

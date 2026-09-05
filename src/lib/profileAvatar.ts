export const PROFILE_AVATAR_MAX_URL_LENGTH = 1_600;
export const DEFAULT_PROFILE_AVATAR = "/icons/klient.webp";

const isManagedProfileAvatarUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") {
      return false;
    }
    const decodedPath = decodeURIComponent(url.pathname);
    return decodedPath.includes("/o/profile-avatars/") && url.searchParams.get("alt") === "media";
  } catch {
    return false;
  }
};

export const normalizeProfileAvatar = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PROFILE_AVATAR_MAX_URL_LENGTH) return "";
  return isManagedProfileAvatarUrl(trimmed) ? trimmed : "";
};

export const profileAvatarFromRecord = (
  value: Record<string, unknown> | null | undefined
): string => normalizeProfileAvatar(value?.profileAvatar);

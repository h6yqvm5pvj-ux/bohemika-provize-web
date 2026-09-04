const MINUTE_MS = 60_000;
const ONLINE_WINDOW_MS = 10 * MINUTE_MS;

export function formatMailboxPresence({
  lastActiveAtMs,
  nowMs = Date.now(),
  typing = false,
}: {
  lastActiveAtMs: number | null;
  nowMs?: number;
  typing?: boolean;
}): { label: string; online: boolean; typing: boolean } {
  if (typing) return { label: "Píše…", online: true, typing: true };
  if (!lastActiveAtMs || !Number.isFinite(lastActiveAtMs)) {
    return { label: "Offline", online: false, typing: false };
  }
  const ageMs = Math.max(0, nowMs - lastActiveAtMs);
  if (ageMs <= ONLINE_WINDOW_MS) {
    return { label: "Aktivní", online: true, typing: false };
  }
  const minutes = Math.floor(ageMs / MINUTE_MS);
  if (minutes < 60) {
    return { label: `Aktivní před ${minutes} min`, online: false, typing: false };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { label: `Aktivní před ${hours} h`, online: false, typing: false };
  }
  return { label: `Aktivní před ${Math.floor(hours / 24)} d`, online: false, typing: false };
}

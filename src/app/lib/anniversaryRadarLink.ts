/** An opaque navigation key, never an authorization credential. */
export async function anniversaryRadarTarget(ownerEmail: string, entryId: string): Promise<string> {
  const source = JSON.stringify([ownerEmail.trim().toLowerCase(), entryId]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function anniversaryRadarHref(ownerEmail: string, entryId: string): Promise<string> {
  return `/pomucky/radar-vyroci?contract=${await anniversaryRadarTarget(ownerEmail, entryId)}`;
}

export function isAnniversaryRadarTarget(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/** Only pass items from the viewer's already authorized portfolio. */
export async function findAnniversaryRadarTarget<T extends { ownerEmail: string; entryId: string }>(
  target: string,
  items: readonly T[]
): Promise<T | null> {
  if (!isAnniversaryRadarTarget(target)) return null;
  const normalizedTarget = target.toLowerCase();
  const targets = await Promise.all(items.map(item => anniversaryRadarTarget(item.ownerEmail, item.entryId)));
  const index = targets.indexOf(normalizedTarget);
  return index < 0 ? null : items[index];
}

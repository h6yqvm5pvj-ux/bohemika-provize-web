import { adminDb } from "@/lib/server/firebaseAdmin";
import { profileAvatarFromRecord } from "@/lib/profileAvatar";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export async function loadProfileAvatarsByEmail(
  values: Iterable<string>
): Promise<Record<string, string>> {
  if (!adminDb) return {};
  const db = adminDb;
  const emails = [...new Set([...values].map(normalizeEmail).filter(Boolean))];
  if (emails.length === 0) return {};

  const refs = emails.map((email) => db.collection("users").doc(email));
  const snapshots = await db.getAll(...refs);
  const avatars: Record<string, string> = {};
  snapshots.forEach((snapshot, index) => {
    const email = emails[index];
    if (!email || !snapshot.exists) return;
    const avatar = profileAvatarFromRecord(
      (snapshot.data() as Record<string, unknown> | undefined) ?? {}
    );
    if (avatar) avatars[email] = avatar;
  });
  return avatars;
}

import { adminDb } from "@/lib/server/firebaseAdmin";
import { profileAvatarFromRecord } from "@/lib/profileAvatar";
import { isSpecialistProfile } from "@/lib/specialistAccess";

export async function loadIntranetAuthorProfiles(authors: Array<{ email: string; uid: string }>) {
  const profiles: Record<string, { profileAvatar: string; specialist: boolean }> = {};
  if (!adminDb) return profiles;
  const db = adminDb;
  const unique = [...new Map(authors.filter(author => author.email).map(author => [author.email, author])).values()];
  const ids = [...new Set(unique.flatMap(author => [author.email, author.uid]).filter(id => id && !id.includes("/")))];
  const records = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const snapshots = await db.getAll(...batch.map(id => db.collection("users").doc(id)));
    snapshots.forEach((snapshot, index) => {
      if (snapshot.exists) records.set(batch[index], snapshot.data() ?? {});
    });
  }
  unique.forEach(author => {
    const legacy = records.get(author.uid) ?? {};
    const canonical = records.get(author.email) ?? {};
    const merged = { ...legacy, ...canonical };
    profiles[author.email] = { profileAvatar: profileAvatarFromRecord(merged), specialist: isSpecialistProfile(merged) };
  });
  return profiles;
}

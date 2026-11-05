import type { ContactGroupMember } from "@/app/lib/contactDirectory";
import { resolveAccountType } from "@/lib/server/advisorSetupGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

const EMAIL_RE = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

function memberUid(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim() || !value || value.length > 128 ||
      /[\u0000-\u001f\u007f/\\]/.test(value)) return null;
  return value;
}

function memberName(data: Record<string, unknown>, email: string): string {
  for (const value of [data.fullName, data.name]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
  }
  return email;
}

// Keep this uncached: a group write must validate its member UIDs against the
// current server-owned directory instead of trusting identities from the client.
export async function loadContactDirectoryMembers(): Promise<ContactGroupMember[]> {
  if (!adminDb) throw new Error("Contact member directory is unavailable");
  const snapshot = await adminDb.collection("users")
    .select("userId", "fullName", "name", "accountType", "userRole")
    .get();
  const members = new Map<string, ContactGroupMember>();
  for (const doc of snapshot.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = memberUid(data.userId);
    // Only canonical email-keyed profiles identify an eligible member. An
    // editable data.email field or a legacy UID document is not an authority.
    const email = doc.id.trim().toLowerCase();
    if (!uid || email.length > 320 || !EMAIL_RE.test(email) || resolveAccountType(data) === "tipster") continue;
    const member = { uid, email, name: memberName(data, email) };
    const existing = members.get(uid);
    if (!existing || email.localeCompare(existing.email) < 0) members.set(uid, member);
  }
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name, "cs") || a.email.localeCompare(b.email));
}

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { loadUserProfileForAdvisorSetup, resolveAccountType } from "@/lib/server/advisorSetupGuard";

const hasDeclaredRole = (profile: Record<string, unknown>) =>
  typeof profile.accountType === "string" || typeof profile.userRole === "string";

export async function loadIntranetNotificationProfile(email: string, knownUid = "") {
  if (!adminDb) return null;
  let profile = await loadUserProfileForAdvisorSetup({ email, uid: knownUid });
  if (profile && hasDeclaredRole(profile.data)) {
    return resolveAccountType(profile.data) === "advisor" ? profile.data : null;
  }

  // A push registration can create a canonical document containing only token
  // fields. Its implicit advisor default must not hide a legacy tipster role.
  // Resolve UID as well: older profiles can contain mixed-case email values.
  let uid = knownUid;
  if (!uid) {
    if (!adminAuth) return null;
    try {
      uid = (await adminAuth.getUserByEmail(email)).uid;
    } catch (error) {
      if ((error as { code?: string })?.code === "auth/user-not-found") return null;
      throw error;
    }
  }
  if (!profile) profile = await loadUserProfileForAdvisorSetup({ email, uid });
  if (profile && hasDeclaredRole(profile.data)) {
    return resolveAccountType(profile.data) === "advisor" ? profile.data : null;
  }
  const users = adminDb.collection("users");
  const [byEmail, byUid] = await Promise.all([
    users.where("email", "==", email).get(),
    users.where("userId", "==", uid).get(),
  ]);
  if ([...byEmail.docs, ...byUid.docs].some(doc => resolveAccountType(doc.data()) === "tipster")) {
    return null;
  }
  // Existing legacy advisors may have no role fields. A missing public profile
  // is not an internal account, even if private tokens or follower state remain.
  return profile && resolveAccountType(profile.data) === "advisor" ? profile.data : null;
}

import { verifyAppSessionCookieValue, type VerifiedAppSession } from "@/lib/appSession";
import { adminAuth, adminDb } from "./firebaseAdmin";

type ActiveSessionResult =
  | { ok: true; session: VerifiedAppSession }
  | { ok: false; reason: "invalid" | "revoked" | "unavailable" };

// Do not cache positive results: logout must invalidate a copied cookie immediately.
export async function verifyActiveAppSession(value: string | null | undefined): Promise<ActiveSessionResult> {
  try {
    const verified = await verifyAppSessionCookieValue(value);
    if (!verified.ok) {
      return { ok: false, reason: verified.reason === "not-configured" ? "unavailable" : "invalid" };
    }
    const { session } = verified;
    if (!session.sessionId || session.sessionId.includes("/") || session.email.includes("/")) {
      return { ok: false, reason: "invalid" };
    }
    if (!adminDb || !adminAuth) return { ok: false, reason: "unavailable" };

    const [record, user] = await Promise.all([
      adminDb.collection("usersPrivate").doc(session.email).collection("appSessions").doc(session.sessionId).get(),
      adminAuth.getUser(session.uid),
    ]);
    const data = record.data();
    const validAfter = Date.parse(user.tokensValidAfterTime ?? "");
    if (!record.exists || !data || data.uid !== session.uid || data.email !== session.email ||
      data.revokedAtMs != null || data.expiresAtMs !== session.expiresAt * 1000 || data.expiresAtMs <= Date.now() ||
      user.disabled || user.email?.trim().toLowerCase() !== session.email ||
      (Number.isFinite(validAfter) && session.issuedAt * 1000 < validAfter)) {
      return { ok: false, reason: "revoked" };
    }
    return { ok: true, session };
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/user-not-found") {
      return { ok: false, reason: "revoked" };
    }
    console.error("Ověření aktivní relace selhalo.");
    return { ok: false, reason: "unavailable" };
  }
}

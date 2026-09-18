import { adminAuth, adminDb } from "./firebaseAdmin";
import { withRevokedAuthentication } from "./tokenRevocation";

export class PasswordResetError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}

async function resetRequest(body: { oobCode: string; newPassword?: string }) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new PasswordResetError("auth/configuration-not-found", 503);
  let origin = "https://identitytoolkit.googleapis.com";
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    // Deliberate local integration test support; never forward secrets to arbitrary hosts.
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9299" ||
        process.env.GCLOUD_PROJECT !== "demo-bohemika-rules" || process.env.NODE_ENV === "production") {
      throw new PasswordResetError("auth/configuration-not-found", 503);
    }
    origin = "http://127.0.0.1:9299/identitytoolkit.googleapis.com";
  }
  const response = await fetch(`${origin}/v1/accounts:resetPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok) {
    const reason = String(result?.error?.message ?? "").split(/[ :]/, 1)[0];
    const code: Record<string, string> = {
      EXPIRED_OOB_CODE: "auth/expired-action-code", INVALID_OOB_CODE: "auth/invalid-action-code",
      USER_DISABLED: "auth/user-disabled", EMAIL_NOT_FOUND: "auth/invalid-action-code",
      WEAK_PASSWORD: "auth/weak-password", PASSWORD_DOES_NOT_MEET_REQUIREMENTS: "auth/password-does-not-meet-requirements",
    };
    throw new PasswordResetError(code[reason] ?? "auth/reset-unavailable", code[reason] ? 400 : 503);
  }
  return result as { email?: string; requestType?: string };
}

export async function confirmPasswordResetWithRevocation(code: string, password: string): Promise<void> {
  if (!adminAuth || !adminDb) throw new PasswordResetError("auth/reset-unavailable", 503);
  // Firebase validates the secret code WITHOUT consuming it. Never trust a body email/UID.
  const verified = await resetRequest({ oobCode: code });
  if (verified.requestType !== "PASSWORD_RESET" || typeof verified.email !== "string") {
    throw new PasswordResetError("auth/invalid-action-code");
  }
  const user = await adminAuth.getUserByEmail(verified.email);
  if (user.disabled) throw new PasswordResetError("auth/user-disabled");
  await withRevokedAuthentication(adminDb, user.uid, async () => {
    await resetRequest({ oobCode: code, newPassword: password });
    // Password reset itself invalidates Firebase refresh tokens. The surrounding
    // registry transaction additionally covers Firestore, cookies and custom tokens.
  });
}

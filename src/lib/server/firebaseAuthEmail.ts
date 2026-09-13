import { randomUUID } from "node:crypto";
import { resolveAuthEmailErrorMessage, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { renderAuthEmail } from "@/lib/server/authEmailTemplate";
import { createAuthEmailActionUrl } from "@/lib/authEmailAction";

type FirebaseEmailRequest = {
  requestType: "PASSWORD_RESET" | "VERIFY_EMAIL";
  // Verification callers must obtain this from the authenticated account, never a request body.
  email: string;
};

export class FirebaseAuthEmailError extends Error {
  constructor(readonly code: string) {
    super(resolveAuthEmailErrorMessage({ code }, "Nepodařilo se odeslat e-mail. Zkus to znovu nebo kontaktuj podporu."));
    this.name = "FirebaseAuthEmailError";
  }
}

export function isAuthEmailAddress(email: string): boolean {
  return email.length <= 254 && /^[^\s@<>,;"\\]+@[^\s@<>,;"\\]+\.[^\s@<>,;"\\]+$/.test(email);
}

/** Server-only settings. No NEXT_PUBLIC key or fallback to Google's failing delivery. */
export function requireAuthEmailConfig(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.AUTH_EMAIL_FROM?.trim() ?? "";
  const address = /^[^<>\r\n]+<([^<>]+)>$/.exec(from)?.[1] ?? from;
  if (!adminAuth || !/^re_[a-zA-Z0-9_-]+$/.test(apiKey) || /[\r\n]/.test(from) || !isAuthEmailAddress(address)) {
    throw new FirebaseAuthEmailError("auth/configuration-not-found");
  }
  return { apiKey, from };
}

/** Firebase owns the action code and its validation; Resend only delivers the email. */
export async function sendFirebaseAuthEmail(request: FirebaseEmailRequest): Promise<void> {
  requireAuthEmailConfig();
  const email = request.email.trim().toLowerCase();
  if (!isAuthEmailAddress(email)) throw new FirebaseAuthEmailError("auth/invalid-email");

  let link: URL;
  try {
    const rawLink = request.requestType === "PASSWORD_RESET"
      ? await adminAuth!.generatePasswordResetLink(email)
      : await adminAuth!.generateEmailVerificationLink(email);
    // Firebase still creates and validates the code. Only the UI is hosted in our app.
    link = new URL(rawLink);
    const mode = request.requestType === "PASSWORD_RESET" ? "resetPassword" : "verifyEmail";
    if (link.protocol !== "https:" || link.username || link.password ||
        link.searchParams.get("mode") !== mode || !link.searchParams.get("oobCode")) {
      throw new FirebaseAuthEmailError("auth/configuration-not-found");
    }
    link = new URL(createAuthEmailActionUrl({ mode, code: link.searchParams.get("oobCode")! }));
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    throw new FirebaseAuthEmailError(code === "auth/user-not-found" ? code : safeAuthEmailErrorCode(error));
  }

  const message = renderAuthEmail(request.requestType, link.toString());

  await sendAuthEmailMessage(email, message);
}

/** Only server-created messages; callers must derive recipients from the verified account. */
export async function sendAuthEmailMessage(
  email: string,
  message: { subject: string; html: string; text: string },
  idempotencyKey: string = randomUUID(),
): Promise<void> {
  const { apiKey, from } = requireAuthEmailConfig();
  if (!isAuthEmailAddress(email)) throw new FirebaseAuthEmailError("auth/invalid-email");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from, to: [email], ...message,
      }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new FirebaseAuthEmailError("auth/network-request-failed");
  }
  // Provider bodies can contain recipients or action links. Never log or forward them.
  if (!response.ok) {
    const code = response.status === 429 ? "auth/too-many-requests"
      : response.status === 401 || response.status === 403 ? "auth/configuration-not-found"
      : "auth/email-request-failed";
    throw new FirebaseAuthEmailError(code);
  }
}

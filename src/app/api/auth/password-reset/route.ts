import { after, NextResponse } from "next/server";
import { PASSWORD_RESET_REQUESTED_MESSAGE, safeAuthEmailErrorCode } from "@/lib/authEmailMessages";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { isAuthEmailAddress, requireAuthEmailConfig, sendFirebaseAuthEmail } from "@/lib/server/firebaseAuthEmail";
import { applyRateLimitHeaders, consumeRateLimit, getRequestIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

// Enforce the limit while streaming; Content-Length may be absent or forged.
async function readEmail(req: Request): Promise<string | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    return isAuthEmailAddress(email) ? email : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if ((origin && origin !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") {
      return json({ ok: false, error: "Požadavek není povolený." }, 403);
    }
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return json({ ok: false, error: "Požadavek musí obsahovat JSON." }, 415);
    }

    const ipLimit = await consumeRateLimit({
      namespace: "api:password-reset:ip", key: getRequestIp(req), limit: 10, windowMs: 15 * 60_000,
    });
    if (!ipLimit.allowed) {
      const unavailable = ipLimit.store === "unavailable";
      const response = json({ ok: false, code: unavailable ? "auth/email-request-failed" : "auth/too-many-requests" }, unavailable ? 503 : 429);
      applyRateLimitHeaders(response.headers, ipLimit);
      return response;
    }
    const email = await readEmail(req);
    if (!email) return json({ ok: false, code: "auth/invalid-email" }, 400);

    // Report missing service settings before acceptance, independent of the account.
    requireAuthEmailConfig();
    const recipientLimit = await consumeRateLimit({
      namespace: "api:password-reset:recipient", key: email, limit: 3, windowMs: 15 * 60_000,
    });
    if (recipientLimit.store === "unavailable") {
      return json({ ok: false, code: "auth/email-request-failed" }, 503);
    }

    if (recipientLimit.allowed) {
      // Account lookup and delivery happen AFTER the response: status, body and
      // response time cannot reveal existence, disabled status or provider failures.
      // Next/Vercel keeps this callback alive; do not replace it with a detached promise.
      after(async () => {
        try {
          const user = await adminAuth!.getUserByEmail(email);
          if (user.disabled || !user.providerData.some((provider) => provider.providerId === "password")) return;
          await sendFirebaseAuthEmail({ requestType: "PASSWORD_RESET", email });
        } catch (error) {
          if ((error as { code?: unknown } | null)?.code === "auth/user-not-found") return;
          console.error("[AuthEmail] password-reset delivery:", safeAuthEmailErrorCode(error));
        }
      });
    }
    // Recipient limits do not expose other people's request history in headers.
    return json({ ok: true, message: PASSWORD_RESET_REQUESTED_MESSAGE });
  } catch (error) {
    console.error("[AuthEmail] password-reset request:", safeAuthEmailErrorCode(error));
    return json({ ok: false, code: safeAuthEmailErrorCode(error) }, 503);
  }
}

import { NextResponse } from "next/server";
import { getMfaEnrollmentContext } from "@/lib/server/firebaseAdmin";
import { FirebaseAuthEmailError, requireAuthEmailConfig } from "@/lib/server/firebaseAuthEmail";
import { finishMfaEnrollment, MfaEnrollmentError, requestMfaEnrollment, verifyMfaEnrollmentEmail } from "@/lib/server/mfaEnrollment";
import { applyRateLimitHeaders, consumeRateLimit, getRequestIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.body) return null;
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return result && typeof result === "object" && !Array.isArray(result) ? result : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
async function limit(key: string, scope: string, count: number) {
  const result = await consumeRateLimit({ namespace: `api:mfa-enrollment:${scope}`, key, limit: count, windowMs: 10 * 60_000 });
  if (result.allowed && result.store !== "unavailable") return null;
  const unavailable = result.store === "unavailable";
  const response = json({ ok: false, code: unavailable ? "mfa/unavailable" : "mfa/rate-limited",
    error: unavailable ? "Ověření je dočasně nedostupné. Zkus to za chvíli znovu."
      : "Příliš mnoho pokusů o nastavení 2FA. Počkej na dokončení odpočtu a pokračuj zde." }, unavailable ? 503 : 429);
  applyRateLimitHeaders(response.headers, result); return response;
}
export async function POST(req: Request) {
  try {
    if ((req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false }, 403);
    const token = /^Bearer ([^\s]+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    if (!token || token.length > 16000) return json({ ok: false, error: "Přihlas se znovu." }, 401);
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false }, 415);
    const ipLimit = await limit(getRequestIp(req), "ip", 40); if (ipLimit) return ipLimit;
    const body = await readBody(req);
    if (!body || !["request", "verify", "complete"].includes(String(body.action)) ||
        Object.keys(body).some(key => !["action", "challengeId", "code"].includes(key))) return json({ ok: false }, 400);
    if (body.action !== "request" && (typeof body.challengeId !== "string" || !/^[a-f\d-]{36}$/.test(body.challengeId) ||
        typeof body.code !== "string" || !/^\d{6}$/.test(body.code))) return json({ ok: false, error: "Zadej všech šest číslic kódu." }, 400);
    let context;
    try { context = await getMfaEnrollmentContext(token); }
    catch { return json({ ok: false, code: "mfa/reauth-required", error: "Přihlas se znovu. Nastavení vyžaduje ověřený e-mail a účet bez existujícího 2FA." }, 401); }
    // A missing mail configuration cannot send a code. Do not spend the user's
    // limited email requests or replace an existing challenge in that case.
    if (body.action === "request") requireAuthEmailConfig();
    const userLimit = await limit(context.uid, String(body.action), body.action === "request" ? 3 : 10); if (userLimit) return userLimit;
    if (body.action === "request") return json({ ok: true, ...await requestMfaEnrollment(context) });
    if (body.action === "verify") return json({ ok: true, ...await verifyMfaEnrollmentEmail(context, token, body.challengeId as string, body.code as string) });
    return json({ ok: true, ...await finishMfaEnrollment(context, token, body.challengeId as string, body.code as string) });
  } catch (error) {
    if (error instanceof MfaEnrollmentError) {
      const response = json({ ok: false, code: error.code, error: error.message }, error.status);
      if (error.retryAfterSeconds) response.headers.set("Retry-After", String(error.retryAfterSeconds));
      return response;
    }
    if (error instanceof FirebaseAuthEmailError) return json({ ok: false, code: error.code, error: error.message }, 503);
    // No OTPs, enrollment secrets, tokens or provider responses in logs.
    return json({ ok: false, error: "Nastavení 2FA teď není dostupné. Zkus to prosím znovu." }, 503);
  }
}

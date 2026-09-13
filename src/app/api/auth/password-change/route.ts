import { after, NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit, getRequestIp } from "@/lib/server/rateLimit";
import { authorizePasswordChange, completePasswordChange, PasswordChangeError, preparePasswordChange } from "@/lib/server/passwordChange";
import { deliverPasswordChanged } from "@/lib/server/passwordChangeEmail";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && !Array.isArray(value) && typeof value === "object" ? value : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
async function limit(key: string, scope: string, count: number) {
  const result = await consumeRateLimit({ namespace: `api:password-change:${scope}`, key, limit: count, windowMs: 15 * 60_000 });
  if (result.allowed && result.store !== "unavailable") return null;
  const response = json({ ok: false, code: "change/rate-limit", error: "Příliš mnoho pokusů nebo dočasně nedostupné ověření. Zkus to prosím později." }, result.store === "unavailable" ? 503 : 429);
  applyRateLimitHeaders(response.headers, result); return response;
}
export async function POST(req: Request) {
  try {
    if ((req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") {
      return json({ ok: false, error: "Požadavek není povolený." }, 403);
    }
    const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    if (!bearer || bearer.length > 16000) return json({ ok: false, code: "change/unauthorized", error: "Přihlas se prosím znovu." }, 401);
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false }, 415);
    const ipLimit = await limit(getRequestIp(req), "ip", 40); if (ipLimit) return ipLimit;
    if (!adminAuth) return json({ ok: false, error: "Ověření není dostupné." }, 503);
    let token;
    try { token = await adminAuth.verifyIdToken(bearer, true); }
    catch { return json({ ok: false, code: "change/unauthorized", error: "Přihlášení vypršelo. Přihlas se znovu." }, 401); }
    const body = await readBody(req);
    if (!body || !["prepare", "authorize", "complete"].includes(String(body.action)) ||
        Object.keys(body).some(k => !["action", "challengeId", "password", "code"].includes(k))) return json({ ok: false }, 400);
    if (body.action !== "prepare" && (typeof body.challengeId !== "string" || !/^[a-f\d-]{36}$/i.test(body.challengeId))) return json({ ok: false }, 400);
    if (body.action === "complete" && (typeof body.password !== "string" || typeof body.code !== "string" || body.code.length > 6)) return json({ ok: false }, 400);
    const userLimit = await limit(token.uid, String(body.action), body.action === "prepare" ? 3 : 12); if (userLimit) return userLimit;
    const user = await adminAuth.getUser(token.uid);
    if (user.disabled || !token.email || user.email?.trim().toLowerCase() !== token.email.trim().toLowerCase()) {
      return json({ ok: false, code: "change/unauthorized", error: "Přihlášení neodpovídá účtu." }, 401);
    }
    if (body.action === "prepare") return json({ ok: true, ...await preparePasswordChange(token, user) });
    if (body.action === "authorize") return json({ ok: true, ...await authorizePasswordChange(token, user, body.challengeId as string) });
    const result = await completePasswordChange(token, user, body.challengeId as string, body.password as string, body.code as string);
    if (result.pendingNoticeId) {
      const id = result.pendingNoticeId;
      after(async () => { try { await deliverPasswordChanged(id); } catch { /* Durable retry job remains. */ } });
    }
    return json({ ok: true, changed: result.changed, notificationSent: result.notificationSent });
  } catch (error) {
    if (error instanceof PasswordChangeError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    // Neither SDK errors, bodies, credentials nor account identifiers enter logs.
    return json({ ok: false, code: "change/unavailable", error: "Změnu hesla se teď nepodařilo ověřit. Zkus to prosím později." }, 503);
  }
}

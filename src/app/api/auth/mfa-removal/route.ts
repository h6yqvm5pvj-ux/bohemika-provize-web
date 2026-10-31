import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { completeMfaRemoval, MfaRemovalError, prepareMfaRemoval } from "@/lib/server/mfaRemoval";
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
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
async function limit(key: string, scope: string, count: number) {
  const result = await consumeRateLimit({ namespace: `api:mfa-removal:${scope}`, key, limit: count, windowMs: 10 * 60_000 });
  if (result.allowed && result.store !== "unavailable") return null;
  const response = json({ ok: false, code: "mfa-removal/rate-limit", error: "Příliš mnoho pokusů nebo dočasně nedostupné ověření. Zkus to později." }, result.store === "unavailable" ? 503 : 429);
  applyRateLimitHeaders(response.headers, result); return response;
}
export async function POST(req: Request) {
  try {
    if ((req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false }, 403);
    const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
    if (!bearer || bearer.length > 16000) return json({ ok: false, error: "Přihlas se znovu." }, 401);
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false }, 415);
    const ipLimit = await limit(getRequestIp(req), "ip", 40); if (ipLimit) return ipLimit;
    const body = await readBody(req);
    if (!body || (body.action !== "prepare" && body.action !== "complete") ||
        Object.keys(body).some(key => !["action", "challengeId"].includes(key)) ||
        (body.action === "complete" && (typeof body.challengeId !== "string" || !/^[a-f\d-]{36}$/.test(body.challengeId)))) return json({ ok: false }, 400);
    if (!adminAuth) return json({ ok: false, error: "Ověření není dostupné." }, 503);
    let token;
    try { token = await adminAuth.verifyIdToken(bearer, true); }
    catch { return json({ ok: false, error: "Přihlas se znovu a ověř 2FA." }, 401); }
    const userLimit = await limit(token.uid, String(body.action), body.action === "prepare" ? 3 : 10); if (userLimit) return userLimit;
    const user = await adminAuth.getUser(token.uid);
    return json({ ok: true, ...await (body.action === "prepare" ? prepareMfaRemoval(token, user) : completeMfaRemoval(token, user, body.challengeId as string, bearer)) });
  } catch (error) {
    if (error instanceof MfaRemovalError) return json({ ok: false, code: error.code, error: error.message }, error.status);
    // Never log tokens, account data or identity-provider responses.
    return json({ ok: false, error: "Odebrání 2FA teď není dostupné. Zkus to znovu." }, 503);
  }
}

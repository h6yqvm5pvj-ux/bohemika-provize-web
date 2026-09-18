import { NextResponse } from "next/server";
import { applyRateLimitHeaders, consumeRateLimit, getRequestIp } from "@/lib/server/rateLimit";
import { confirmPasswordResetWithRevocation, PasswordResetError } from "@/lib/server/passwordReset";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function readBody(req: Request): Promise<{ code: string; password: string } | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 32_768) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["code", "password"].includes(k)) ||
        typeof body.code !== "string" || !/^[a-zA-Z0-9_-]{1,2048}$/.test(body.code) ||
        typeof body.password !== "string" || body.password.length < 8 || body.password.length > 4096) return null;
    return body;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(req: Request) {
  try {
    if ((req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) || req.headers.get("sec-fetch-site") === "cross-site") {
      return json({ ok: false }, 403);
    }
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ ok: false }, 415);
    const limit = await consumeRateLimit({ namespace: "api:password-reset:confirm", key: getRequestIp(req), limit: 20, windowMs: 15 * 60_000 });
    if (!limit.allowed || limit.store === "unavailable") {
      const response = json({ ok: false, code: "auth/too-many-requests" }, limit.store === "unavailable" ? 503 : 429);
      applyRateLimitHeaders(response.headers, limit); return response;
    }
    const body = await readBody(req);
    if (!body) return json({ ok: false, code: "auth/invalid-argument" }, 400);
    await confirmPasswordResetWithRevocation(body.code, body.password);
    return json({ ok: true });
  } catch (error) {
    // Raw provider errors may contain action codes, passwords or account details.
    return error instanceof PasswordResetError ? json({ ok: false, code: error.code }, error.status)
      : json({ ok: false, code: "auth/reset-unavailable" }, 503);
  }
}

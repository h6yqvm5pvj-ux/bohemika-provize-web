import { NextResponse, type NextRequest } from "next/server";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_PUSH_URL =
  process.env.SEND_TEST_PUSH_URL?.trim() ||
  process.env.NEXT_PUBLIC_SEND_TEST_PUSH_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTestPush";

const TEST_PUSH_RATE_LIMIT = 20;
const TEST_PUSH_RATE_LIMIT_WINDOW_MS = 60_000;
const TEST_PUSH_MAX_MESSAGE_LEN = 200;

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

function parseMessage(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "Test push z Nastavení";
  }
  const row = raw as Record<string, unknown>;
  const message = typeof row.message === "string" ? row.message.trim() : "";
  if (!message) return "Test push z Nastavení";
  return message.slice(0, TEST_PUSH_MAX_MESSAGE_LEN);
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:test-push:post",
    limit: TEST_PUSH_RATE_LIMIT,
    windowMs: TEST_PUSH_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const message = parseMessage(body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const upstream = await fetch(TEST_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.token}`,
      },
      body: JSON.stringify({ message }),
      signal: controller.signal,
      cache: "no-store",
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok || (upstreamPayload as { ok?: boolean } | null)?.ok === false) {
      const errorMessage =
        readError(upstreamPayload) ||
        `Odeslání testovací notifikace selhalo (HTTP ${upstream.status}).`;
      const response = NextResponse.json(
        { ok: false, error: errorMessage },
        { status: upstream.ok ? 502 : upstream.status }
      );
      return withRateLimitHeaders(response, ctx);
    }

    return withRateLimitHeaders(
      NextResponse.json(
      upstreamPayload && typeof upstreamPayload === "object"
        ? upstreamPayload
        : { ok: true }
      ),
      ctx
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    return withRateLimitHeaders(
      NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "Odeslání testovací notifikace timeoutovalo."
          : "Nepodařilo se spojit se službou pro push notifikace.",
      },
      { status: 504 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}

import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_ASSISTANT_URL =
  process.env.AI_ASSISTANT_URL?.trim() ||
  process.env.NEXT_PUBLIC_AI_ASSISTANT_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/aiAssistant";

const AI_ASSISTANT_RATE_LIMIT = 30;
const AI_ASSISTANT_RATE_LIMIT_WINDOW_MS = 60_000;
const AI_PROMPT_MAX_LEN = 12_000;

type AiAssistantPayload = {
  prompt: string;
};

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

function parsePayload(raw: unknown): AiAssistantPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!prompt) return null;
  return {
    prompt: prompt.slice(0, AI_PROMPT_MAX_LEN),
  };
}

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:ai-assistant:post",
    limit: AI_ASSISTANT_RATE_LIMIT,
    windowMs: AI_ASSISTANT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return withRateLimitHeaders(
      NextResponse.json(
      { ok: false, error: "Neplatný payload pro AI asistenta." },
      { status: 400 }
      ),
      ctx
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const upstream = await fetch(AI_ASSISTANT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const upstreamPayload = await upstream.json().catch(() => null);
    if (!upstream.ok || (upstreamPayload as { ok?: boolean } | null)?.ok === false) {
      const errorMessage =
        readError(upstreamPayload) || `AI asistent selhal (HTTP ${upstream.status}).`;
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
        : { ok: true, reply: "" }
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
          ? "AI asistent timeoutoval."
          : "Nepodařilo se spojit se službou AI asistenta.",
      },
      { status: 504 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}

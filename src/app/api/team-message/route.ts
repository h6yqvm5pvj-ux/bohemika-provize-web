import { NextResponse, type NextRequest } from "next/server";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_MESSAGE_URL =
  process.env.SEND_TEAM_MESSAGE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SEND_TEAM_MESSAGE_URL?.trim() ||
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net/sendTeamMessage";

const TEAM_MESSAGE_RATE_LIMIT = 20;
const TEAM_MESSAGE_RATE_LIMIT_WINDOW_MS = 60_000;
const TEAM_MESSAGE_MAX_LEN = 200;

type TargetMode = "all" | "selected";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parsePayload(raw: unknown):
  | {
      managerEmail: string;
      message: string;
      target: TargetMode;
      recipients?: string[];
    }
  | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const managerEmail = normalizeEmail(row.managerEmail);
  const message =
    typeof row.message === "string" ? row.message.trim().slice(0, TEAM_MESSAGE_MAX_LEN) : "";
  const target = row.target === "selected" ? "selected" : "all";
  const recipientsRaw = Array.isArray(row.recipients) ? row.recipients : [];
  const recipients = recipientsRaw
    .map((item) => normalizeEmail(item))
    .filter((email) => email.length > 0);

  if (!managerEmail || !message) return null;
  if (target === "selected" && recipients.length === 0) return null;

  return {
    managerEmail,
    message,
    target,
    ...(target === "selected" ? { recipients } : {}),
  };
}

function readError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const candidate = row.error ?? row.message ?? row.detail;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:team-message:post",
    limit: TEAM_MESSAGE_RATE_LIMIT,
    windowMs: TEAM_MESSAGE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return withRateLimitHeaders(
      NextResponse.json(
      { ok: false, error: "Neplatný payload pro odeslání týmové zprávy." },
      { status: 400 }
      ),
      ctx
    );
  }

  if (payload.managerEmail !== ctx.email) {
    return withRateLimitHeaders(
      NextResponse.json(
      { ok: false, error: "managerEmail musí odpovídat přihlášenému účtu." },
      { status: 403 }
      ),
      ctx
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const upstream = await fetch(TEAM_MESSAGE_URL, {
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
        readError(upstreamPayload) || `Odeslání zprávy selhalo (HTTP ${upstream.status}).`;
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
          ? "Odeslání týmové zprávy timeoutovalo."
          : "Nepodařilo se spojit se službou pro týmové zprávy.",
      },
      { status: 504 }
      ),
      ctx
    );
  } finally {
    clearTimeout(timeout);
  }
}

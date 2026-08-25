import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSTS_COLLECTION = "intranetWallPosts";
const POLL_VOTE_RATE_LIMIT = 120;
const POLL_VOTE_RATE_LIMIT_WINDOW_MS = 60_000;

type RouteParams = {
  postId: string;
};

type WallPollOption = {
  id: string;
  text: string;
  voteCount: number;
};

type WallPoll = {
  id: string;
  question: string;
  totalVotes: number;
  selectedOptionId: string | null;
  options: WallPollOption[];
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const resolvePostId = (raw: string): string =>
  normalizeText(raw).replace(/[^\w-]/g, "");

const normalizePollOptionId = (value: unknown): string =>
  normalizeText(value).replace(/[^\w-]/g, "");

const parsePollVotes = (value: unknown): Array<{ email: string; optionId: string }> => {
  if (!Array.isArray(value)) return [];
  const votesByEmail = new Map<string, string>();

  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    const email = normalizeEmail(raw.email);
    const optionId = normalizePollOptionId(raw.optionId);
    if (!email || !optionId) continue;
    votesByEmail.set(email, optionId);
  }

  return Array.from(votesByEmail, ([email, optionId]) => ({ email, optionId }));
};

const parsePoll = (
  pollRaw: unknown,
  votesRaw: unknown,
  viewerEmail: string
): WallPoll | null => {
  if (!isPlainObject(pollRaw)) return null;
  const id = normalizeText(pollRaw.id) || "poll";
  const question = normalizeText(pollRaw.question);
  const optionsRaw = Array.isArray(pollRaw.options) ? pollRaw.options : [];
  const options = optionsRaw
    .map((optionRaw): { id: string; text: string } | null => {
      if (!isPlainObject(optionRaw)) return null;
      const optionId = normalizePollOptionId(optionRaw.id);
      const text = normalizeText(optionRaw.text);
      if (!optionId || !text) return null;
      return { id: optionId, text };
    })
    .filter((option): option is { id: string; text: string } => option !== null);

  if (!question || options.length < 2) return null;

  const optionIds = new Set(options.map((option) => option.id));
  const countsByOptionId = new Map(options.map((option) => [option.id, 0]));
  const votes = parsePollVotes(votesRaw).filter((vote) => optionIds.has(vote.optionId));
  votes.forEach((vote) => {
    countsByOptionId.set(vote.optionId, (countsByOptionId.get(vote.optionId) ?? 0) + 1);
  });

  return {
    id,
    question,
    totalVotes: votes.length,
    selectedOptionId: viewerEmail
      ? votes.find((vote) => vote.email === viewerEmail)?.optionId ?? null
      : null,
    options: options.map((option) => ({
      ...option,
      voteCount: countsByOptionId.get(option.id) ?? 0,
    })),
  };
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:intranet-wall:poll-vote",
    limit: POLL_VOTE_RATE_LIMIT,
    windowMs: POLL_VOTE_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firestore)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const params = await context.params;
  const postId = resolvePostId(params.postId);
  if (!postId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatné ID příspěvku." },
        { status: 400 }
      ),
      ctx
    );
  }

  const viewerEmail = normalizeEmail(ctx.email);
  if (!viewerEmail) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se ověřit uživatele." },
        { status: 401 }
      ),
      ctx
    );
  }

  let selectedOptionId = "";
  try {
    const body = await req.json();
    if (!isPlainObject(body)) throw new Error("Invalid body");
    selectedOptionId = normalizePollOptionId(body.optionId);
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný formát požadavku." },
        { status: 400 }
      ),
      ctx
    );
  }

  if (!selectedOptionId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Vyber možnost ankety." },
        { status: 400 }
      ),
      ctx
    );
  }

  const postRef = adminDb.collection(POSTS_COLLECTION).doc(postId);
  let nextPoll: WallPoll | null = null;

  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(postRef);
      if (!snap.exists) {
        throw new Error("POST_NOT_FOUND");
      }

      const raw = (snap.data() ?? {}) as Record<string, unknown>;
      const poll = parsePoll(raw.poll, raw.pollVotes, viewerEmail);
      if (!poll) {
        throw new Error("POLL_NOT_FOUND");
      }
      if (!poll.options.some((option) => option.id === selectedOptionId)) {
        throw new Error("POLL_OPTION_NOT_FOUND");
      }

      const currentVotes = parsePollVotes(raw.pollVotes);
      const nextVotes = [
        ...currentVotes.filter((vote) => vote.email !== viewerEmail),
        {
          email: viewerEmail,
          optionId: selectedOptionId,
          votedAtMs: Date.now(),
        },
      ];

      tx.update(postRef, {
        pollVotes: nextVotes,
        pollUpdatedAt: FieldValue.serverTimestamp(),
      });

      nextPoll = parsePoll(raw.poll, nextVotes, viewerEmail);
    });

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, postId, poll: nextPoll }),
      ctx
    );
  } catch (error) {
    if (error instanceof Error && error.message === "POST_NOT_FOUND") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Příspěvek už neexistuje." },
          { status: 404 }
        ),
        ctx
      );
    }
    if (error instanceof Error && error.message === "POLL_NOT_FOUND") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Anketa nebyla nalezena." },
          { status: 404 }
        ),
        ctx
      );
    }
    if (error instanceof Error && error.message === "POLL_OPTION_NOT_FOUND") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Možnost ankety nebyla nalezena." },
          { status: 400 }
        ),
        ctx
      );
    }
    console.error("Intranet wall poll vote failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se uložit hlas." },
        { status: 500 }
      ),
      ctx
    );
  }
}

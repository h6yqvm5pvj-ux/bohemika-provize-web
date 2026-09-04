import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STREAM_RATE_LIMIT = 80;
const STREAM_RATE_LIMIT_WINDOW_MS = 60_000;
const STREAM_LIFETIME_MS = 55_000;
const KEEP_ALIVE_MS = 15_000;

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:stream:get",
    limit: STREAM_RATE_LIMIT,
    windowMs: STREAM_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
      guard.ctx
    );
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepAliveId: ReturnType<typeof setInterval> | null = null;
  let lifetimeId: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    if (keepAliveId) clearInterval(keepAliveId);
    if (lifetimeId) clearTimeout(lifetimeId);
    req.signal.removeEventListener("abort", cleanup);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: string) => {
        if (!closed) controller.enqueue(encoder.encode(payload));
      };
      send("retry: 1500\n\n");

      unsubscribe = adminDb!
        .collection("usersPrivate")
        .doc(guard.ctx.email)
        .collection("mailbox")
        .orderBy("createdAtMs", "desc")
        .limit(80)
        .onSnapshot(
          (snapshot) => {
            const changedIds = snapshot.docChanges().map((change) => change.doc.id);
            send(`event: mailbox\ndata: ${JSON.stringify({ changedIds, atMs: Date.now() })}\n\n`);
          },
          (error) => {
            console.error("Mailbox realtime listener failed:", error);
            send("event: stream-error\ndata: {}\n\n");
            cleanup();
            controller.close();
          }
        );

      keepAliveId = setInterval(() => send(": keep-alive\n\n"), KEEP_ALIVE_MS);
      lifetimeId = setTimeout(() => {
        cleanup();
        controller.close();
      }, STREAM_LIFETIME_MS);
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return withRateLimitHeaders(
    new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }),
    guard.ctx
  );
}

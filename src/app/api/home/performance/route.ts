import { NextResponse, type NextRequest } from "next/server";
import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { parseHomePerformance } from "@/app/home/homePerformanceProtocol";

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, { namespace: "api:home:performance", limit: 20, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  const respond = (status: number) => withRateLimitHeaders(NextResponse.json({ ok: status === 200 }, { status, headers: { "Cache-Control": "private, no-store" } }), guard.ctx);
  // Bound streamed bodies too, rather than trusting Content-Length.
  const reader = req.body?.getReader();
  if (!reader) return respond(400);
  let raw = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return respond(413); }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const samples = parseHomePerformance(JSON.parse(raw));
    if (!samples) return respond(400);
    console.info(JSON.stringify({ event: "home.performance", version: 1, samples }));
    return respond(200);
  } catch { return respond(400); }
  finally { reader.releaseLock(); }
}

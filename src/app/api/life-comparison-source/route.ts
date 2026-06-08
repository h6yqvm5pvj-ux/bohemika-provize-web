import { NextResponse, type NextRequest } from "next/server";

import { resolveLifeComparisonSourcePayload } from "@/lib/server/lifeComparisonSource";
import { requireIpRateLimited, withIpRateLimitHeaders } from "@/lib/server/apiEntryGuard";

const LIFE_COMPARISON_SOURCE_RATE_LIMIT = 80;
const LIFE_COMPARISON_SOURCE_RATE_LIMIT_WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const guard = await requireIpRateLimited(req, {
    namespace: "api:life-comparison-source:get",
    limit: LIFE_COMPARISON_SOURCE_RATE_LIMIT,
    windowMs: LIFE_COMPARISON_SOURCE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  return withIpRateLimitHeaders(
    NextResponse.json(resolveLifeComparisonSourcePayload()),
    guard.ctx
  );
}

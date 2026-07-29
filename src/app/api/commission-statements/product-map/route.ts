import { NextResponse, type NextRequest } from "next/server";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { readStatementProductMapConfig } from "@/lib/server/commissionStatementProductMap";

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "commission-statement-product-map",
    limit: 120,
    windowMs: 60_000,
    allowImpersonation: true,
    enforceAdvisorSetup: false,
  });
  if (!guard.ok) return guard.response;

  try {
    const config = await readStatementProductMapConfig();
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        entries: config.entries,
        updatedAtMs: config.updatedAtMs,
        updatedBy: config.updatedBy,
      }),
      guard.ctx
    );
  } catch (error) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Produktovou mapu výpisů se nepodařilo načíst.",
        },
        { status: 500 }
      ),
      guard.ctx
    );
  }
}

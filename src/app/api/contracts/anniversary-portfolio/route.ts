import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { InvalidPortfolioCursorError, readAnniversaryPortfolioPage } from "../_lib/contractsApi.anniversaryPortfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:anniversary-portfolio:get",
    limit: 120,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const respond = (body: Record<string, unknown>, status = 200) => withRateLimit(
    NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
  );
  if (ctx.accountType === "tipster") {
    return respond({ ok: false, error: "Nedostupné pro tipařský účet." }, 403);
  }
  if (!adminDb) return respond({ ok: false, error: "Server není správně nakonfigurován." }, 500);

  try {
    const page = await readAnniversaryPortfolioPage({
      db: adminDb,
      // Use the same own/team scope as the contracts list, determined by the server.
      owners: [ctx.email, ...ctx.teamEmails],
      cursor: req.nextUrl.searchParams.get("cursor"),
    });
    return respond({ ok: true, position: ctx.position, ...page });
  } catch (error) {
    if (error instanceof InvalidPortfolioCursorError) {
      return respond({ ok: false, error: error.message }, 400);
    }
    console.error("Anniversary portfolio could not be loaded", error);
    return respond({ ok: false, error: "Nepodařilo se načíst celé portfolio smluv. Zkus to prosím znovu." }, 503);
  }
}

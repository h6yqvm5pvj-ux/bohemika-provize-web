import { NextRequest, NextResponse } from "next/server";
import { requireContractsEntryGuard } from "@/app/api/contracts/_lib/contractsApi";
import { isClientCardSlug } from "@/app/_klienti/clientIdentity";
import { readClientScope } from "@/app/_klienti/clientScope";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { advanceSharedClientIndex } from "@/lib/server/clientContractIndex";
import { readSharedClientContracts } from "@/lib/server/clientContractSharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const privateResponse = (response: NextResponse) => {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
};

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const guard = await requireContractsEntryGuard(req, { namespace: "api:client-cards:shared-contracts", limit: 120, windowMs: 60_000 });
    if (!guard.ok) return privateResponse(guard.response);
    const { ctx } = guard;
    const respond = (body: unknown, status = 200) => privateResponse(guard.withRateLimit(NextResponse.json(body, { status })));
    if (ctx.isImpersonating) return respond({ ok: false, error: "Sdílený přehled není při zastupování dostupný." }, 403);
    if (!adminDb) return respond({ ok: false, error: "Úložiště není dostupné." }, 503);
    const { slug } = await context.params;
    if (!isClientCardSlug(slug)) return respond({ ok: false, error: "Karta klienta nebyla nalezena." }, 404);
    const users = new Map(ctx.users.map(user => [user.email, user]));
    const viewer = {
      email: ctx.email,
      teamEmails: ctx.teamEmails.filter(email => users.get(email)?.accountType !== "tipster"),
      selection: req.nextUrl.searchParams.has("scope") && req.nextUrl.searchParams.get("scope") !== "all" ? readClientScope(req.nextUrl.searchParams) : null,
      adviserNames: new Map(ctx.users.map(user => [user.email, user.name])),
    };
    const initial = await readSharedClientContracts(adminDb, slug, viewer);
    if (!initial) return respond({ ok: false, error: "Karta klienta nebyla nalezena." }, 404);
    if (!initial.matchingAvailable) return respond({ ok: true, ...initial, indexing: false });
    const ready = await advanceSharedClientIndex(adminDb, ctx.users.filter(user => user.accountType === "advisor").map(user => user.email));
    // Recheck association after migration: a concurrent delete/transfer of the
    // viewer's last contract must revoke the shared overview as well.
    const result = await readSharedClientContracts(adminDb, slug, viewer);
    if (!result) return respond({ ok: false, error: "Karta klienta již není dostupná." }, 404);
    return respond({ ok: true, ...result, indexing: !ready });
  } catch {
    return privateResponse(NextResponse.json({ ok: false, error: "Další smlouvy klienta se nepodařilo načíst." }, { status: 500 }));
  }
}

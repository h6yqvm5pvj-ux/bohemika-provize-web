import { NextRequest, NextResponse } from "next/server";
import { canAccessClientCards } from "@/app/_klienti/clientAccess";
import { isClientCardSlug } from "@/app/_klienti/clientIdentity";
import { readClientScope } from "@/app/_klienti/clientScope";
import { requireContractsEntryGuard } from "@/app/api/contracts/_lib/contractsApi";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { ensureClientContractIndex, readClientContractLinks } from "@/lib/server/clientContractIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

// Limit Firestore concurrency for larger teams.
async function mapOwners<T>(owners: string[], work: (owner: string) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < owners.length; i += 6) results.push(...await Promise.all(owners.slice(i, i + 6).map(work)));
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireContractsEntryGuard(req, { namespace: "api:client-cards:contracts", limit: 120, windowMs: 60_000 });
    if (!guard.ok) return privateResponse(guard.response);
    const { ctx } = guard;
    const respond = (body: unknown, status = 200) => privateResponse(guard.withRateLimit(NextResponse.json(body, { status })));
    if (!canAccessClientCards(ctx.email) || ctx.isImpersonating) return respond({ ok: false, error: "Nemáš oprávnění ke klientským kartám." }, 403);
    if (!adminDb) return respond({ ok: false, error: "Úložiště není dostupné." }, 503);
    const db = adminDb;
    const slug = req.nextUrl.searchParams.get("clientSlug");
    if (slug !== null && !isClientCardSlug(slug)) return respond({ ok: false, error: "Neplatná karta klienta." }, 400);
    const selection = readClientScope(req.nextUrl.searchParams);
    const users = new Map(ctx.users.map(user => [user.email, user]));
    // Use the actual subordinate hierarchy, never the wider admin access list.
    const teamAdvisers = [...new Set(ctx.teamEmails)].filter(email => email !== ctx.email && users.get(email)?.accountType !== "tipster")
      .map(email => ({ email, name: users.get(email)?.name ?? null }));
    const teamEmails = teamAdvisers.map(adviser => adviser.email);
    const owners = [ctx.email, ...teamEmails];
    const authors = slug && req.nextUrl.searchParams.get("scope") === "all" ? null
      : selection.scope === "my" ? [ctx.email]
      : teamEmails.filter(email => !selection.advisers.length || selection.advisers.includes(email));
    if (authors?.length === 0) return respond({ ok: true, contracts: [], teamAdvisers });
    const states = await mapOwners(owners, owner => ensureClientContractIndex(db, owner));
    if (states.some(state => !state.ready)) return respond({ ok: true, indexing: true, indexedContracts: states.reduce((total, state) => total + state.processed, 0), teamAdvisers });
    const contracts = (await mapOwners(owners, owner => readClientContractLinks(db, owner, authors, slug, users.get(owner)?.name ?? null))).flat();
    return respond({ ok: true, contracts, teamAdvisers });
  } catch {
    return privateResponse(NextResponse.json({ ok: false, error: "Smlouvy klientů se nepodařilo načíst. Zkus to prosím znovu." }, { status: 500 }));
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { readContractHistory } from "@/lib/server/contractHistory";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { hasContractAccess } from "../_lib/contractsApi.access";
import { isSafeContractNoteId } from "../notes/contractNotes";

export async function GET(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, { namespace: "api:contracts:history", limit: 120, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  const reply = (body: unknown, status = 200) => guard.withRateLimit(NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }));
  const ownerEmail = (req.nextUrl.searchParams.get("ownerEmail") ?? "").trim().toLowerCase();
  const entryId = req.nextUrl.searchParams.get("entryId") ?? "";
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(ownerEmail) || !isSafeContractNoteId(entryId) || (cursor && (cursor.length > 300 || !/^[\w-]+$/.test(cursor)))) return reply({ ok: false, error: "Neplatná identifikace smlouvy nebo stránky." }, 400);
  if (!adminDb) return reply({ ok: false, error: "Server není správně nakonfigurován." }, 500);
  const ref = adminDb.collection("users").doc(ownerEmail).collection("entries").doc(entryId);
  const snap = await ref.get();
  if (!snap.exists) return reply({ ok: false, error: "Smlouva nebyla nalezena." }, 404);
  const contract = snap.data() ?? {};
  if (!hasContractAccess({ viewerEmail: guard.ctx.email, teamEmails: guard.ctx.contractAccessEmails, ownerEmail, contract })) return reply({ ok: false, error: "Nemáš oprávnění k historii této smlouvy." }, 403);
  // Resolve the stable history pointer ONLY through the currently accessible
  // contract. Knowing a former owner's path or a history ID grants no access.
  try {
    return reply({ ok: true, ...await readContractHistory(ref, contract, cursor) });
  } catch (err) {
    if (err instanceof SyntaxError || (err instanceof Error && err.message === "Neplatná stránka historie.")) return reply({ ok: false, error: "Neplatná stránka historie." }, 400);
    console.error("Contract history read failed", err);
    return reply({ ok: false, error: "Historii se nepodařilo načíst." }, 500);
  }
}

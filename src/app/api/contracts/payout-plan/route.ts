import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { withCashflowMutation, trackCashflowWrite } from "@/lib/server/cashflowMutationTracking";
import { withContractHistory } from "@/lib/server/contractHistory";
import { buildPayoutPlanPreview, PayoutMatchingError, updatePayoutPlanMatch } from "@/lib/server/cashflowPayoutMatching";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { normalizedPayoutEmail } from "@/app/cashflow/payoutPlanMatching";
import type { EntryDoc } from "@/app/cashflow/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:payout-plan", limit: 60, windowMs: 60_000,
  }, { freshCashflowContext: true });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const response = (data: unknown, status = 200) => withRateLimit(NextResponse.json(data, {
    status, headers: { "Cache-Control": "no-store" },
  }));
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch { return response({ ok: false, error: "Neplatný požadavek." }, 400); }
  const owner = typeof body.ownerEmail === "string" ? normalizedPayoutEmail(body.ownerEmail) : "";
  const email = normalizedPayoutEmail(ctx.email);
  const allowed = new Set([email, ...ctx.contractAccessEmails.map(normalizedPayoutEmail)]);
  if (!owner || !allowed.has(owner)) return response({ ok: false, error: "Ke smlouvě nemáš přístup." }, 403);
  const entryId = body.entryId;
  if (typeof entryId !== "string" || !/^[\w-]{1,200}$/.test(entryId) || !["preview", "assign", "remove"].includes(String(body.operation))) {
    return response({ ok: false, error: "Neplatná smlouva nebo operace." }, 400);
  }
  if (body.operation !== "preview" && (typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision) ||
    typeof body.payoutKey !== "string" || !body.payoutKey || body.payoutKey.length > 2000 ||
    (body.operation === "assign" && (typeof body.targetKey !== "string" || body.targetKey.length > 100)))) {
    return response({ ok: false, error: "Chybí platný náhled a výběr výplaty." }, 400);
  }
  if (!adminDb) return response({ ok: false, error: "Databáze není dostupná." }, 503);
  const ref = adminDb.collection("users").doc(owner).collection("entries").doc(entryId);
  const asOf = new Date();
  const entryFromSnapshot = (snapshot: FirebaseFirestore.DocumentSnapshot): EntryDoc => {
    if (!snapshot.exists) throw new PayoutMatchingError("Smlouva nebyla nalezena.", 404);
    // The document path is authoritative, never a client-supplied recipient.
    const entry = { ...snapshot.data(), id: entryId, userEmail: owner } as EntryDoc;
    if (entry.productKey !== "kooperativaAuto") throw new PayoutMatchingError("Přiřazení C výplat je určeno pro Kooperativu Auto.", 400);
    return entry;
  };
  try {
    if (body.operation === "preview") return response({ ok: true, preview: buildPayoutPlanPreview(entryFromSnapshot(await ref.get()), email, asOf) });
    const preview = await withCashflowMutation("contracts:payout-plan", () => trackCashflowWrite(() => ref.firestore.runTransaction(async tx => {
      const entry = entryFromSnapshot(await tx.get(ref));
      const matches = updatePayoutPlanMatch({
        entry, viewerEmail: email, actorEmail: ctx.actorEmail,
        revision: body.revision as string, payoutKey: body.payoutKey as string,
        targetKey: body.operation === "assign" ? body.targetKey as string : null, asOf,
      });
      tx.update(ref, withContractHistory(tx, ref, entry, { cashflowPayoutMatches: matches }, {
        actorEmail: ctx.actorEmail, kind: "updated", title: "Upraveno přiřazení výplaty v cashflow",
        // Financial details have recipient-specific permissions, unlike shared history.
        changes: [],
      }));
      return buildPayoutPlanPreview({ ...entry, cashflowPayoutMatches: matches }, email, asOf);
    })));
    return response({ ok: true, preview });
  } catch (error) {
    if (error instanceof PayoutMatchingError) return response({ ok: false, error: error.message }, error.status);
    console.error("Přiřazení výplaty v cashflow selhalo.");
    return response({ ok: false, error: "Přiřazení se nepodařilo uložit. Obnov přehled a zkus to znovu." }, 500);
  }
}

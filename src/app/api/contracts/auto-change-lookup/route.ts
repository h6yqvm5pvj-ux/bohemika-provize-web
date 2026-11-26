import { NextResponse, type NextRequest } from "next/server";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { autoPaymentFrequencies } from "@/app/lib/autoPaymentFrequency";
import type { Product } from "@/app/types/domain";

/** Contract numbers stay in the request body, outside browser URLs and access logs. */
export async function POST(request: NextRequest) {
  const guard = await requireContractsEntryGuard(request, { namespace: "api:contracts:auto-change-lookup", limit: 30, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  const respond = (status: number, error: string) => guard.withRateLimit(NextResponse.json({ ok: false, error }, { status }));
  if (guard.ctx.accountType === "tipster") return respond(403, "Nemáš oprávnění měnit smlouvy.");
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond(400, "Neplatný požadavek.");
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => !["ownerEmail", "contractNumber", "productKey"].includes(key)) ||
    typeof data.ownerEmail !== "string" || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(data.ownerEmail) || data.ownerEmail.length > 254 ||
    typeof data.contractNumber !== "string" || !data.contractNumber.trim() || data.contractNumber.length > 100 ||
    typeof data.productKey !== "string" || !autoPaymentFrequencies(data.productKey as Product).length) return respond(400, "Vyplň platné číslo smlouvy a produkt auta.");
  const owner = data.ownerEmail.trim().toLowerCase();
  if (![guard.ctx.email, ...guard.ctx.contractAccessEmails].includes(owner)) return respond(403, "Nemáš oprávnění k tomuto poradci.");
  if (!adminDb) return respond(503, "Služba je dočasně nedostupná.");
  try {
    const number = data.contractNumber.trim();
    const variants = [...new Set([number, number.replace(/\s/g, "")])];
    const snapshot = await adminDb.collection("users").doc(owner).collection("entries").where("contractNumber", "in", variants).limit(100).get();
    const matches = snapshot.docs.filter(doc => {
      const contract = doc.data();
      return contract.entryType !== "endorsement" && contract.productKey === data.productKey &&
        (!contract.userEmail || contract.userEmail.trim().toLowerCase() === owner);
    });
    if (snapshot.size >= 100 || matches.length > 1) return respond(409, "Číslu odpovídá více záznamů. Otevři konkrétní detail smlouvy.");
    if (!matches.length) return respond(404, "Smlouva pro vybraný produkt a poradce nebyla nalezena.");
    return guard.withRateLimit(NextResponse.json({ ok: true, entryId: matches[0].id }));
  } catch { return respond(503, "Smlouvu nelze načíst. Zkus to znovu."); }
}

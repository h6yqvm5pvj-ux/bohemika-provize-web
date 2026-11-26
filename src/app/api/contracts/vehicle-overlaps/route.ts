import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { isContractOwnerEmail, readContractFormBody } from "../_lib/contractRequestForm";
import { readVehicleOverlaps } from "../_lib/contractsApi.vehicleOverlap";
import { isSafeContractNoteId } from "../notes/contractNotes";

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, { namespace: "api:contracts:vehicle-overlaps", limit: 12, windowMs: 60_000 });
  if (!guard.ok) return guard.response;
  const { email, contractAccessEmails } = guard.ctx;
  const respond = (body: Record<string, unknown>, status = 200) => guard.withRateLimit(NextResponse.json(body, {
    status, headers: { "Cache-Control": "private, no-store" },
  }));
  const form = await readContractFormBody(req, 24 * 1024);
  if (typeof form === "number") return respond({ ok: false, error: "Neplatný požadavek na kontrolu vozidla." }, form);
  const ownerEmail = form.get("ownerEmail")?.trim().toLowerCase() ?? "";
  const entryIds = form.getAll("entryId");
  if (!isContractOwnerEmail(ownerEmail) || form.getAll("ownerEmail").length !== 1 ||
      [...form.keys()].some(key => key !== "ownerEmail" && key !== "entryId") ||
      entryIds.length < 1 || entryIds.length > 100 || !entryIds.every(isSafeContractNoteId)) {
    return respond({ ok: false, error: "Neplatný požadavek na kontrolu vozidla." }, 400);
  }
  if (ownerEmail !== email && !contractAccessEmails.includes(ownerEmail)) {
    return respond({ ok: false, error: "K těmto smlouvám nemáš přístup." }, 403);
  }
  if (!adminDb) return respond({ ok: false, error: "Kontrola vozidla je dočasně nedostupná." }, 503);
  try {
    const result = await readVehicleOverlaps({
      db: adminDb, ownerEmail, entryIds: [...new Set(entryIds)], viewerEmail: email,
      accessibleOwners: contractAccessEmails, signal: req.signal,
    });
    return respond({ ok: true, ...result });
  } catch {
    return respond({ ok: false, error: "Kontrolu vozidla se nepodařilo dokončit." }, 503);
  }
}

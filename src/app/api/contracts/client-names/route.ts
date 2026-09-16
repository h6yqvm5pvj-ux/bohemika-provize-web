import { NextResponse, type NextRequest } from "next/server";
import { requireContractsEntryGuard } from "../_lib/contractsApi";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { clientNameExactKey } from "@/app/kalkulacka/clientNameMatching";

export async function GET(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:client-names", limit: 60, windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  const owner = (req.nextUrl.searchParams.get("ownerEmail") || ctx.email).trim().toLowerCase();
  if (owner !== ctx.email.toLowerCase() && !ctx.teamEmails.some(email => email.toLowerCase() === owner)) {
    return withRateLimit(NextResponse.json({ ok: false, error: "Nemáš oprávnění zobrazit klienty tohoto poradce." }, { status: 403 }));
  }
  try {
    if (!adminDb) throw new Error("Database unavailable");
    // Fetch only names, including legacy contracts without a sortable date.
    // One projection replaces repeated pages of full contract documents.
    const snapshot = await adminDb.collection("users").doc(owner).collection("entries").select("clientName").get();
    const names = new Map<string, string>();
    for (const doc of snapshot.docs) {
      const rawName: unknown = doc.data().clientName;
      if (typeof rawName !== "string") continue;
      const name = rawName.normalize("NFC").trim().replace(/\s+/g, " ");
      const key = clientNameExactKey(name);
      if (key && !names.has(key)) names.set(key, name);
    }
    return withRateLimit(NextResponse.json({ ok: true, names: [...names.values()] }, {
      headers: { "Cache-Control": "private, no-store" },
    }));
  } catch {
    return withRateLimit(NextResponse.json({ ok: false, error: "Seznam jmen klientů se nepodařilo načíst." }, { status: 503 }));
  }
}

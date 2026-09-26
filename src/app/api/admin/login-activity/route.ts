import { NextRequest, NextResponse } from "next/server";
import { adminAuthErrorResponse, getAdminAuthContext } from "@/lib/server/adminAuth";
import { consumeRateLimit } from "@/lib/server/rateLimit";
import { readLoginActivity } from "@/lib/server/loginActivity";
import { readFirebaseLoginActivity } from "@/lib/server/firebaseLoginActivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export async function GET(req: NextRequest) {
  try {
    const context = await getAdminAuthContext(req, { minimumRole: "admin", actionLabel: "zobrazení historie přihlášení" });
    if ("error" in context) return noStore(adminAuthErrorResponse(context));
    const days = Number(req.nextUrl.searchParams.get("days") || "90"), source = req.nextUrl.searchParams.get("source") || "web";
    if (![1, 7, 30, 90].includes(days) || !["web", "firebase"].includes(source)) return noStore(NextResponse.json({ ok: false, error: "Neplatný filtr historie." }, { status: 400 }));
    const rate = await consumeRateLimit({ namespace: "admin:login-activity", key: context.adminUid, limit: 30, windowMs: 60_000 });
    if (!rate.allowed) return noStore(NextResponse.json({ ok: false, error: "Přehled nelze nyní obnovit. Zkus to za chvíli." }, { status: rate.store === "unavailable" ? 503 : 429 }));
    const cursor = req.nextUrl.searchParams.get("cursor");
    const data = source === "firebase" ? await readFirebaseLoginActivity(days, cursor) : await readLoginActivity(days, cursor);
    return noStore(NextResponse.json(data));
  } catch (error) {
    const invalid = error instanceof Error && error.message === "INVALID_ACTIVITY_CURSOR";
    return noStore(NextResponse.json({ ok: false, error: invalid ? "Stránkování vypršelo. Obnov přehled." : "Historii přihlášení se nepodařilo načíst. Neznamená to, že nebyly zaznamenány žádné pokusy." }, { status: invalid ? 400 : 503 }));
  }
}

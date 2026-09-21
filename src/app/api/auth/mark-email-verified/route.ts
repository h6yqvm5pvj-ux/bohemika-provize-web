import { NextResponse } from "next/server";
import { adminAuthErrorResponse, getAdminAuthContext } from "@/lib/server/adminAuth";

export const runtime = "nodejs";

// Retained for old callers, but verification must be completed through the inbox.
export async function POST(req: Request) {
  const ctx = await getAdminAuthContext(req, {
    minimumRole: "admin",
    actionLabel: "ověření e-mailu",
  });
  if ("error" in ctx) return adminAuthErrorResponse(ctx);
  return NextResponse.json({
    ok: false,
    error: "Ruční ověření e-mailu už není dostupné. Odešli uživateli ověřovací e-mail; odkaz musí potvrdit ve své schránce.",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}

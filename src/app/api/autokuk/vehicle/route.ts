import { NextRequest, NextResponse } from "next/server";
import { requireAdvisorAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { AutokukError, lookupAutokukVehicle } from "@/lib/server/autokuk";
import { isValidVehicleQuery, normalizeVehicleQuery } from "@/app/lib/vehicleLookupQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:autokuk:vehicle", limit: 30, windowMs: 10 * 60_000,
  });
  if (!guard.ok) return guard.response;
  const respond = (body: unknown, status: number, retryAfter?: number) => {
    const response = withRateLimitHeaders(NextResponse.json(body, { status }), guard.ctx);
    response.headers.set("Cache-Control", "private, no-store");
    if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
    return response;
  };
  const body: unknown = await req.json().catch(() => null);
  const query = normalizeVehicleQuery(body && typeof body === "object" ? (body as { query?: unknown }).query : null);
  if (!isValidVehicleQuery(query)) return respond({ ok: false, error: "Zadej platné VIN nebo SPZ vozidla." }, 400);
  const check = (body as { check?: unknown }).check;
  if (check !== undefined && check !== "vignette") return respond({ ok: false, error: "Neplatný typ kontroly vozidla." }, 400);
  try {
    return respond(await (check === "vignette" ? lookupAutokukVehicle(query, "vignette") : lookupAutokukVehicle(query)), 200);
  } catch (error) {
    return error instanceof AutokukError
      ? respond({ ok: false, error: error.message }, error.status, error.retryAfter)
      : respond({ ok: false, error: "Prověření vozidla se nepodařilo. Zkus to za chvíli." }, 502);
  }
}

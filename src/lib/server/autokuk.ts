import { createHash } from "node:crypto";
import { normalizeAutokukVehicle, normalizeAutokukVignette } from "@/app/lib/autokukVehicle";
import type { VehicleLookupResponse, VehicleVignetteResponse } from "@/app/lib/vehicleReport";
import { consumeRateLimit } from "./rateLimit";

export class AutokukError extends Error {
  constructor(message: string, public status = 502, public retryAfter?: number) { super(message); }
}

const CACHE_TTL = 5 * 60_000;
const MAX_CACHE_ENTRIES = 100;
type LookupResponse = VehicleLookupResponse | VehicleVignetteResponse;
const cache = new Map<string, { expires: number; response: LookupResponse }>();
const pending = new Map<string, Promise<LookupResponse>>();

export function lookupAutokukVehicle(query: string): Promise<VehicleLookupResponse>;
export function lookupAutokukVehicle(query: string, check: "vignette"): Promise<VehicleVignetteResponse>;
export async function lookupAutokukVehicle(query: string, check?: "vignette"): Promise<LookupResponse> {
  const key = process.env.AUTOKUK_API_KEY?.trim();
  if (!key) throw new AutokukError("Služba pro prověření vozidel zatím není připojena. Kontaktuj správce aplikace.", 503);
  const account = createHash("sha256").update(key).digest("hex").slice(0, 16);
  const cacheKey = `${account}:${check ?? "vehicle"}:${query}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.response;
  if (pending.has(cacheKey)) return pending.get(cacheKey)!;
  const load = async () => {
    const configuredLimit = Number(process.env.AUTOKUK_RATE_LIMIT_PER_MINUTE);
    const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 60) : 10;
    const quota = await consumeRateLimit({ namespace: "autokuk:account", key: account, limit, windowMs: 60_000 });
    if (!quota.allowed) throw new AutokukError("Prověřuje se více vozidel najednou. Zkus to za chvíli.", 429, quota.retryAfterSeconds);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const upstream = await fetch("https://autokuk.cz/api/v1/search", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(check === "vignette" ? { query, include: ["vignette"] } : { query }), signal: controller.signal, cache: "no-store", redirect: "error",
      });
      const payload: unknown = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        const error = payload && typeof payload === "object" ? (payload as { error?: { code?: unknown } }).error : null;
        if (upstream.status === 404) throw new AutokukError("Vozidlo se nepodařilo najít. Zkontroluj VIN nebo SPZ; u nenalezené SPZ zkus VIN.", 404);
        if (upstream.status === 422) throw new AutokukError("Autokuk nerozpoznal zadané VIN nebo SPZ. Zkontroluj zadání.", 400);
        if (upstream.status === 401 || upstream.status === 403) throw new AutokukError("Přístup ke službě Autokuk není aktivní. Kontaktuj správce aplikace.", 503);
        if (upstream.status === 429) {
          const retry = Number(upstream.headers.get("Retry-After"));
          throw new AutokukError(error?.code === "RATE_LIMIT_DAILY"
            ? "Dnešní limit prověření Autokuk je vyčerpaný. Zkus to zítra."
            : "Limit prověření Autokuk je dočasně vyčerpaný. Zkus to za chvíli.", 429,
          Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86400) : 60);
        }
        throw new AutokukError("Autokuk je dočasně nedostupný. Zkus to za chvíli.");
      }
      const response = check === "vignette" ? normalizeAutokukVignette(payload) : normalizeAutokukVehicle(payload);
      if (!response) throw new AutokukError("Autokuk vrátil neúplnou odpověď. Zkus prověření za chvíli znovu.");
      for (const [key, entry] of cache) if (entry.expires <= Date.now()) cache.delete(key);
      while (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, response });
      return response;
    } catch (error) {
      if (error instanceof AutokukError) throw error;
      if (controller.signal.aborted) throw new AutokukError("Prověření trvá příliš dlouho. Zkus to za chvíli znovu.", 504);
      // Never expose provider bodies, transport errors or the API key to clients.
      throw new AutokukError("Se službou Autokuk se nepodařilo spojit. Zkus to za chvíli.");
    } finally { clearTimeout(timeout); }
  };
  const request = load();
  pending.set(cacheKey, request);
  try { return await request; } finally { pending.delete(cacheKey); }
}

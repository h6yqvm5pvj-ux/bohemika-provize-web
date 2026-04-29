import { auth } from "@/app/firebase-auth";

type CuzkResponse = unknown;
type AddressLookupQuery = {
  q?: string;
  obec?: string;
  ulice?: string;
  cisloDomovni?: string | number;
  cisloOrientacni?: string | number;
  psc?: string | number;
  cp?: string | number;
  co?: string | number;
  pickFirst?: string | number | boolean;
};
export type CuzkAddressLookupQuery = AddressLookupQuery;

/**
 * ⚠️ Next.js inlineuje env jen při statickém přístupu (process.env.NEXT_PUBLIC_XXX).
 * Dynamické (process.env[name]) v client bundle nefunguje → vrací undefined.
 */
function ensureEnvUrl(name: "NEXT_PUBLIC_CUZK_FN_URL" | "NEXT_PUBLIC_CUZK_FN_ADDRESS_URL" | "NEXT_PUBLIC_CUZK_FN_SUGGEST_URL"): string {
  const url =
    name === "NEXT_PUBLIC_CUZK_FN_URL"
      ? process.env.NEXT_PUBLIC_CUZK_FN_URL
      : name === "NEXT_PUBLIC_CUZK_FN_ADDRESS_URL"
      ? process.env.NEXT_PUBLIC_CUZK_FN_ADDRESS_URL
      : process.env.NEXT_PUBLIC_CUZK_FN_SUGGEST_URL;

  if (!url) throw new Error(`Chybí konfigurace ${name}.`);
  return url;
}

async function getAuthHeader(): Promise<{ Authorization: string }> {
  const current = auth.currentUser;
  if (!current) throw new Error("Uživatel není přihlášen.");
  const token = await current.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function fetchJsonWithAuth(url: string, timeoutMs = 15000): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...(await getAuthHeader()),
      },
      signal: controller.signal,
    });

    let body: any = null;
    try {
      body = await res.clone().json();
    } catch {
      // ignore
    }

    return { ok: res.ok, status: res.status, body };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error("ČÚZK neodpověděl včas. Zkus dotaz znovu.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function appendIfPresent(params: URLSearchParams, key: string, value: unknown): void {
  if (value === null || value === undefined) return;
  const str = String(value).trim();
  if (!str) return;
  params.set(key, str);
}

/**
 * ✅ detail podle kódu adresního místa (RÚIAN)
 * NEXT_PUBLIC_CUZK_FN_URL = cuzkLookupByAdresniMisto
 */
export async function cuzkLookupByAdresniMisto(
  kod: number,
  includeUnits?: boolean
): Promise<CuzkResponse> {
  const baseUrl = ensureEnvUrl("NEXT_PUBLIC_CUZK_FN_URL");
  const url = new URL(baseUrl);
  url.searchParams.set("kod", String(kod));
  url.searchParams.set("includeUnits", includeUnits === false ? "0" : "1");
  const { ok, status, body } = await fetchJsonWithAuth(url.toString(), 18000);
  if (!ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při volání ČÚZK (${status})`;
    throw new Error(String(msg));
  }
  return body;
}

/**
 * ✅ vyhledání podle adresy (text)
 * NEXT_PUBLIC_CUZK_FN_ADDRESS_URL = cuzkLookupByAddress
 */
export async function cuzkLookupByAddress(
  query: string | AddressLookupQuery,
  includeUnits?: boolean
): Promise<CuzkResponse> {
  const baseUrl = ensureEnvUrl("NEXT_PUBLIC_CUZK_FN_ADDRESS_URL");
  const url = new URL(baseUrl);
  url.searchParams.set("includeUnits", includeUnits === false ? "0" : "1");
  if (typeof query === "string") {
    const q = String(query || "").trim();
    if (q.length < 2) throw new Error("Zadej prosím adresu (aspoň 2 znaky).");
    url.searchParams.set("q", q);
  } else {
    const q = String(query?.q ?? "").trim();
    const obec = String(query?.obec ?? "").trim();
    const ulice = String(query?.ulice ?? "").trim();
    const cisloDomovni = query?.cisloDomovni ?? query?.cp ?? "";
    const cisloOrientacni = query?.cisloOrientacni ?? query?.co ?? "";
    const psc = query?.psc ?? "";
    const pickFirst = query?.pickFirst;

    if (!q && !obec && !ulice && !String(cisloDomovni).trim()) {
      throw new Error("Zadej adresu nebo aspoň obec + č.p.");
    }

    appendIfPresent(url.searchParams, "q", q);
    appendIfPresent(url.searchParams, "obec", obec);
    appendIfPresent(url.searchParams, "ulice", ulice);
    appendIfPresent(url.searchParams, "cisloDomovni", cisloDomovni);
    appendIfPresent(url.searchParams, "cisloOrientacni", cisloOrientacni);
    appendIfPresent(url.searchParams, "psc", psc);
    if (pickFirst !== undefined) {
      appendIfPresent(url.searchParams, "pickFirst", pickFirst);
    }
  }

  const { ok, status, body } = await fetchJsonWithAuth(url.toString(), 18000);
  if (!ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při hledání adresy (${status})`;
    throw new Error(String(msg));
  }
  return body;
}

/**
 * ✅ našeptávač (ArcGIS/RÚIAN přes tvoji funkci)
 * NEXT_PUBLIC_CUZK_FN_SUGGEST_URL = cuzkSuggestAddress
 *
 * Očekávání: vrací třeba { ok:true, suggestions:[{ text, ... }] } nebo rovnou pole stringů
 */
export async function cuzkSuggestAddress(
  query: string
): Promise<any> {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: true, suggestions: [] };

  const baseUrl = ensureEnvUrl("NEXT_PUBLIC_CUZK_FN_SUGGEST_URL");
  const url = new URL(baseUrl);
  url.searchParams.set("q", q);
  const { ok, status, body } = await fetchJsonWithAuth(url.toString(), 5000);
  if (!ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při našeptávání (${status})`;
    throw new Error(String(msg));
  }
  return body;
}

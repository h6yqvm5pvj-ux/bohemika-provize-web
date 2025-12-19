import { auth } from "@/app/firebase";

type CuzkResponse = unknown;

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

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...(await getAuthHeader()),
    },
  });

  let body: any = null;
  try {
    body = await res.clone().json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při volání ČÚZK (${res.status})`;
    throw new Error(String(msg));
  }

  return body ?? (await res.json());
}

/**
 * ✅ vyhledání podle adresy (text)
 * NEXT_PUBLIC_CUZK_FN_ADDRESS_URL = cuzkLookupByAddress
 */
export async function cuzkLookupByAddress(
  query: string,
  includeUnits?: boolean
): Promise<CuzkResponse> {
  const q = String(query || "").trim();
  if (q.length < 3) throw new Error("Zadej prosím adresu (aspoň 3 znaky).");

  const baseUrl = ensureEnvUrl("NEXT_PUBLIC_CUZK_FN_ADDRESS_URL");
  const url = new URL(baseUrl);
  url.searchParams.set("q", q);
  url.searchParams.set("includeUnits", includeUnits === false ? "0" : "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...(await getAuthHeader()),
    },
  });

  let body: any = null;
  try {
    body = await res.clone().json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při hledání adresy (${res.status})`;
    throw new Error(String(msg));
  }

  return body ?? (await res.json());
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

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...(await getAuthHeader()),
    },
  });

  let body: any = null;
  try {
    body = await res.clone().json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg =
      (body && (body.message || body.error || body.detail)) ||
      `Chyba při našeptávání (${res.status})`;
    throw new Error(String(msg));
  }

  return body ?? (await res.json());
}

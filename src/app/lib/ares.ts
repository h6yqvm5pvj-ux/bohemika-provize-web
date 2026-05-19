import { auth } from "@/app/firebase-auth";

const ARES_SEARCH_PROXY_URL = "/api/ares/search";
const ARES_DETAIL_PROXY_URL = "/api/ares/detail";

export type AresSearchParams = {
  ico?: string;
  obchodniJmeno?: string;
  obec?: string;
  start?: number;
  pocet?: number;
};

function normalizeText(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeIco(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\D+/g, "").slice(0, 8);
}

export async function aresSearchEntities(params: AresSearchParams) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Nejsi přihlášen.");
  }

  const payload = {
    ico: normalizeIco(params.ico),
    obchodniJmeno: normalizeText(params.obchodniJmeno),
    obec: normalizeText(params.obec),
    start: params.start ?? 0,
    pocet: params.pocet ?? 20,
  };

  const token = await user.getIdToken();
  const response = await fetch(ARES_SEARCH_PROXY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    error?: string;
    popis?: string;
    [key: string]: unknown;
  };

  if (!response.ok) {
    throw new Error(data.message || data.detail || data.error || data.popis || "Chyba volání ARES.");
  }

  return data;
}

export async function aresGetEntityDetail(ico: string) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Nejsi přihlášen.");
  }

  const normalizedIco = normalizeIco(ico);
  if (normalizedIco.length !== 8) {
    throw new Error("IČO musí mít 8 číslic.");
  }

  const token = await user.getIdToken();
  const response = await fetch(`${ARES_DETAIL_PROXY_URL}?ico=${encodeURIComponent(normalizedIco)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
    detail?: string;
    error?: string;
    popis?: string;
    [key: string]: unknown;
  };

  if (!response.ok) {
    throw new Error(data.message || data.detail || data.error || data.popis || "Chyba volání ARES detailu.");
  }

  return data;
}

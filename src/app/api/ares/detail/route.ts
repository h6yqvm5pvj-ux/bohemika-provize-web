import { NextResponse, type NextRequest } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ARES_BASE_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 18;
const DETAIL_SOURCE_KEYS = ["core", "ros", "rzp", "vr", "res", "ceu", "nrpzs", "rcns", "rpsh", "rs", "szr"] as const;

type DetailSourceKey = (typeof DETAIL_SOURCE_KEYS)[number];

type RateBucket = {
  count: number;
  resetAtMs: number;
};

type JsonObject = Record<string, unknown>;

type SourceResult = {
  ok: boolean;
  status: number;
  error: string | null;
  data: JsonObject | null;
};

const rateBuckets = new Map<string, RateBucket>();

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function cleanupRateBuckets(nowMs: number): void {
  if (rateBuckets.size < 1000) return;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (nowMs >= bucket.resetAtMs) {
      rateBuckets.delete(key);
    }
  }
}

function consumeRateLimit(key: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const nowMs = Date.now();
  cleanupRateBuckets(nowMs);

  const existing = rateBuckets.get(key);
  if (!existing || nowMs >= existing.resetAtMs) {
    rateBuckets.set(key, {
      count: 1,
      resetAtMs: nowMs + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000)),
    };
  }

  existing.count += 1;
  rateBuckets.set(key, existing);
  return { allowed: true };
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function readObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function readObjectArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readObject(item)).filter((item): item is JsonObject => !!item);
}

function readDateLike(value: unknown): string | null {
  if (typeof value === "string") return safeText(value);
  const row = readObject(value);
  if (!row) return null;
  return safeText(row.datum) ?? safeText(row.hodnota) ?? safeText(row.text);
}

function formatDateCs(value: string | null): string | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("cs-CZ");
}

function readErrorMessage(payload: unknown): string | null {
  const row = readObject(payload);
  if (!row) return null;

  const keys = ["popis", "message", "detail", "error", "kod", "subKod"];
  for (const key of keys) {
    const value = safeText(row[key]);
    if (value) return value;
  }

  return null;
}

function normalizeIco(value: string | null): string {
  if (!value) return "";
  return value.replace(/\D+/g, "").slice(0, 8);
}

function detailSourcePath(key: DetailSourceKey, ico: string): string {
  const normalizedIco = encodeURIComponent(ico);

  switch (key) {
    case "core":
      return `/ekonomicke-subjekty/${normalizedIco}`;
    case "ros":
      return `/ekonomicke-subjekty-ros/${normalizedIco}`;
    case "rzp":
      return `/ekonomicke-subjekty-rzp/${normalizedIco}`;
    case "vr":
      return `/ekonomicke-subjekty-vr/${normalizedIco}`;
    case "res":
      return `/ekonomicke-subjekty-res/${normalizedIco}`;
    case "ceu":
      return `/ekonomicke-subjekty-ceu/${normalizedIco}`;
    case "nrpzs":
      return `/ekonomicke-subjekty-nrpzs/${normalizedIco}`;
    case "rcns":
      return `/ekonomicke-subjekty-rcns/${normalizedIco}`;
    case "rpsh":
      return `/ekonomicke-subjekty-rpsh/${normalizedIco}`;
    case "rs":
      return `/ekonomicke-subjekty-rs/${normalizedIco}`;
    case "szr":
      return `/ekonomicke-subjekty-szr/${normalizedIco}`;
    default:
      return `/ekonomicke-subjekty/${normalizedIco}`;
  }
}

function countSourceRecords(source: JsonObject | null): number {
  return readObjectArray(source?.zaznamy).length;
}

function formatAddress(value: unknown): string | null {
  const address = readObject(value);
  if (!address) return safeText(value);

  const text = safeText(address.textovaAdresa);
  if (text) return text;

  const chunks = [
    safeText(address.psc),
    safeText(address.nazevObce),
    safeText(address.nazevUlice),
    safeText(address.cisloDoAdresy),
    safeText(address.nazevStatu),
  ].filter((part): part is string => !!part);

  if (chunks.length > 0) return chunks.join(" ");
  return null;
}

function readRobTextField(value: unknown): string | null {
  if (typeof value === "string") return safeText(value);
  const row = readObject(value);
  if (!row) return null;
  return safeText(row.hodnota) ?? safeText(row.text) ?? safeText(row.datum);
}

function readRosStatutoryName(org: JsonObject): string | null {
  const osobaFyzicka = readObject(org.osobaFyzicka);
  const osobaRob = readObject(osobaFyzicka?.osobaRob);
  const osobaRos = readObject(osobaFyzicka?.osobaRos);

  const jmeno = readRobTextField(osobaRob?.jmeno);
  const prijmeni = readRobTextField(osobaRob?.prijmeni);
  const fullName = [jmeno, prijmeni].filter((part): part is string => !!part).join(" ").trim();
  if (fullName.length > 0) return fullName;

  const osobaTextem = safeText(osobaRos?.osobaTextem);
  if (osobaTextem) return osobaTextem;

  const osobaPravnicka = readObject(org.osobaPravnicka);
  const obchodniJmeno = safeText(osobaPravnicka?.obchodniJmeno);
  if (obchodniJmeno) return obchodniJmeno;

  return null;
}

function readRosStatutoryBirthDate(org: JsonObject): string | null {
  const osobaFyzicka = readObject(org.osobaFyzicka);
  const osobaRob = readObject(osobaFyzicka?.osobaRob);
  const osobaRos = readObject(osobaFyzicka?.osobaRos);

  return readDateLike(osobaRob?.datumNarozeni) ?? readDateLike(osobaRos?.datumNarozeni);
}

function readVrMemberName(member: JsonObject): string | null {
  const fyzicka = readObject(member.fyzickaOsoba);
  const pravnicka = readObject(member.pravnickaOsoba);

  const fullName = [safeText(fyzicka?.titulPredJmenem), safeText(fyzicka?.jmeno), safeText(fyzicka?.prijmeni)]
    .filter((part): part is string => !!part)
    .join(" ")
    .trim();

  if (fullName.length > 0) return fullName;

  return safeText(pravnicka?.obchodniJmeno) ?? null;
}

function readVrMemberRole(member: JsonObject): string | null {
  const clenstvi = readObject(member.clenstvi);
  const funkce = readObject(clenstvi?.funkce);
  return safeText(funkce?.nazev) ?? safeText(member.nazevAngazma) ?? safeText(member.typAngazma);
}

function extractRosProvozovny(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const out: Array<{ icp: string | null; adresa: string | null; datumOd: string | null; datumDo: string | null }> = [];

  for (const zaznam of zaznamy) {
    for (const provozovna of readObjectArray(zaznam.provozovny)) {
      const icpValue = typeof provozovna.icp === "number" && Number.isFinite(provozovna.icp)
        ? String(Math.trunc(provozovna.icp))
        : safeText(provozovna.icp);

      out.push({
        icp: icpValue,
        adresa: formatAddress(provozovna.adresaProvozovny),
        datumOd: formatDateCs(readDateLike(provozovna.datumZahajeniCinnosti)),
        datumDo: formatDateCs(readDateLike(provozovna.datumUkonceniCinnosti)),
      });
    }
  }

  return out;
}

function extractRzpZivnosti(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const out: Array<{
    predmet: string | null;
    druh: string | null;
    datumVzniku: string | null;
    datumZaniku: string | null;
    provozovny: number;
    odpovedniZastupci: number;
  }> = [];

  for (const zaznam of zaznamy) {
    for (const zivnost of readObjectArray(zaznam.zivnosti)) {
      out.push({
        predmet: safeText(zivnost.predmetPodnikani),
        druh: safeText(zivnost.druhZivnosti),
        datumVzniku: formatDateCs(readDateLike(zivnost.datumVzniku)),
        datumZaniku: formatDateCs(readDateLike(zivnost.datumZaniku)),
        provozovny: readObjectArray(zivnost.provozovny).length,
        odpovedniZastupci: readObjectArray(zivnost.odpovedniZastupci).length,
      });
    }
  }

  return out;
}

function extractRzpProvozovny(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const out: Array<{ icp: string | null; nazev: string | null; adresa: string | null; datumOd: string | null; datumDo: string | null }> = [];

  for (const zaznam of zaznamy) {
    for (const zivnost of readObjectArray(zaznam.zivnosti)) {
      for (const provozovna of readObjectArray(zivnost.provozovny)) {
        const icpValue = typeof provozovna.icp === "number" && Number.isFinite(provozovna.icp)
          ? String(Math.trunc(provozovna.icp))
          : safeText(provozovna.icp);

        out.push({
          icp: icpValue,
          nazev: safeText(provozovna.nazev),
          adresa: formatAddress(provozovna.sidloProvozovny),
          datumOd: formatDateCs(readDateLike(provozovna.platnostOd)),
          datumDo: formatDateCs(readDateLike(provozovna.platnostDo)),
        });
      }
    }
  }

  return out;
}

function extractRosDatoveSchranky(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const byId = new Map<string, { identifikatorDs: string; typDatoveSchranky: string | null; platnostUdajeRos: string | null }>();

  for (const zaznam of zaznamy) {
    for (const datovaSchranka of readObjectArray(zaznam.datoveSchranky)) {
      const identifikatorDs = safeText(datovaSchranka.identifikatorDs);
      if (!identifikatorDs) continue;

      if (!byId.has(identifikatorDs)) {
        byId.set(identifikatorDs, {
          identifikatorDs,
          typDatoveSchranky: safeText(datovaSchranka.typDatoveSchranky),
          platnostUdajeRos: safeText(datovaSchranka.platnostUdajeRos),
        });
      }
    }
  }

  return Array.from(byId.values());
}

function extractRosStatutarni(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const out: Array<{ jmeno: string | null; datumNarozeni: string | null }> = [];

  for (const zaznam of zaznamy) {
    for (const organ of readObjectArray(zaznam.statutarniOrgany)) {
      out.push({
        jmeno: readRosStatutoryName(organ),
        datumNarozeni: formatDateCs(readRosStatutoryBirthDate(organ)),
      });
    }
  }

  return out;
}

function extractVrStatutarni(source: JsonObject | null) {
  const zaznamy = readObjectArray(source?.zaznamy);
  const out: Array<{
    organ: string | null;
    jmeno: string | null;
    role: string | null;
    datumZapisu: string | null;
    datumVymazu: string | null;
  }> = [];

  for (const zaznam of zaznamy) {
    for (const organ of readObjectArray(zaznam.statutarniOrgany)) {
      const organName = safeText(organ.nazevOrganu) ?? safeText(organ.typOrganu);
      for (const member of readObjectArray(organ.clenoveOrganu)) {
        out.push({
          organ: organName,
          jmeno: readVrMemberName(member),
          role: readVrMemberRole(member),
          datumZapisu: formatDateCs(readDateLike(member.datumZapisu)),
          datumVymazu: formatDateCs(readDateLike(member.datumVymazu)),
        });
      }
    }
  }

  return out;
}

function extractInsolvencyEvents(rzp: JsonObject | null, vr: JsonObject | null) {
  const out: Array<{ zdroj: "RZP" | "VR"; typ: string; datum: string | null; detail: string | null }> = [];

  for (const zaznam of readObjectArray(rzp?.zaznamy)) {
    const insolvence = readObject(zaznam.insolvencniRizeni);
    if (!insolvence || Object.keys(insolvence).length === 0) continue;
    out.push({
      zdroj: "RZP",
      typ: "Insolvenční řízení",
      datum: formatDateCs(readDateLike(insolvence.datumZapisu) ?? readDateLike(insolvence.platnostOd)),
      detail: null,
    });
  }

  for (const zaznam of readObjectArray(vr?.zaznamy)) {
    for (const insolvence of readObjectArray(zaznam.insolvence)) {
      const zapisy = readObjectArray(insolvence.insolvencniZapis);
      if (zapisy.length === 0) {
        out.push({
          zdroj: "VR",
          typ: "Insolvence",
          datum: formatDateCs(readDateLike(insolvence.datumZapisu)),
          detail: null,
        });
      }

      for (const zapis of zapisy) {
        out.push({
          zdroj: "VR",
          typ: safeText(zapis.typZapisu) ?? "Insolvenční zápis",
          datum: formatDateCs(readDateLike(zapis.datumZapisu) ?? readDateLike(zapis.platnostOd)),
          detail: safeText(zapis.text),
        });
      }
    }

    for (const konkurs of readObjectArray(zaznam.konkursy)) {
      out.push({
        zdroj: "VR",
        typ: safeText(konkurs.typKonkursu) ?? "Konkurzní řízení",
        datum: formatDateCs(readDateLike(konkurs.datumRozhodnutiOs) ?? readDateLike(konkurs.datumVyveseni)),
        detail: safeText(konkurs.text),
      });
    }
  }

  return out;
}

async function fetchSource(path: string, signal: AbortSignal): Promise<SourceResult> {
  try {
    const response = await fetch(`${ARES_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: readErrorMessage(payload) ?? `ARES odpověděl chybou ${response.status}`,
        data: null,
      };
    }

    return {
      ok: true,
      status: response.status,
      error: null,
      data: readObject(payload),
    };
  } catch (err: any) {
    const errorName = typeof err?.name === "string" ? err.name : "";
    const timeoutError = errorName === "AbortError" ? "Timeout při volání ARES." : "Nepodařilo se spojit se službou ARES.";
    return {
      ok: false,
      status: 504,
      error: timeoutError,
      data: null,
    };
  }
}

export async function GET(req: NextRequest) {
  if (!adminAuth) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 });
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return NextResponse.json(
      { ok: false, error: `Invalid or expired token (${code}): ${message}` },
      { status: 401 }
    );
  }

  if (!decoded.email) {
    return NextResponse.json(
      { ok: false, error: "Přihlášený účet nemá dostupný e-mail v tokenu." },
      { status: 401 }
    );
  }

  const rate = consumeRateLimit(decoded.uid);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to znovu za chvíli." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSec),
        },
      }
    );
  }

  const ico = normalizeIco(new URL(req.url).searchParams.get("ico"));
  if (ico.length !== 8) {
    return NextResponse.json({ ok: false, error: "IČO musí mít přesně 8 číslic." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 24_000);

  try {
    const sourceEntries = await Promise.all(
      DETAIL_SOURCE_KEYS.map(async (key) => {
        const result = await fetchSource(detailSourcePath(key, ico), controller.signal);
        return [key, result] as const;
      })
    );

    const sourceMap = Object.fromEntries(sourceEntries) as Record<DetailSourceKey, SourceResult>;
    const core = sourceMap.core;
    const ros = sourceMap.ros;
    const rzp = sourceMap.rzp;
    const vr = sourceMap.vr;
    const res = sourceMap.res;
    const ceu = sourceMap.ceu;
    const nrpzs = sourceMap.nrpzs;
    const rcns = sourceMap.rcns;
    const rpsh = sourceMap.rpsh;
    const rs = sourceMap.rs;
    const szr = sourceMap.szr;

    if (!core.ok || !core.data) {
      return NextResponse.json(
        { ok: false, error: core.error ?? "Nepodařilo se načíst detail subjektu z ARES." },
        { status: core.status || 502 }
      );
    }

    const coreData = core.data;
    const sidlo = readObject(coreData.sidlo);
    const seznamRegistraci = readObject(coreData.seznamRegistraci) ?? {};

    const akty = Object.entries(seznamRegistraci)
      .filter(([, value]) => safeText(value)?.toUpperCase() === "AKTIVNI")
      .map(([key]) => key);

    const rosProvozovny = extractRosProvozovny(ros.data);
    const rosDatoveSchranky = extractRosDatoveSchranky(ros.data);
    const rzpProvozovny = extractRzpProvozovny(rzp.data);
    const rzpZivnosti = extractRzpZivnosti(rzp.data);
    const rosStatutarni = extractRosStatutarni(ros.data);
    const vrStatutarni = extractVrStatutarni(vr.data);
    const insolvencniUdalosti = extractInsolvencyEvents(rzp.data, vr.data);

    const rzpFirst = readObjectArray(rzp.data?.zaznamy)[0] ?? null;
    const rzpZivnostiStav = readObject(rzpFirst?.zivnostiStav);
    const rzpProvozovnyStav = readObject(rzpFirst?.provozovnyStav);

    const resFirst = readObjectArray(res.data?.zaznamy)[0] ?? null;

    return NextResponse.json(
      {
        ok: true,
        ico,
        subject: {
          ico: safeText(coreData.ico),
          icoId: safeText(coreData.icoId),
          obchodniJmeno: safeText(coreData.obchodniJmeno),
          pravniForma: safeText(coreData.pravniForma),
          pravniFormaRos: safeText(coreData.pravniFormaRos),
          dic: safeText(coreData.dic),
          datumVzniku: formatDateCs(readDateLike(coreData.datumVzniku)),
          datumZaniku: formatDateCs(readDateLike(coreData.datumZaniku)),
          primarniZdroj: safeText(coreData.primarniZdroj),
          sidlo: formatAddress(sidlo),
          datovaSchranka: rosDatoveSchranky[0]?.identifikatorDs ?? null,
          datoveSchranky: rosDatoveSchranky,
          aktivniRegistry: akty,
          czNace: Array.isArray(coreData.czNace) ? coreData.czNace.filter((value) => typeof value === "string") : [],
          czNace2008: Array.isArray(coreData.czNace2008) ? coreData.czNace2008.filter((value) => typeof value === "string") : [],
          dalsiUdajeCount: readObjectArray(coreData.dalsiUdaje).length,
        },
        sections: {
          provozovnyRos: rosProvozovny,
          provozovnyRzp: rzpProvozovny,
          zivnostiRzp: rzpZivnosti,
          statutarniRos: rosStatutarni,
          statutarniVr: vrStatutarni,
          insolvencniUdalosti,
        },
        sourceStats: {
          zaznamy: {
            core: core.data ? 1 : 0,
            ros: countSourceRecords(ros.data),
            rzp: countSourceRecords(rzp.data),
            vr: countSourceRecords(vr.data),
            res: countSourceRecords(res.data),
            ceu: countSourceRecords(ceu.data),
            nrpzs: countSourceRecords(nrpzs.data),
            rcns: countSourceRecords(rcns.data),
            rpsh: countSourceRecords(rpsh.data),
            rs: countSourceRecords(rs.data),
            szr: countSourceRecords(szr.data),
          },
          rzpZivnostiStav,
          rzpProvozovnyStav,
          resStatistickeUdaje: readObject(resFirst?.statistickeUdaje),
        },
        sourceHealth: {
          core: { ok: core.ok, status: core.status, error: core.error },
          ros: { ok: ros.ok, status: ros.status, error: ros.error },
          rzp: { ok: rzp.ok, status: rzp.status, error: rzp.error },
          vr: { ok: vr.ok, status: vr.status, error: vr.error },
          res: { ok: res.ok, status: res.status, error: res.error },
          ceu: { ok: ceu.ok, status: ceu.status, error: ceu.error },
          nrpzs: { ok: nrpzs.ok, status: nrpzs.status, error: nrpzs.error },
          rcns: { ok: rcns.ok, status: rcns.status, error: rcns.error },
          rpsh: { ok: rpsh.ok, status: rpsh.status, error: rpsh.error },
          rs: { ok: rs.ok, status: rs.status, error: rs.error },
          szr: { ok: szr.ok, status: szr.status, error: szr.error },
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

const admin = require("firebase-admin");
const axios = require("axios");
const { securedRequest, authorizeRecipients, failure } = require("./security");
const { processInvoice } = require("./billing");
const { runtimeOptions } = require("./runtime");

// v2 Functions importy
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler"); // 🕒 cron

admin.initializeApp();

// Globální nastavení pro všechny v2 funkce
setGlobalOptions({
  region: "europe-central2"
});

// 🔐 Secrety
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const FAKTUROID_WEBHOOK_TOKEN = defineSecret("FAKTUROID_WEBHOOK_TOKEN");
const CUZK_API_KEY = defineSecret("CUZK_API_KEY"); // ✅ KN API key
const DATAOVOZIDLECH_API_KEY = defineSecret("DATAOVOZIDLECH_API_KEY");

/* ------------------------------------------------------------------ */
/*  AUTH helper (Firebase ID token)                                   */
/* ------------------------------------------------------------------ */

async function requireAuth(req) {
  if (!req.verifiedIdentity) throw failure(401, "UNAUTHENTICATED");
  return req.verifiedIdentity;
}
const requireAuthFromRequest = requireAuth;

/* ------------------------------------------------------------------ */
/*  RÚIAN resolver – Adresa → kód adresního místa                      */
/*  Používá veřejný ArcGIS endpoint ČÚZK (RÚIAN/AdresniMisto)          */
/* ------------------------------------------------------------------ */

function escapeSqlString(s) {
  return String(s || "").replace(/'/g, "''");
}

// velmi jednoduché „vytažení“ čísel z textu (když zadáš jen jednu adresu do pole)
function tryParseHouseNumbersFromQuery(q) {
  const text = String(q || "");
  // najde první číslo jako č.domovní a případně /č.orientační
  // např. "Dlouhá 12/5" => 12 a 5
  const m = text.match(/(\d{1,5})\s*(?:\/\s*(\d{1,5}))?/);
  if (!m) return { cisloDomovni: null, cisloOrientacni: null };
  return {
    cisloDomovni: m[1] ? Number(m[1]) : null,
    cisloOrientacni: m[2] ? Number(m[2]) : null
  };
}

// Vrátí pole matches: { kod, adresa, psc, cislodomovni, cisloorientacni, cisloorientacnipismeno }
async function ruianFindAdresniMistoByAddress(params) {
  // Endpoint vrstvy AdresniMisto (layer id = 1)
  const baseUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/1/query";

  const q = String(params.q || "").trim();
  const obec = String(params.obec || "").trim();
  const ulice = String(params.ulice || "").trim();

  const cisloDomovniRaw = params.cisloDomovni ?? params.cp ?? params.cdom;
  const cisloOrientacniRaw = params.cisloOrientacni ?? params.co ?? params.cor;
  const pscRaw = params.psc;

  let cisloDomovni = cisloDomovniRaw !== undefined && cisloDomovniRaw !== null && String(cisloDomovniRaw).trim() !== ""
    ? Number(cisloDomovniRaw)
    : null;

  let cisloOrientacni = cisloOrientacniRaw !== undefined && cisloOrientacniRaw !== null && String(cisloOrientacniRaw).trim() !== ""
    ? Number(cisloOrientacniRaw)
    : null;

  let psc = pscRaw !== undefined && pscRaw !== null && String(pscRaw).trim() !== ""
    ? Number(pscRaw)
    : null;

  if ((!cisloDomovni || !Number.isFinite(cisloDomovni)) && q) {
    const parsed = tryParseHouseNumbersFromQuery(q);
    if (parsed.cisloDomovni && Number.isFinite(parsed.cisloDomovni)) cisloDomovni = parsed.cisloDomovni;
    if (parsed.cisloOrientacni && Number.isFinite(parsed.cisloOrientacni)) cisloOrientacni = parsed.cisloOrientacni;
  }

  // Sestavení WHERE:
  // - pokud máš č.p., použij ho (je nejpřesnější)
  // - obec/ulice řešíme přes textové pole "adresa" (protože vrstva nemá přímo název obce/ulice – jen ID)
  // - fallback: jen LIKE přes q
  const whereParts = [];

  if (Number.isFinite(cisloDomovni) && cisloDomovni > 0) {
    whereParts.push(`cislodomovni = ${cisloDomovni}`);
  }
  if (Number.isFinite(cisloOrientacni) && cisloOrientacni > 0) {
    whereParts.push(`cisloorientacni = ${cisloOrientacni}`);
  }
  if (Number.isFinite(psc) && psc > 0) {
    whereParts.push(`psc = ${psc}`);
  }

  // textové filtry přes "adresa"
  if (ulice) {
    whereParts.push(`adresa LIKE '%${escapeSqlString(ulice)}%'`);
  }
  if (obec) {
    whereParts.push(`adresa LIKE '%${escapeSqlString(obec)}%'`);
  }
  if (!ulice && !obec && q) {
    // když máš jen q, zkusíme LIKE nad celým q (ale zkrátíme, aby to nebylo extrémně dlouhé)
    const cut = q.slice(0, 80);
    whereParts.push(`adresa LIKE '%${escapeSqlString(cut)}%'`);
  }

  // když je úplně prázdno, nedovolíme
  if (!whereParts.length) {
    return [];
  }

  const where = whereParts.join(" AND ");

  const resp = await axios.get(baseUrl, {
    timeout: 20000,
    params: {
      f: "pjson",
      where,
      outFields: "kod,adresa,psc,cislodomovni,cisloorientacni,cisloorientacnipismeno,stavebniobjekt",
      returnGeometry: "false",
      resultRecordCount: 10
    }
  });

  const features = resp.data?.features || [];
  return features
    .map((f) => f?.attributes || null)
    .filter(Boolean)
    .map((a) => ({
      kod: a.kod,
      adresa: a.adresa,
      psc: a.psc,
      cislodomovni: a.cislodomovni,
      cisloorientacni: a.cisloorientacni,
      cisloorientacnipismeno: a.cisloorientacnipismeno || "",
      stavebniobjekt: a.stavebniobjekt ?? null
    }))
    .filter((m) => Number.isFinite(Number(m.kod)) && Number(m.kod) > 0);
}

/* ------------------------------------------------------------------ */
/*  ✅ NOVÉ: RÚIAN SUGGEST – našeptávač (jen LIKE podle q)             */
/*  Vrací návrhy adresních míst jako ofiko autocomplete                */
/* ------------------------------------------------------------------ */

async function ruianSuggestAdresniMisto(q, limit = 12) {
  const baseUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/1/query";
  const text = String(q || "").trim();
  if (!text) return [];

  const cut = text.slice(0, 80);
  const where = `adresa LIKE '%${escapeSqlString(cut)}%'`;

  const resp = await axios.get(baseUrl, {
    timeout: 20000,
    params: {
      f: "pjson",
      where,
      outFields: "kod,adresa,psc,cislodomovni,cisloorientacni,cisloorientacnipismeno,stavebniobjekt",
      returnGeometry: "false",
      resultRecordCount: Math.max(1, Math.min(Number(limit) || 12, 20))
    }
  });

  const features = resp.data?.features || [];
  return features
    .map((f) => f?.attributes || null)
    .filter(Boolean)
    .map((a) => ({
      kod: a.kod,
      adresa: a.adresa,
      psc: a.psc,
      cislodomovni: a.cislodomovni,
      cisloorientacni: a.cisloorientacni,
      cisloorientacnipismeno: a.cisloorientacnipismeno || "",
      stavebniobjekt: a.stavebniobjekt ?? null
    }))
    .filter((m) => Number.isFinite(Number(m.kod)) && Number(m.kod) > 0);
}

/* ------------------------------------------------------------------ */
/*  ✅ NOVÉ: Endpoint pro našeptávač adres (pro frontend dropdown)      */
/*  GET ?q=tyrsova 133 kadan&limit=12                                  */
/* ------------------------------------------------------------------ */

exports.cuzkSuggestAddress = securedRequest(admin, onRequest, "cuzkSuggestAddress",
  {
    timeoutSeconds: 20,
    memory: "256MiB"
  },
  async (req, res) => {
    // CORS (volá web)
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Použij GET." });

    try {
      const decoded = await requireAuth(req);
      const email = String(decoded.email || "").toLowerCase();
      if (!email) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED_NO_EMAIL" });

      const q = String(req.query.q || "").trim();
      const limitRaw = Number(req.query.limit || 12);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 12;

      if (q.length < 2) {
        return res.status(200).json({
          ok: true,
          mode: "SUGGEST",
          forUser: email,
          q,
          suggestions: []
        });
      }

      const suggestions = await ruianSuggestAdresniMisto(q, limit);

      return res.status(200).json({
        ok: true,
        mode: "SUGGEST",
        forUser: email,
        q,
        suggestions
      });
    } catch (err) {
      if (err?.message === "UNAUTHENTICATED") {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const status = err?.response?.status || 500;

      console.error("FUNCTION_OPERATION_FAILED");

      return res.status(status).json({
        ok: false,
        error: "SUGGEST_FAILED",
        status,
        detail: "Služba je dočasně nedostupná."
      });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  KN helpers – doplnění detailu parcel + adresních míst              */
/* ------------------------------------------------------------------ */

async function knGetOne(url, headers) {
  const resp = await axios.get(url, { headers, timeout: 20000 });
  const payload = resp.data || {};
  const data = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  return data || null;
}

function buildParcelaCislo(p) {
  const kmen = p?.kmenoveCisloParcely ?? p?.kmenoveCislo ?? null;
  const podd = p?.poddeleniCislaParcely ?? p?.poddeleni ?? null;
  if (kmen == null) return null;
  if (podd == null || String(podd).trim() === "") return String(kmen);
  return `${kmen}/${podd}`;
}

function pickVymera(detail) {
  const cand =
    detail?.vymera ??
    detail?.vymeraM2 ??
    detail?.vymeraPozemku ??
    detail?.vymeraVymery ??
    detail?.vyměra ??
    detail?.attributes?.vymera ??
    detail?.attributes?.vymeraM2 ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) ? n : null;
}

function pickDruhPozemku(detail) {
  return (
    detail?.druhPozemku?.nazev ??
    detail?.druhPozemku ??
    detail?.druh ??
    detail?.typPozemku?.nazev ??
    detail?.typPozemku ??
    null
  );
}

function pickUrčeníVymery(detail) {
  return (
    detail?.urceniVymery?.nazev ??
    detail?.urceniVymery ??
    detail?.zpusobUrčeníVymery?.nazev ??
    detail?.zpusobUrčeníVymery ??
    null
  );
}

function pickTypParcely(detail, fallback) {
  return (
    detail?.typParcely?.nazev ??
    detail?.typParcely ??
    fallback?.typParcely ??
    null
  );
}

async function knTryGetParcelDetailById(id, headers) {
  if (!id) return null;

  // Zkoušíme nejpravděpodobnější endpointy (podle stylu Stavby/Jednotky)
  const base = "https://api-kn.cuzk.gov.cz/api/v1";
  const tries = [
    `${base}/Parcely/${id}`,
    `${base}/Pozemky/${id}`,
    `${base}/Pozemky/Parcely/${id}`,
    `${base}/Parcely/Pozemky/${id}`,
  ];

  for (const url of tries) {
    try {
      const d = await knGetOne(url, headers);
      if (d) return d;
    } catch {
      const st = e?.response?.status;
      // 404/400 zkoušíme další; jiné chyby pošleme dál
      if (st === 404 || st === 400) continue;
      throw e;
    }
  }
  return null;
}

async function enrichStavbaParcely(stavba, headers) {
  const parcely = Array.isArray(stavba?.parcely) ? stavba.parcely : [];
  if (!parcely.length) return parcely;

  const out = [];
  for (const p of parcely) {
    const id = p?.id ?? null;
    const detail = await knTryGetParcelDetailById(id, headers);

    // pokud detail nenajdeme, aspoň složíme číslo parcely z částí
    const parcelaCislo =
      detail?.parcelaCislo ??
      detail?.cisloParcely ??
      detail?.oznaceni ??
      buildParcelaCislo(p);

    const vymera = pickVymera(detail);
    const druh = pickDruhPozemku(detail);
    const urceniVymery = pickUrčeníVymery(detail);

    const katUzemi =
      detail?.katastralniUzemi?.nazev ?? p?.katastralniUzemi?.nazev ?? null;

    const lv =
      detail?.lv?.cislo ??
      detail?.listVlastnictvi?.cislo ??
      detail?.cisloLV ??
      stavba?.lv?.cislo ??
      null;

    out.push({
      ...p,
      parcelaCislo,
      vymeraM2: vymera,
      druhPozemku: druh,
      urceniVymery,
      typParcelyLabel: pickTypParcely(detail, p),
      katastralniUzemiNazev: katUzemi,
      lvCislo: lv,
      _detail: detail || null, // nechávám pro ladění (můžeš později odstranit)
    });
  }

  return out;
}

// doplní adresní místa: z [18466311] udělá [{kod,adresa,psc,...}]
async function ruianGetAdresniMistoByKod(kod) {
  const baseUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/1/query";
  const k = Number(kod);
  if (!Number.isFinite(k) || k <= 0) return null;

  const resp = await axios.get(baseUrl, {
    timeout: 20000,
    params: {
      f: "pjson",
      where: `kod = ${k}`,
      outFields: "kod,adresa,psc,cislodomovni,cisloorientacni,cisloorientacnipismeno,stavebniobjekt",
      returnGeometry: "false",
      resultRecordCount: 1,
    },
  });

  const feat = resp.data?.features?.[0]?.attributes;
  if (!feat) return null;

  return {
    kod: feat.kod,
    adresa: feat.adresa,
    psc: feat.psc,
    cislodomovni: feat.cislodomovni,
    cisloorientacni: feat.cisloorientacni,
    cisloorientacnipismeno: feat.cisloorientacnipismeno || "",
    stavebniobjekt: feat.stavebniobjekt ?? null,
  };
}

// ✅ RÚIAN: detail stavebního objektu (VDP / technicko-ekonomické atributy)
// VDP URL vypadá např.: https://vdp.cuzk.gov.cz/vdp/ruian/stavebniobjekty/<KOD>

async function ruianGetStavebniObjektByKod(kod) {
  const baseUrl = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/3/query";
  const k = Number(kod);
  if (!Number.isFinite(k) || k <= 0) return null;

  const resp = await axios.get(baseUrl, {
    timeout: 20000,
    params: {
      f: "pjson",
      where: `kod = ${k}`,
      // bereme vše, ať máme i technicko-ekonomické atributy; ve frontendu si vybereš co zobrazit
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: 1,
    },
  });

  const feat = resp.data?.features?.[0]?.attributes;
  if (!feat) return null;

  return feat;
}

// ✅ RÚIAN VDP odkazy + jednoduchý "map preview" obrázek (bez proxy)
function buildRuianVdpStavebniObjektUrl(kod) {
  const k = Number(kod);
  if (!Number.isFinite(k) || k <= 0) return null;
  return `https://vdp.cuzk.gov.cz/vdp/ruian/stavebniobjekty/${k}`;
}

function buildRuianVdpAdresniMistoUrl(kodAdresnihoMista) {
  const k = Number(kodAdresnihoMista);
  if (!Number.isFinite(k) || k <= 0) return null;
  return `https://vdp.cuzk.gov.cz/vdp/ruian/adresnimista/${k}`;
}

// Vrátí URL na PNG obrázek z ArcGIS exportu (RÚIAN MapServer). Je to "náhled mapy" kolem bodu.
// Pozn.: Používá S-JTSK (ArcGIS wkid 102067). Pokud by se někde nezobrazovalo, stačí zvětšit buffer.
function buildRuianMapPreviewUrlFromDefinicniBod(definicniBod, options = {}) {
  const x = Number(definicniBod?.x);
  const y = Number(definicniBod?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const buffer = Number.isFinite(Number(options.buffer)) ? Number(options.buffer) : 120; // metry kolem bodu
  const width = Number.isFinite(Number(options.width)) ? Number(options.width) : 640;
  const height = Number.isFinite(Number(options.height)) ? Number(options.height) : 360;

  const xmin = x - buffer;
  const ymin = y - buffer;
  const xmax = x + buffer;
  const ymax = y + buffer;

  const base = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/MapServer/export";
  const params = new URLSearchParams({
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: "102067",
    imageSR: "102067",
    size: `${width},${height}`,
    format: "png32",
    transparent: "true",
    // layers můžeš kdykoliv doladit (např. show:3 pro stavební objekty). Nechávám default.
    f: "image"
  });

  return `${base}?${params.toString()}`;
}

async function enrichStavbaAdresniMista(stavba) {
  const arr = Array.isArray(stavba?.adresniMista) ? stavba.adresniMista : [];
  if (!arr.length) return [];

  const out = [];
  for (const x of arr) {
    const kod = typeof x === "number" || typeof x === "string" ? x : x?.kod;
    const d = await ruianGetAdresniMistoByKod(kod);
    if (d) out.push(d);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  ČÚZK KN – Stavba + jednotky podle kódu adresního místa (RÚIAN)     */
/*  GET ?kod=12345678&includeUnits=1                                  */
/* ------------------------------------------------------------------ */

exports.cuzkLookupByAdresniMisto = securedRequest(admin, onRequest, "cuzkLookupByAdresniMisto",
  {
    secrets: [CUZK_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Použij GET." });

    try {
      const decoded = await requireAuth(req);
      const email = String(decoded.email || "").toLowerCase();
      if (!email) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED_NO_EMAIL" });

      const kodRaw = String(req.query.kod || "").trim();
      const kod = Number(kodRaw);

      if (!Number.isFinite(kod) || kod <= 0) {
        return res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Chybí/špatný parametr ?kod= (kód adresního místa / RÚIAN)."
        });
      }

      const includeUnits = String(req.query.includeUnits || "1") !== "0";
      const headers = { ApiKey: CUZK_API_KEY.value() };

      // ✅ RÚIAN: načti detail adresního místa a navázaný stavební objekt (technicko-ekonomické atributy)
      let match = null;
      let ruianStavebniObjekt = null;
      try {
        match = await ruianGetAdresniMistoByKod(kod);
        if (match?.stavebniobjekt) {
          ruianStavebniObjekt = await ruianGetStavebniObjektByKod(match.stavebniobjekt);
        }
      } catch {
        console.warn("FUNCTION_OPERATION_FAILED");
        match = match || null;
        ruianStavebniObjekt = null;
      }

      // 1) Stavba podle adresního místa
      const stavbaResp = await axios.get(
        `https://api-kn.cuzk.gov.cz/api/v1/Stavby/AdresniMisto/${kod}`,
        { headers, timeout: 20000 }
      );

      const stavbaPayload = stavbaResp.data || {};
      let stavba =
        Array.isArray(stavbaPayload.data) ? stavbaPayload.data[0] : stavbaPayload.data;

      if (!stavba) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Stavba pro dané adresní místo nebyla nalezena.",
          aktualnostDatK: stavbaPayload.aktualnostDatK || null
        });
      }

      // ✅ 1b) OBOHACENÍ: parcely => doplníme výměru, druh, určení výměry...
      const parcelyDetailed = await enrichStavbaParcely(stavba, headers);

      // ✅ 1c) OBOHACENÍ: adresní místa => místo [kod] dáme objekty s adresou
      const adresniMistaDetailed = await enrichStavbaAdresniMista(stavba);

      stavba = {
        ...stavba,
        parcely: parcelyDetailed,
        adresniMista: adresniMistaDetailed
      };

      // 2) Jednotky (detail) – sekvenčně
      let jednotky = [];
      if (includeUnits && Array.isArray(stavba.jednotky) && stavba.jednotky.length) {
        for (const j of stavba.jednotky) {
          if (!j?.id) continue;

          const jResp = await axios.get(
            `https://api-kn.cuzk.gov.cz/api/v1/Jednotky/${j.id}`,
            { headers, timeout: 20000 }
          );

          const jPayload = jResp.data || {};
          const jednotka = Array.isArray(jPayload.data) ? jPayload.data[0] : jPayload.data;

          if (jednotka) jednotky.push(jednotka);
        }
      }

      return res.status(200).json({
        ok: true,
        forUser: email,
        match,
        aktualnostDatK: stavbaPayload.aktualnostDatK || null,
        stavba,
        jednotky,
        ruianStavebniObjekt,
        links: {
          vdpAdresniMisto: buildRuianVdpAdresniMistoUrl(kod),
          vdpStavebniObjekt: buildRuianVdpStavebniObjektUrl(match?.stavebniobjekt || null),
          mapPreview: buildRuianMapPreviewUrlFromDefinicniBod(stavba?.definicniBod)
        }
      });
    } catch (err) {
      if (err?.message === "UNAUTHENTICATED") {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const status = err?.response?.status || 500;

      console.error("FUNCTION_OPERATION_FAILED");

      return res.status(status).json({
        ok: false,
        error: "CUZK_CALL_FAILED",
        status,
        detail: "Služba je dočasně nedostupná."
      });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  ✅ NOVÉ: ČÚZK – vyhledání podle ADRESY (text / komponenty)         */
/*  GET ?q=...&includeUnits=1                                         */
/*  nebo: ?obec=...&ulice=...&cisloDomovni=...&cisloOrientacni=...     */
/* ------------------------------------------------------------------ */

exports.cuzkLookupByAddress = securedRequest(admin, onRequest, "cuzkLookupByAddress",
  {
    secrets: [CUZK_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Použij GET." });

    try {
      const decoded = await requireAuth(req);
      const email = String(decoded.email || "").toLowerCase();
      if (!email) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED_NO_EMAIL" });

      const includeUnits = String(req.query.includeUnits || "1") !== "0";

      const q = String(req.query.q || "").trim();
      const obec = String(req.query.obec || "").trim();
      const ulice = String(req.query.ulice || "").trim();

      const cisloDomovni = req.query.cisloDomovni ?? req.query.cp ?? "";
      const cisloOrientacni = req.query.cisloOrientacni ?? req.query.co ?? "";
      const psc = req.query.psc ?? "";

      if (!q && !obec && !ulice && !String(cisloDomovni).trim()) {
        return res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message:
            "Zadej buď ?q= (celá adresa), nebo kombinaci ?obec=&ulice=&cisloDomovni= (volitelně cisloOrientacni, psc)."
        });
      }

      // 1) Adresa → RÚIAN kód adresního místa
      const matches = await ruianFindAdresniMistoByAddress({
        q, obec, ulice, cisloDomovni, cisloOrientacni, psc
      });

      if (!matches.length) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Adresní místo se podle zadaných údajů nenašlo.",
          matches: []
        });
      }

      if (matches.length > 1 && String(req.query.pickFirst || "0") !== "1") {
        return res.status(200).json({
          ok: true,
          mode: "MULTI_MATCH",
          message: "Nalezeno více adres. Upřesni, nebo vyber jednu (např. podle RÚIAN kódu).",
          matches
        });
      }

      const picked = matches[0];
      const kod = Number(picked.kod);

      const headers = { ApiKey: CUZK_API_KEY.value() };

      // ✅ RÚIAN: detail stavebního objektu (to, co vidíš ve VDP „Stavební objekt – detail“)
      // Získáme ho přes vazbu z adresního místa (field `stavebniobjekt`).
      let ruianStavebniObjekt = null;
      try {
        ruianStavebniObjekt = picked?.stavebniobjekt
          ? await ruianGetStavebniObjektByKod(picked.stavebniobjekt)
          : null;
      } catch {
        // nechceme rozbít celý endpoint kvůli RÚIAN detailu
        console.warn("FUNCTION_OPERATION_FAILED");
        ruianStavebniObjekt = null;
      }

      // 2) Stavba
      const stavbaResp = await axios.get(
        `https://api-kn.cuzk.gov.cz/api/v1/Stavby/AdresniMisto/${kod}`,
        { headers, timeout: 20000 }
      );

      const stavbaPayload = stavbaResp.data || {};
      let stavba =
        Array.isArray(stavbaPayload.data) ? stavbaPayload.data[0] : stavbaPayload.data;

      if (!stavba) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Stavba pro nalezené adresní místo nebyla nalezena.",
          match: picked,
          aktualnostDatK: stavbaPayload.aktualnostDatK || null
        });
      }

      // ✅ obohacení parcel + adresních míst
      const parcelyDetailed = await enrichStavbaParcely(stavba, headers);
      const adresniMistaDetailed = await enrichStavbaAdresniMista(stavba);

      stavba = {
        ...stavba,
        parcely: parcelyDetailed,
        adresniMista: adresniMistaDetailed
      };

      // 3) Jednotky
      let jednotky = [];
      if (includeUnits && Array.isArray(stavba.jednotky) && stavba.jednotky.length) {
        for (const j of stavba.jednotky) {
          if (!j?.id) continue;

          const jResp = await axios.get(
            `https://api-kn.cuzk.gov.cz/api/v1/Jednotky/${j.id}`,
            { headers, timeout: 20000 }
          );

          const jPayload = jResp.data || {};
          const jednotka =
            Array.isArray(jPayload.data) ? jPayload.data[0] : jPayload.data;

          if (jednotka) jednotky.push(jednotka);
        }
      }

      return res.status(200).json({
        ok: true,
        mode: "SINGLE_MATCH",
        forUser: email,
        match: picked,
        aktualnostDatK: stavbaPayload.aktualnostDatK || null,
        stavba,
        jednotky,
        ruianStavebniObjekt,
        links: {
          vdpAdresniMisto: buildRuianVdpAdresniMistoUrl(kod),
          vdpStavebniObjekt: buildRuianVdpStavebniObjektUrl(picked?.stavebniobjekt || null),
          mapPreview: buildRuianMapPreviewUrlFromDefinicniBod(stavba?.definicniBod)
        }
      });
    } catch (err) {
      if (err?.message === "UNAUTHENTICATED") {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const status = err?.response?.status || 500;

      console.error("FUNCTION_OPERATION_FAILED");

      return res.status(status).json({
        ok: false,
        error: "ADDRESS_LOOKUP_FAILED",
        status,
        detail: "Služba je dočasně nedostupná."
      });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  NEON KNOWLEDGE – backend kontext pro asistenta                     */
/* ------------------------------------------------------------------ */

const NEON_KNOWLEDGE = `
Jsi interní asistent pro produkt **Životní pojištění NEON LIFE (ČPP)**.

ZÁKLAD:
- Základní pojištění pro případ smrti prvního pojištěného (konstantní pojistná částka).
- Možnost připojištění smrti (konstantní / klesající částka, i podle hypotéky).
- Opce na navýšení pojistné částky bez zdravotního dotazníku při vybraných životních událostech.

HLAVNÍ PŘIPOJIŠTĚNÍ (pouze výběr – odpovídej podle dotazu):
- Invalidita (jednorázová částka, stupně I–III, navázáno na rozhodnutí OSSZ/CSSZ).
- Invalidita s výplatou důchodu (měsíční renta do 70 let, konstantní nebo rostoucí).
- Terminální stádia onemocnění.
- Zproštění od placení pojistného (invalidita, ztráta zaměstnání, smrt druhého/třetího pojištěného).
- Závažná onemocnění a poranění (varianty – základní/rozšířená/maxi + speciální připojištění).
- Úrazové pojištění (denní odškodné, hospitalizace, zlomeniny, trvalé následky, smrt úrazem).
- Pracovní neschopnost (denní dávky s karenční dobou).
- Pobyt v nemocnici z důvodu nemoci (denní dávky).
- Hospitalizace s doprovodem u dětí.
- Ošetřování člena rodiny.
- Celodenní ošetřování pojištěného.
- Závislost na péči II.–IV. stupně.
- Příspěvek na pořízení zvláštní pomůcky.
- Náklady asistované reprodukce.
- Zdravotní a sociální asistence (infolinka ČPP Pomoc).
- Cestovní připojištění vč. Covidu plus.
- Odpovědnost občana a odpovědnost zaměstnance.

ZÁSADY PRO ODPOVĚDI:
- Odpovídej stručně, v bodech, s emoji pro přehlednost.
- Když něco není v podkladech nebo záleží na konkrétním znění pojistné smlouvy,
  napiš, že je potřeba zkontrolovat konkrétní pojistné podmínky a smlouvu.
`;

/* ------------------------------------------------------------------ */
/*  Helper funkce pro názvy produktů, jméno z emailu a CZK formát     */
/* ------------------------------------------------------------------ */

function getProductDisplayName(productKey) {
  switch (productKey) {
    case "neon": return "♥️ NEON";
    case "flexi": return "♥️ FLEXI";
    case "maximaMaxEfekt": return "♥️ MaxEfekt";
    case "maxcizinkomplex": return "✈️ MAXIMA Komplex cizinců";
    case "pillowInjury": return "♥️ Pillow Úraz / Nemoc";
    case "zamex": return "🧑‍🔧 ZAMEX";
    case "domex": return "🏠 DOMEX";
    case "cpphafan": return "🐶 ČPP HAFAN";
    case "pillowmajetek": return "🏠 Pillow Majetek";
    case "koopmajetekobcan": return "🏠 Kooperativa Pojištění majetku a odpovědnosti občanů a právní ochrany";
    case "maxdomov": return "🏠 MaxDOMOV";
    case "cppsimplex": return "🏠 ČPP Simplex";
    case "cppPPRs": return "🏠 ČPP Majetek a odpovědnost podnikatelů ÚPIS";
    case "cppPPRbez": return "🏠 ČPP Majetek a odpovědnost podnikatelů";
    case "cppAuto": return "🚘 ČPP Auto";
    case "slaviaauto": return "🚘 Slavia Auto";
    case "allianzAuto": return "🚘 Allianz Auto";
    case "allianzmujdomov": return "🏠 Allianz MůjDomov";
    case "csobAuto": return "🚘 ČSOB Auto";
    case "uniqaAuto": return "🚘 UNIQA Auto";
    case "uniqaflotila": return "🚘 UNIQA Auto Flotila";
    case "pillowAuto": return "🚘 Pillow Auto";
    case "kooperativaAuto": return "🚘 Kooperativa Auto";
    case "koopcestovko": return "✈️ Kooperativa Cestovko";
    case "cppcestovko": return "✈️ ČPP Cestovko";
    case "axacestovko": return "✈️ AXA Cestovko";
    case "comfortcc": return "💰 ComfortCommodity";
    default: return productKey || "Neznámý produkt";
  }
}

function formatUserNameFromEmail(email) {
  if (!email) return "";
  const localPart = email.split("@")[0];
  const parts = localPart
    .split(/[.\-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  return parts.join(" ");
}

function formatAmountCZK(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return String(value);
  return (
    num.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " Kč"
  );
}

function getUserPushToken(userData) {
  if (!userData || typeof userData !== "object") return null;

  const directKeys = ["fcmToken", "pushToken", "notificationToken"];
  for (const key of directKeys) {
    const token = userData[key];
    if (typeof token === "string" && token.trim()) return token.trim();
  }

  const arrayKeys = ["fcmTokens", "pushTokens", "notificationTokens"];
  for (const key of arrayKeys) {
    const arr = userData[key];
    if (!Array.isArray(arr)) continue;
    const token = arr.find((item) => typeof item === "string" && item.trim());
    if (token) return token.trim();
  }

  const mapKeys = ["fcmTokensByDevice", "pushTokensByDevice", "notificationTokensByDevice"];
  for (const key of mapKeys) {
    const map = userData[key];
    if (!map || typeof map !== "object") continue;
    for (const token of Object.values(map)) {
      if (typeof token === "string" && token.trim()) return token.trim();
    }
  }

  return null;
}

function isNotificationEnabled(userData, typeKey) {
  const settings = userData?.notificationSettings || {};
  const types = settings.types || {};
  const channels = settings.channels || {};

  if (typeof types[typeKey] === "boolean" && !types[typeKey]) return false;
  if (typeof channels.push === "boolean" && !channels.push) return false;

  return true;
}

function timestampToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toDate === "function") {
    const d = ts.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (ts instanceof Date) return ts.getTime();
  const parsed = Date.parse(String(ts));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEntryDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function shouldNotifyUnpaidEntry(entry, now = new Date()) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.paid === true) return false;

  const startDate = parseEntryDate(entry.policyStartDate);
  if (!startDate) return true;

  const notifyFrom = startOfDay(startDate);
  notifyFrom.setDate(notifyFrom.getDate() - 1);

  return startOfDay(now).getTime() >= notifyFrom.getTime();
}

function buildUnpaidSignature(entries) {
  if (!Array.isArray(entries) || !entries.length) return "";

  return entries
    .map((entry) => String(entry?.id || "").trim())
    .filter(Boolean)
    .sort()
    .join("|");
}

function shouldSendUnpaidReminder(userData, signature, now = new Date()) {
  const state = userData?.unpaidReminderState || {};
  const lastSignature = typeof state.lastSignature === "string" ? state.lastSignature : "";
  const lastSentAt = parseEntryDate(state.lastSentAt);

  if (!lastSentAt) return true;
  if (signature && signature !== lastSignature) return true;

  const diffMs = startOfDay(now).getTime() - startOfDay(lastSentAt).getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  return diffMs >= threeDaysMs;
}

/* ------------------------------------------------------------------ */
/*  0) FUNKCE – notifikace adminovi na novou uživatelskou žádost      */
/* ------------------------------------------------------------------ */

const ADMIN_REQUEST_NOTIFICATION_EMAILS = ["jakub.rauscher@bohemika.eu"];

function getUserRequestSubjectLabel(subjectRaw) {
  const subject = String(subjectRaw || "").trim().toLowerCase();
  if (subject === "userCreation") return "Založení uživatele";
  return "Jiná žádost";
}

exports.notifyAdminOnUserRequest = onDocumentCreated(
  { document: "userRequests/{requestId}", ...runtimeOptions("notifyAdminOnUserRequest") },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestData = snap.data() || {};
    const requesterEmail = String(requestData.requesterEmail || "").trim().toLowerCase();
    if (!requesterEmail) return;

    const requesterName = formatUserNameFromEmail(requesterEmail) || requesterEmail;
    const subjectLabel = getUserRequestSubjectLabel(requestData.subject);
    const priority = String(requestData.priority || "normal").trim().toLowerCase();
    const isUrgent = priority === "urgent";
    const requestId = String(event.params?.requestId || "").trim();
    const messageRaw = String(requestData.message || "").trim();
    const messagePreview =
      messageRaw.length > 110 ? `${messageRaw.slice(0, 107)}...` : messageRaw;

    const title = isUrgent
      ? "🚨 URGENTNÍ nová žádost od uživatele"
      : "Nová žádost od uživatele";
    const bodyBase = `${requesterName} • ${subjectLabel}`;
    const body = messagePreview
      ? `${isUrgent ? "🚨 URGENTNÍ: " : ""}${bodyBase} — ${messagePreview}`
      : `${isUrgent ? "🚨 URGENTNÍ: " : ""}${bodyBase}`;

    const db = admin.firestore();

    try {
      for (const adminEmailRaw of ADMIN_REQUEST_NOTIFICATION_EMAILS) {
        const adminEmail = String(adminEmailRaw || "").trim().toLowerCase();
        if (!adminEmail) continue;

        const adminSnap = await db.collection("users").doc(adminEmail).get();
        if (!adminSnap.exists) continue;

        const adminData = adminSnap.data() || {};
        const fcmToken = getUserPushToken(adminData);
        if (!fcmToken) continue;

        const msg = {
          token: fcmToken,
          notification: {
            title,
            body,
          },
          data: {
            type: "user_request_created",
            requestId,
            requesterEmail,
            requesterName,
            subject: String(requestData.subject || "").trim(),
            priority: isUrgent ? "urgent" : "normal",
            urgent: isUrgent ? "1" : "0",
          },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
        };

        await admin.messaging().send(msg);

      }
    } catch {
      console.error("FUNCTION_OPERATION_FAILED");
    }
  }
);

/* ------------------------------------------------------------------ */
/*  1) FUNKCE – notifikace manažerovi na novou smlouvu                */
/* ------------------------------------------------------------------ */

const ENABLE_NOTIFY_MANAGER_ON_NEW_ENTRY = false;

exports.notifyManagerOnNewEntry = onDocumentCreated(
  { document: "users/{userEmail}/entries/{entryId}", ...runtimeOptions("notifyManagerOnNewEntry") },
  async (event) => {
    if (!ENABLE_NOTIFY_MANAGER_ON_NEW_ENTRY) return;

    const snap = event.data;
    const context = event;

    if (!snap) {

      return;
    }

    const entryData = snap.data();
    const userEmail = context.params.userEmail;

    const db = admin.firestore();

    try {
      const userDocRef = db.collection("users").doc(userEmail);
      const userDocSnap = await userDocRef.get();
      if (!userDocSnap.exists) return;

      const userData = userDocSnap.data() || {};
      const managerEmail = userData.managerEmail;
      if (!managerEmail || managerEmail === userEmail) return;

      const recipients = [];

      const managerDocRef = db.collection("users").doc(managerEmail);
      const managerDocSnap = await managerDocRef.get();
      if (managerDocSnap.exists) {
        const managerData = managerDocSnap.data() || {};
        recipients.push({ email: managerEmail, data: managerData });

        const grandManagerEmailRaw = managerData.managerEmail;
        const grandManagerEmail =
          typeof grandManagerEmailRaw === "string"
            ? grandManagerEmailRaw.toLowerCase().trim()
            : null;

        if (
          grandManagerEmail &&
          grandManagerEmail !== managerEmail &&
          grandManagerEmail !== userEmail
        ) {
          const gmSnap = await db.collection("users").doc(grandManagerEmail).get();
          if (gmSnap.exists) {
            recipients.push({ email: grandManagerEmail, data: gmSnap.data() || {} });
          }
        }
      }

      const productName = getProductDisplayName(entryData.productKey);
      const amountText = formatAmountCZK(entryData.inputAmount);
      const userName = formatUserNameFromEmail(userEmail);

      for (const r of recipients) {
        const fcmToken = getUserPushToken(r.data || {});
        if (!fcmToken) continue;

        const message = {
          token: fcmToken,
          notification: {
            title: "🎉 Nová smlouva v týmu!",
            body: `${userName} sepsal smlouvu ${productName} za ${amountText}`
          },
          data: {
            entryId: context.params.entryId || ""
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } }
          }
        };

        await admin.messaging().send(message);

      }
    } catch {
      console.error("FUNCTION_OPERATION_FAILED");
    }
  }
);

/* ------------------------------------------------------------------ */
/*  2) CRON – notifikace na blížící se výročí smluv (mimo cestovko + comfort) */
/* ------------------------------------------------------------------ */

exports.notifyAutoAnniversary = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Europe/Prague", ...runtimeOptions("notifyAutoAnniversary") },
  async () => {
    const db = admin.firestore();

    const anniversaryProducts = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "pillowInjury",
      "zamex",
      "domex",
      "koopmajetekobcan",
      "maxdomov",
      "cppsimplex",
      "cppPPRs",
      "cppPPRbez",
      "cppAuto",
      "allianzAuto",
      "csobAuto",
      "uniqaAuto",
      "pillowAuto",
      "kooperativaAuto",
      "slaviaauto"
    ];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      const snapshot = await db
        .collectionGroup("entries")
        .where("productKey", "in", anniversaryProducts)
        .get();

      for (const doc of snapshot.docs) {
        const entry = doc.data();
        const startTs = entry.policyStartDate;
        if (!startTs || !startTs.toDate) continue;

        const startDate = startTs.toDate();
        const nextAnniversary = computeNextAnniversary(startDate, today);

        const diffMs = nextAnniversary.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        const anniversaryNumber = nextAnniversary.getFullYear() - startDate.getFullYear();

        if (diffDays !== 65) continue;
        if (anniversaryNumber < 1) continue;

        const userDocRef = doc.ref.parent.parent;
        if (!userDocRef) continue;

        const userSnap = await userDocRef.get();
        if (!userSnap.exists) continue;

        const userData = userSnap.data() || {};
        const fcmToken = getUserPushToken(userData);
        if (!fcmToken) continue;

        const productKey = entry.productKey || "";
        const productName = getProductDisplayName(productKey);
        const contractNumber = String(entry.contractNumber || "bez čísla smlouvy").trim();
        const clientName = String(entry.clientName || "neznámý klient").trim();

        const message = {
          token: fcmToken,
          notification: {
            title: "📅 Blíží se výročí smlouvy",
            body: `Za 65 dní bude mít smlouva ${anniversaryNumber}. výročí! ${contractNumber}, ${productName}, klient ${clientName}.`
          },
          data: { entryId: doc.id || "", productKey },
          apns: { payload: { aps: { sound: "default", badge: 1 } } }
        };

        await admin.messaging().send(message);
      }
    } catch {
      console.error("FUNCTION_OPERATION_FAILED");
    }
  }
);

function computeNextAnniversary(startDate, today) {
  const thisYear = today.getFullYear();
  let anniv = new Date(thisYear, startDate.getMonth(), startDate.getDate());
  if (anniv < today) anniv = new Date(thisYear + 1, startDate.getMonth(), startDate.getDate());
  return anniv;
}

/* ------------------------------------------------------------------ */
/*  2b) CRON – denní připomenutí nezaplacených smluv                  */
/* ------------------------------------------------------------------ */

exports.notifyUnpaidContracts = onSchedule(
  { schedule: "15 8 * * *", timeZone: "Europe/Prague", ...runtimeOptions("notifyUnpaidContracts") },
  async () => {
    const db = admin.firestore();

    try {
      const now = new Date();
      const usersSnap = await db.collection("users").get();

      for (const userDoc of usersSnap.docs) {
        const userEmail = String(userDoc.id || "").trim().toLowerCase();
        if (!userEmail) continue;

        const userData = userDoc.data() || {};
        if (!isNotificationEnabled(userData, "unpaid")) continue;

        const fcmToken = getUserPushToken(userData);
        if (!fcmToken) continue;

        const entriesSnap = await db.collection("users").doc(userEmail).collection("entries").get();
        if (entriesSnap.empty) continue;

        const unpaidEntries = [];
        for (const entryDoc of entriesSnap.docs) {
          const entry = entryDoc.data() || {};
          if (!shouldNotifyUnpaidEntry(entry, now)) continue;
          unpaidEntries.push({
            id: entryDoc.id,
            productKey: entry.productKey || "",
            contractNumber: entry.contractNumber || "",
            clientName: entry.clientName || "",
            createdAt: entry.createdAt || null,
          });
        }

        if (!unpaidEntries.length) continue;

        unpaidEntries.sort((a, b) => timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt));

        const unpaidSignature = buildUnpaidSignature(unpaidEntries);
        if (!shouldSendUnpaidReminder(userData, unpaidSignature, now)) continue;

        const oldest = unpaidEntries[0];
        const productName = getProductDisplayName(oldest.productKey);
        const contractNumber = String(oldest.contractNumber || "").trim() || "bez čísla";
        const clientName = String(oldest.clientName || "").trim();
        const unpaidCount = unpaidEntries.length;

        const detail = clientName
          ? `${productName}, ${contractNumber}, klient ${clientName}`
          : `${productName}, ${contractNumber}`;

        const body = unpaidCount === 1
          ? `Máš 1 nezaplacenou smlouvu: ${detail}`
          : `Máš ${unpaidCount} nezaplacené smlouvy. Nejstarší: ${detail}`;

        const message = {
          token: fcmToken,
          notification: {
            title: "💸 Nezaplacené smlouvy",
            body,
          },
          data: {
            type: "unpaid_contracts",
            unpaidCount: String(unpaidCount),
            firstEntryId: oldest.id || "",
          },
          apns: { payload: { aps: { sound: "default", badge: 1 } } },
        };

        try {
          await admin.messaging().send(message);
          await userDoc.ref.set(
            {
              unpaidReminderState: {
                lastSentAt: admin.firestore.Timestamp.fromDate(now),
                lastSignature: unpaidSignature,
                lastCount: unpaidCount,
              },
            },
            { merge: true }
          );

        } catch {
          console.error("FUNCTION_OPERATION_FAILED");
        }
      }
    } catch {
      console.error("FUNCTION_OPERATION_FAILED");
    }
  }
);

/* ------------------------------------------------------------------ */
/*  3) AI ASISTENT                                                     */
/* ------------------------------------------------------------------ */

exports.aiAssistant = securedRequest(admin, onRequest, "aiAssistant",
  {
    secrets: [OPENAI_API_KEY],
    timeoutSeconds: 60,
    memory: "1GiB"
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ reply: "Použij prosím POST." });

    const promptRaw = (req.body && (req.body.prompt || req.body.message)) || "";
    const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";
    if (prompt.length > 12000) throw failure(400, "PROMPT_TOO_LONG");

    const pkRaw = req.body && req.body.productKey;
    const productKey = typeof pkRaw === "string" ? pkRaw.trim() : "";

    if (!prompt) return res.status(400).json({ reply: "Chybí text dotazu." });

    let knowledge = "";
    if (productKey.includes("NEON") || productKey.includes("ŽP NEON")) knowledge = NEON_KNOWLEDGE;
    const finalPrompt = knowledge ? `${knowledge}\n\n---\nDOTAZ UŽIVATELE:\n${prompt}` : prompt;

    try {
      const apiKey = OPENAI_API_KEY.value();

      const openaiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-5-mini",
          max_completion_tokens: 2000,
          messages: [
            {
              role: "system",
              content:
                "Jsi AI asistent v interní aplikaci Bohemika Provize. " +
                "Odpovídej česky, stručně a přehledně."
            },
            { role: "user", content: finalPrompt }
          ]
        },
        {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          timeout: 60000
        }
      );

      const replyText =
        openaiResponse.data?.choices?.[0]?.message?.content?.trim() ||
        "Nemám teď jasnou odpověď, zkus dotaz upřesnit.";

      return res.status(200).json({ reply: replyText });
    } catch {
      return res.status(502).json({ reply: "Služba AI je dočasně nedostupná." });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  4) SEND TEAM MESSAGE                                               */
/* ------------------------------------------------------------------ */

exports.sendTeamMessage = securedRequest(admin, onRequest, "sendTeamMessage",
  { timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Použij POST." });

    const body = req.body || {};
    const managerEmail = String(body.managerEmail || "").trim().toLowerCase();
    const messageText = String(body.message || "").trim();
    const target = body.target || "all";
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    if (managerEmail !== req.verifiedIdentity.email) throw failure(403, "MANAGER_MISMATCH");
    if (!messageText || messageText.length > 200) throw failure(400, "INVALID_MESSAGE");

    const db = admin.firestore();

    let recipientEmails;
    if (target === "all") {
      const snap = await db.collection("users").where("managerEmail", "==", managerEmail).limit(501).get();
      recipientEmails = snap.docs.map(doc => doc.id);
      if (!recipientEmails.length) return res.status(200).json({ ok: true, sent: 0, totalTargets: 0 });
    } else if (target === "selected") {
      recipientEmails = recipients;
    } else {
      throw failure(400, "INVALID_TARGET");
    }
    const targetUsers = await authorizeRecipients(db, managerEmail, recipientEmails);
    try {
      if (!targetUsers.length) return res.status(200).json({ ok: true, info: "Nikdo nenalezen." });

      const title = "Zpráva od manažera";
      const shortBody = messageText.length > 200 ? messageText.slice(0, 197) + "..." : messageText;

      const sendResults = [];
      for (const u of targetUsers) {
        const fcmToken = getUserPushToken(u.data || {});
        if (!fcmToken) continue;

        const msg = {
          token: fcmToken,
          notification: { title, body: shortBody },
          data: { fromManager: managerEmail, type: "team_message" },
          apns: { payload: { aps: { sound: "default", badge: 1 } } }
        };

        try {
          const resp = await admin.messaging().send(msg);
          sendResults.push({ ok: true, resp });
        } catch (err) {
          sendResults.push({ ok: false, error: err.message });
        }
      }

      return res.status(200).json({
        ok: true,
        sent: sendResults.filter((r) => r.ok).length,
        totalTargets: targetUsers.length
      });
    } catch {
      console.error("FUNCTION_OPERATION_FAILED");
      return res.status(500).json({ ok: false, error: "Interní chyba serveru." });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  4b) TEST PUSH – pro tlačítko v Nastavení                           */
/* ------------------------------------------------------------------ */

exports.sendTestPush = securedRequest(admin, onRequest, "sendTestPush",
  { timeoutSeconds: 10, memory: "256MiB" },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Použij POST." });

    try {
      const decoded = await requireAuthFromRequest(req);
      const email = String(decoded.email || "").toLowerCase();
      if (!email) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED_NO_EMAIL" });

      const db = admin.firestore();
      const userSnap = await db.collection("users").doc(email).get();
      if (!userSnap.exists) return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });

      const privateSnap = await db.collection("usersPrivate").doc(email).get();
      const userData = { ...userSnap.data(), ...privateSnap.data() };
      const fcmToken = getUserPushToken(userData);
      if (!fcmToken) return res.status(400).json({ ok: false, error: "MISSING_FCM_TOKEN" });

      const messageText =
        typeof req.body?.message === "string" && req.body.message.trim().length > 0
          ? req.body.message.trim()
          : "Test push z Nastavení";

      const msg = {
        token: fcmToken,
        notification: {
          title: "🔔 Test notifikace",
          body: messageText,
        },
        data: {
          type: "test_push",
          fromUser: email || "",
        },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      };

      const resp = await admin.messaging().send(msg);
      return res.status(200).json({ ok: true, sentTo: email, messageId: resp });
    } catch (err) {
      if (err?.message === "UNAUTHENTICATED") {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }
      console.error("FUNCTION_OPERATION_FAILED");
      return res.status(500).json({ ok: false, error: "INTERNAL", detail: "Služba je dočasně nedostupná." });
    }
  }
);

/* ------------------------------------------------------------------ */
/*  5) FAKTUROID WEBHOOK                                               */
/* ------------------------------------------------------------------ */

exports.fakturoidWebhook = onRequest(
  {
    ...runtimeOptions("fakturoidWebhook"),
    secrets: [FAKTUROID_WEBHOOK_TOKEN],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Only POST allowed");

    res.set("Cache-Control", "no-store");
    try {
      const result = await processInvoice(admin, req, FAKTUROID_WEBHOOK_TOKEN.value());
      return res.status(200).send(result);
    } catch (error) {
      const status = [400,401,409,413,415,503].includes(error.status) ? error.status : 503;
      return res.status(status).send(error.status ? error.code : "WEBHOOK_UNAVAILABLE");
    }
  }
);

/* ------------------------------------------------------------------ */
/*  ✅ Data o vozidlech – VehicleTechnicalData v2 (VIN)                */
/*  GET ?vin=TMB...                                                   */
/* ------------------------------------------------------------------ */

exports.rsvVehicleLookup = securedRequest(admin, onRequest, "rsvVehicleLookup",
  {
    secrets: [DATAOVOZIDLECH_API_KEY],
    timeoutSeconds: 30,
    memory: "256MiB"
  },
  async (req, res) => {
    // CORS (volá web)
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Použij GET." });

    try {
      // 🔒 zabezpečení endpointu (pouze přihlášení uživatelé)
      const decoded = await requireAuth(req);
      const email = String(decoded.email || "").toLowerCase();
      if (!email) return res.status(401).json({ ok: false, error: "UNAUTHENTICATED_NO_EMAIL" });

      const vinRaw = String(req.query.vin || "").trim();
      const vin = vinRaw.toUpperCase();

      if (!vin || vin.length < 11) {
        return res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Chybí/špatný parametr ?vin= (VIN vozidla)."
        });
      }

      const apiKey = DATAOVOZIDLECH_API_KEY.value();

      // ✅ Endpoint dle příkladů z praxe (VIN -> JSON Status/Data)
      const url = "https://api.dataovozidlech.cz/api/vehicletechnicaldata/v2";

      const resp = await axios.get(url, {
        timeout: 20000,
        params: { vin },
        headers: {
          // některé integrace používají přesně tento header:
          api_key: apiKey,
          Accept: "application/json"
        }
      });

      return res.status(200).json({
        ok: true,
        forUser: email,
        vin,
        payload: resp.data
      });
    } catch (err) {
      if (err?.message === "UNAUTHENTICATED") {
        return res.status(401).json({ ok: false, error: "UNAUTHENTICATED" });
      }

      const status = err?.response?.status || 500;

      console.error("FUNCTION_OPERATION_FAILED");

      return res.status(status).json({
        ok: false,
        error: "DATAOVOZIDLECH_CALL_FAILED",
        status,
        detail: "Služba je dočasně nedostupná."
      });
    }
  }
);

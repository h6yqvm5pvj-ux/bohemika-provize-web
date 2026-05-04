import { NextResponse, type NextRequest } from "next/server";
import { FieldPath, type QuerySnapshot } from "firebase-admin/firestore";

import { type CommissionMode, type Position } from "@/app/types/domain";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_STATS_GET_RATE_LIMIT = 180;
const USER_STATS_GET_WINDOW_MS = 60_000;
const USER_STATS_POST_RATE_LIMIT = 120;
const USER_STATS_POST_WINDOW_MS = 60_000;

const POSITION_SET = new Set<Position>([
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
]);

const COMMISSION_MODE_SET = new Set<CommissionMode>(["accelerated", "standard"]);

type ApiError = {
  ok: false;
  error: string;
};

type AuthContext = {
  email: string;
  uid: string;
  isAdmin: boolean;
};

type DailyContractRow = {
  product: string;
  premium: number;
  comfortGradual: boolean;
  comfortPayment: number;
};

type HistoryItem = {
  id: string;
  label: string;
  outreach: number;
  meetings: number;
  commission: number;
  hours: number;
  savedAt: number | null;
};

type YearMonth = {
  year: number;
  month: number;
  dayCount: number;
  monthKey: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseIntegerInRange(
  value: unknown,
  min: number,
  max: number
): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return numeric;
}

function parseFiniteInRange(
  value: unknown,
  min: number,
  max: number
): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim().replace(",", "."))
        : NaN;
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return numeric;
}

function parseYearMonth(yearRaw: unknown, monthRaw: unknown): YearMonth | null {
  const year = parseIntegerInRange(yearRaw, 2000, 2100);
  const month = parseIntegerInRange(monthRaw, 1, 12);
  if (year == null || month == null) return null;
  const dayCount = new Date(year, month, 0).getDate();
  const monthKey = `${year}-${pad2(month)}`;
  return { year, month, dayCount, monthKey };
}

function parseDayIndexFromDocId(
  docId: string,
  year: number,
  month: number,
  dayCount: number
): number | null {
  const m = docId.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (y !== year || mon !== month) return null;
  if (!Number.isInteger(day) || day < 1 || day > dayCount) return null;
  return day - 1;
}

function parseHistoryItems(snap: QuerySnapshot): HistoryItem[] {
  return snap.docs.map((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const savedAt = parseFiniteInRange(data.savedAt, 0, 9_999_999_999_999);
    return {
      id: docSnap.id,
      label:
        (typeof data.label === "string" && data.label.trim()) ||
        (typeof data.monthLabel === "string" && data.monthLabel.trim()) ||
        docSnap.id,
      outreach: parseFiniteInRange(data.outreach, 0, 1_000_000_000) ?? 0,
      meetings: parseFiniteInRange(data.meetings, 0, 1_000_000_000) ?? 0,
      commission: parseFiniteInRange(data.commission, 0, 1_000_000_000) ?? 0,
      hours: parseFiniteInRange(data.hours, 0, 1_000_000_000) ?? 0,
      savedAt,
    };
  });
}

function sanitizeDailyContracts(value: unknown): DailyContractRow[] | null {
  if (!Array.isArray(value)) return [];
  if (value.length > 120) return null;

  const out: DailyContractRow[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) return null;

    const product =
      typeof raw.product === "string" ? raw.product.trim() : "";
    if (!product || product.length > 80) return null;

    const premium = parseFiniteInRange(raw.premium, 0, 1_000_000_000);
    const comfortPayment = parseFiniteInRange(
      raw.comfortPayment,
      0,
      1_000_000_000
    );
    if (premium == null || comfortPayment == null) return null;

    out.push({
      product,
      premium,
      comfortGradual: raw.comfortGradual === true,
      comfortPayment,
    });
  }

  return out;
}

function sanitizeSaveDayPayload(
  value: unknown
):
  | {
      outreach: number;
      agreed: number;
      meetings: number;
      workedHours: number;
      contracts: DailyContractRow[];
    }
  | null {
  if (!isPlainObject(value)) return null;

  const outreach = parseFiniteInRange(value.outreach, 0, 1_000_000_000);
  const agreed = parseFiniteInRange(value.agreed, 0, 1_000_000_000);
  const meetings = parseFiniteInRange(value.meetings, 0, 1_000_000_000);
  const workedHours = parseFiniteInRange(value.workedHours, 0, 1_000_000);
  const contracts = sanitizeDailyContracts(value.contracts);
  if (
    outreach == null ||
    agreed == null ||
    meetings == null ||
    workedHours == null ||
    contracts == null
  ) {
    return null;
  }

  return { outreach, agreed, meetings, workedHours, contracts };
}

function sanitizeSaveMonthPayload(
  value: unknown
):
  | {
      label: string;
      outreach: number;
      agreed: number;
      meetings: number;
      hours: number;
      contracts: number;
      premium: number;
      commission: number;
      positionSnapshot: Position | null;
      modeSnapshot: CommissionMode | null;
    }
  | null {
  if (!isPlainObject(value)) return null;

  const labelRaw = typeof value.label === "string" ? value.label.trim() : "";
  const label = labelRaw.slice(0, 120);
  const outreach = parseFiniteInRange(value.outreach, 0, 1_000_000_000);
  const agreed = parseFiniteInRange(value.agreed, 0, 1_000_000_000);
  const meetings = parseFiniteInRange(value.meetings, 0, 1_000_000_000);
  const hours = parseFiniteInRange(value.hours, 0, 1_000_000_000);
  const contracts = parseFiniteInRange(value.contracts, 0, 1_000_000_000);
  const premium = parseFiniteInRange(value.premium, 0, 1_000_000_000);
  const commission = parseFiniteInRange(value.commission, 0, 1_000_000_000);

  if (
    !label ||
    outreach == null ||
    agreed == null ||
    meetings == null ||
    hours == null ||
    contracts == null ||
    premium == null ||
    commission == null
  ) {
    return null;
  }

  const positionRaw =
    typeof value.positionSnapshot === "string"
      ? value.positionSnapshot.trim()
      : "";
  const modeRaw =
    typeof value.modeSnapshot === "string" ? value.modeSnapshot.trim() : "";

  const positionSnapshot = POSITION_SET.has(positionRaw as Position)
    ? (positionRaw as Position)
    : null;
  const modeSnapshot = COMMISSION_MODE_SET.has(modeRaw as CommissionMode)
    ? (modeRaw as CommissionMode)
    : null;

  return {
    label,
    outreach,
    agreed,
    meetings,
    hours,
    contracts,
    premium,
    commission,
    positionSnapshot,
    modeSnapshot,
  };
}

async function getAuthContext(
  req: NextRequest
): Promise<
  | {
      ok: true;
      ctx: AuthContext;
    }
  | {
      ok: false;
      response: NextResponse<ApiError>;
    }
> {
  if (!adminAuth || !adminDb) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Missing bearer token" },
        { status: 401 }
      ),
    };
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: `Invalid or expired token (${code}): ${message}` },
        { status: 401 }
      ),
    };
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "User e-mail missing in token" },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      email,
      uid: String(decoded.uid ?? "").trim(),
      isAdmin: (decoded as Record<string, unknown>).admin === true,
    },
  };
}

function applyRateLimitOrRespond({
  namespace,
  key,
  limit,
  windowMs,
}: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true; headers: Headers } | { ok: false; response: NextResponse<ApiError> } {
  const result = consumeRateLimit({ namespace, key, limit, windowMs });
  if (!result.allowed) {
    const response = NextResponse.json(
      { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." } satisfies ApiError,
      { status: 429 }
    );
    applyRateLimitHeaders(response.headers, result);
    return { ok: false, response };
  }

  const headers = new Headers();
  applyRateLimitHeaders(headers, result);
  return { ok: true, headers };
}

function ensureOwnerAccess(
  actor: AuthContext,
  ownerEmail: string
): { ok: true } | { ok: false; response: NextResponse<ApiError> } {
  if (ownerEmail === actor.email || actor.isAdmin) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      { ok: false, error: "Nemáš oprávnění k datům jiného uživatele." },
      { status: 403 }
    ),
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth.ok) return auth.response;

  const rate = applyRateLimitOrRespond({
    namespace: "api:user-stats:get",
    key: auth.ctx.email || auth.ctx.uid,
    limit: USER_STATS_GET_RATE_LIMIT,
    windowMs: USER_STATS_GET_WINDOW_MS,
  });
  if (!rate.ok) return rate.response;

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const ownerEmail = normalizeEmail(searchParams.get("owner")) || auth.ctx.email;
  const access = ensureOwnerAccess(auth.ctx, ownerEmail);
  if (!access.ok) {
    rate.headers.forEach((value, key) => access.response.headers.set(key, value));
    return access.response;
  }

  if (!adminDb) {
    const response = NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  if (mode === "profile") {
    const snap = await adminDb.collection("users").doc(ownerEmail).get();
    const data = (snap.data() as Record<string, unknown> | undefined) ?? {};
    const positionRaw =
      typeof data.position === "string" ? data.position.trim() : "";
    const commissionModeRaw =
      typeof data.commissionMode === "string" ? data.commissionMode.trim() : "";

    const response = NextResponse.json({
      ok: true,
      ownerEmail,
      position: POSITION_SET.has(positionRaw as Position)
        ? (positionRaw as Position)
        : null,
      commissionMode: COMMISSION_MODE_SET.has(
        commissionModeRaw as CommissionMode
      )
        ? (commissionModeRaw as CommissionMode)
        : null,
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  if (mode === "daily") {
    const ym = parseYearMonth(searchParams.get("year"), searchParams.get("month"));
    if (!ym) {
      const response = NextResponse.json(
        { ok: false, error: "Parametry year/month mají neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const dayPrefix = `${ym.year}-${pad2(ym.month)}-`;
    const dailyCol = adminDb
      .collection("userStats")
      .doc(ownerEmail)
      .collection("dailyStats");

    const snap = await dailyCol
      .orderBy(FieldPath.documentId())
      .startAt(`${dayPrefix}01`)
      .endAt(`${dayPrefix}99`)
      .get();

    const dailyStats = snap.docs
      .map((docSnap) => {
        const dayIndex = parseDayIndexFromDocId(
          docSnap.id,
          ym.year,
          ym.month,
          ym.dayCount
        );
        if (dayIndex == null) return null;

        const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
        const contracts = sanitizeDailyContracts(data.contracts);
        if (contracts == null) return null;

        return {
          dayIndex,
          outreach: parseFiniteInRange(data.outreach, 0, 1_000_000_000) ?? 0,
          agreed: parseFiniteInRange(data.agreed, 0, 1_000_000_000) ?? 0,
          meetings: parseFiniteInRange(data.meetings, 0, 1_000_000_000) ?? 0,
          workedHours: parseFiniteInRange(data.workedHours, 0, 1_000_000_000) ?? 0,
          contracts,
          updatedAt:
            parseFiniteInRange(data.updatedAt, 0, 9_999_999_999_999) ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => a.dayIndex - b.dayIndex);

    const response = NextResponse.json({
      ok: true,
      ownerEmail,
      year: ym.year,
      month: ym.month,
      dailyStats,
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  if (mode === "history") {
    const historySnap = await adminDb
      .collection("userStats")
      .doc(ownerEmail)
      .collection("monthlySnapshots")
      .orderBy("savedAt", "desc")
      .limit(12)
      .get();

    const response = NextResponse.json({
      ok: true,
      ownerEmail,
      history: parseHistoryItems(historySnap),
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  if (mode === "month") {
    const ym = parseYearMonth(searchParams.get("year"), searchParams.get("month"));
    if (!ym) {
      const response = NextResponse.json(
        { ok: false, error: "Parametry year/month mají neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const snap = await adminDb
      .collection("userStats")
      .doc(ownerEmail)
      .collection("monthlySnapshots")
      .doc(ym.monthKey)
      .get();
    const data = (snap.data() as Record<string, unknown> | undefined) ?? {};
    const savedAt = snap.exists
      ? parseFiniteInRange(data.savedAt, 0, 9_999_999_999_999)
      : null;

    const response = NextResponse.json({
      ok: true,
      ownerEmail,
      year: ym.year,
      month: ym.month,
      monthKey: ym.monthKey,
      savedAt: savedAt ?? null,
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  const response = NextResponse.json(
    { ok: false, error: "Neplatný režim. Použij mode=profile|daily|history|month." },
    { status: 400 }
  );
  rate.headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth.ok) return auth.response;

  const rate = applyRateLimitOrRespond({
    namespace: "api:user-stats:post",
    key: auth.ctx.email || auth.ctx.uid,
    limit: USER_STATS_POST_RATE_LIMIT,
    windowMs: USER_STATS_POST_WINDOW_MS,
  });
  if (!rate.ok) return rate.response;

  if (!adminDb) {
    const response = NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
      { status: 500 }
    );
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  const body = await req.json().catch(() => null);
  if (!isPlainObject(body)) {
    const response = NextResponse.json(
      { ok: false, error: "Neplatný payload." },
      { status: 400 }
    );
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const ownerEmail = normalizeEmail(body.ownerEmail) || auth.ctx.email;
  const access = ensureOwnerAccess(auth.ctx, ownerEmail);
  if (!access.ok) {
    rate.headers.forEach((value, key) => access.response.headers.set(key, value));
    return access.response;
  }

  if (action === "saveDay") {
    const ym = parseYearMonth(body.year, body.month);
    if (!ym) {
      const response = NextResponse.json(
        { ok: false, error: "Parametry year/month mají neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const dayIndex = parseIntegerInRange(body.dayIndex, 0, ym.dayCount - 1);
    if (dayIndex == null) {
      const response = NextResponse.json(
        { ok: false, error: "Parametr dayIndex má neplatnou hodnotu." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const payload = sanitizeSaveDayPayload(body.payload);
    if (!payload) {
      const response = NextResponse.json(
        { ok: false, error: "Denní payload má neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const dayKey = `${ym.year}-${pad2(ym.month)}-${pad2(dayIndex + 1)}`;
    await adminDb
      .collection("userStats")
      .doc(ownerEmail)
      .collection("dailyStats")
      .doc(dayKey)
      .set(
        {
          ...payload,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

    const response = NextResponse.json({
      ok: true,
      action: "saveDay",
      ownerEmail,
      dayKey,
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  if (action === "saveMonth") {
    const ym = parseYearMonth(body.year, body.month);
    if (!ym) {
      const response = NextResponse.json(
        { ok: false, error: "Parametry year/month mají neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const payload = sanitizeSaveMonthPayload(body.snapshot);
    if (!payload) {
      const response = NextResponse.json(
        { ok: false, error: "Měsíční payload má neplatný formát." },
        { status: 400 }
      );
      rate.headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    }

    const monthlyCol = adminDb
      .collection("userStats")
      .doc(ownerEmail)
      .collection("monthlySnapshots");

    const savedAt = Date.now();
    await monthlyCol.doc(ym.monthKey).set(
      {
        monthKey: ym.monthKey,
        label: payload.label,
        year: ym.year,
        month: ym.month - 1,
        outreach: payload.outreach,
        agreed: payload.agreed,
        meetings: payload.meetings,
        hours: payload.hours,
        contracts: payload.contracts,
        premium: payload.premium,
        commission: payload.commission,
        positionSnapshot: payload.positionSnapshot,
        modeSnapshot: payload.modeSnapshot,
        savedAt,
      },
      { merge: true }
    );

    const allSnap = await monthlyCol.orderBy("savedAt", "desc").get();
    if (allSnap.docs.length > 12) {
      const batch = adminDb.batch();
      for (let i = 12; i < allSnap.docs.length; i += 1) {
        batch.delete(allSnap.docs[i].ref);
      }
      await batch.commit();
    }

    const historySnap = await monthlyCol.orderBy("savedAt", "desc").limit(12).get();

    const response = NextResponse.json({
      ok: true,
      action: "saveMonth",
      ownerEmail,
      monthKey: ym.monthKey,
      savedAt,
      history: parseHistoryItems(historySnap),
    });
    rate.headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  }

  const response = NextResponse.json(
    { ok: false, error: "Neplatná akce. Použij saveDay nebo saveMonth." },
    { status: 400 }
  );
  rate.headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

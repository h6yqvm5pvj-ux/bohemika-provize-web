import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_SEARCH_RATE_LIMIT = 180;
const USER_SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
const USER_SEARCH_MAX_RESULTS = 8;
const USER_SEARCH_MIN_QUERY_LEN = 2;
const USER_DIRECTORY_CACHE_TTL_MS = 45_000;

type UserSearchSuccess = {
  ok: true;
  users: Array<{
    email: string;
    name: string;
    managerEmail: string | null;
  }>;
};

type UserSearchError = {
  ok: false;
  error: string;
};

type UserDirectoryRow = {
  email: string;
  name: string;
  managerEmail: string | null;
  searchEmail: string;
  searchName: string;
};

type UserDirectoryCache = {
  expiresAtMs: number;
  rows: UserDirectoryRow[];
};

let userDirectoryCache: UserDirectoryCache | null = null;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeSearch = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
};

const pickBestName = (data: Record<string, unknown>, email: string): string => {
  const fullName = normalizeText(data.fullName);
  if (fullName) return fullName;
  const name = normalizeText(data.name);
  if (name) return name;
  return nameFromEmail(email);
};

const chooseBetterRow = (current: UserDirectoryRow, next: UserDirectoryRow): UserDirectoryRow => {
  const currentHasCustomName = normalizeSearch(current.name) !== normalizeSearch(nameFromEmail(current.email));
  const nextHasCustomName = normalizeSearch(next.name) !== normalizeSearch(nameFromEmail(next.email));
  if (currentHasCustomName !== nextHasCustomName) {
    return nextHasCustomName ? next : current;
  }

  const currentHasManager = current.managerEmail ? 1 : 0;
  const nextHasManager = next.managerEmail ? 1 : 0;
  if (currentHasManager !== nextHasManager) {
    return nextHasManager > currentHasManager ? next : current;
  }

  return current;
};

async function loadUserDirectoryRows(): Promise<UserDirectoryRow[]> {
  if (!adminDb) return [];
  const nowMs = Date.now();
  if (userDirectoryCache && userDirectoryCache.expiresAtMs > nowMs) {
    return userDirectoryCache.rows;
  }

  const usersSnap = await adminDb.collection("users").get();
  const rowsByEmail = new Map<string, UserDirectoryRow>();

  for (const docSnap of usersSnap.docs) {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    if (!email) continue;
    const name = pickBestName(data, email);
    const managerEmail = normalizeEmail(data.managerEmail) || null;
    const row: UserDirectoryRow = {
      email,
      name,
      managerEmail,
      searchEmail: normalizeSearch(email),
      searchName: normalizeSearch(name),
    };

    const existing = rowsByEmail.get(email);
    rowsByEmail.set(email, existing ? chooseBetterRow(existing, row) : row);
  }

  const rows = [...rowsByEmail.values()];
  userDirectoryCache = {
    rows,
    expiresAtMs: nowMs + USER_DIRECTORY_CACHE_TTL_MS,
  };
  return rows;
}

const scoreRow = (row: UserDirectoryRow, queryRaw: string, queryNormalized: string): number => {
  if (!queryNormalized) return 0;
  let score = 0;
  if (row.searchEmail === queryNormalized) score += 300;
  if (row.searchName === queryNormalized) score += 260;
  if (row.searchEmail.startsWith(queryNormalized)) score += 220;
  if (row.searchName.startsWith(queryNormalized)) score += 200;
  if (row.searchEmail.includes(queryNormalized)) score += 100;
  if (row.searchName.includes(queryNormalized)) score += 90;
  if (row.email === queryRaw) score += 30;
  return score;
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-search:get",
    limit: USER_SEARCH_RATE_LIMIT,
    windowMs: USER_SEARCH_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies UserSearchError,
        { status: 500 }
      ),
      ctx
    );
  }

  const queryRaw = normalizeEmail(req.nextUrl.searchParams.get("q"));
  if (queryRaw.length < USER_SEARCH_MIN_QUERY_LEN) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: true, users: [] } satisfies UserSearchSuccess),
      ctx
    );
  }

  try {
    const queryNormalized = normalizeSearch(queryRaw);
    const rows = await loadUserDirectoryRows();
    const filtered = rows
      .filter((row) => row.email !== ctx.email)
      .map((row) => ({
        row,
        score: scoreRow(row, queryRaw, queryNormalized),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        return a.row.email.localeCompare(b.row.email, "cs");
      })
      .slice(0, USER_SEARCH_MAX_RESULTS)
      .map((item) => ({
        email: item.row.email,
        name: item.row.name,
        managerEmail: item.row.managerEmail,
      }));

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, users: filtered } satisfies UserSearchSuccess),
      ctx
    );
  } catch (error) {
    console.error("GET /api/user/search failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst návrhy uživatelů." } satisfies UserSearchError,
        { status: 500 }
      ),
      ctx
    );
  }
}

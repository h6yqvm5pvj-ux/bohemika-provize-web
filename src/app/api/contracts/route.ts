// src/app/api/contracts/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type ContractDoc = {
  id: string;
  paid?: boolean | null;

  productKey?: Product;
  position?: Position | null;
  inputAmount?: number;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | number | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | number | null;
  policyStartDate?: FirestoreTimestamp | Date | string | number | null;
};

type ContractResponseItem = ContractDoc & { adviserEmail: string | null };

type ContractsResponse = {
  ok: true;
  scope: "my" | "team";
  position: Position | null;
  hasTeam: boolean;
  teamEmails: string[];
  contracts: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
  teamContracts?: ContractResponseItem[];
  teamHasMore?: boolean;
  teamNextCursor?: number | null;
  teamNextCursorToken?: string | null;
};

type ErrorResponse = { ok: false; error: string };

const PAGE_SIZE_DEFAULT = 30;
const PAGE_SIZE_MAX = 50;

const isManagerPosition = (pos: Position | null | undefined): boolean =>
  Boolean(pos) && (pos as Position).startsWith("manazer");

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms = v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

const toMillis = (value: any): number | null => {
  const d = toDate(value);
  return d ? d.getTime() : null;
};

const contractSortDate = (data: ContractDoc): Date | null =>
  toDate(data.contractSignedDate) ?? toDate(data.createdAt);

type ParsedCursor = {
  date: Date;
  ts: number;
  key: string | null;
};

const encodeCursorToken = (ts: number, key: string) =>
  `${ts}::${encodeURIComponent(key)}`;

const contractCursorKey = (ownerEmail: string, docId: string) =>
  `${normalizeEmail(ownerEmail)}___${docId}`;

const responseCursorKey = (item: ContractResponseItem) =>
  contractCursorKey(
    normalizeEmail(item.adviserEmail ?? item.userEmail ?? ""),
    item.id
  );

const parseCursor = (search: URLSearchParams): ParsedCursor | null => {
  const raw = search.get("cursor");
  if (!raw) return null;
  const sep = raw.indexOf("::");
  if (sep > 0) {
    const ts = Number(raw.slice(0, sep));
    if (Number.isFinite(ts)) {
      const date = new Date(ts);
      if (!Number.isNaN(date.getTime())) {
        const keyPart = raw.slice(sep + 2);
        const key = keyPart ? decodeURIComponent(keyPart) : null;
        return { date, ts, key };
      }
    }
  }
  const num = Number(raw);
  if (Number.isFinite(num)) {
    const d = new Date(num);
    if (!Number.isNaN(d.getTime())) {
      return { date: d, ts: d.getTime(), key: null };
    }
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, ts: d.getTime(), key: null };
};

const normalizeEmail = (email: string | null | undefined) =>
  (email ?? "").trim().toLowerCase();

const buildUserTree = async () => {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const snap = await adminDb.collection("users").get();
  type UserNode = { email: string; managerEmail: string | null; position: Position | null };
  const users: UserNode[] = [];

  snap.forEach((doc) => {
    const data = doc.data() as any;
    const email = normalizeEmail((data.email as string | undefined) ?? doc.id);
    if (!email) return;
    const managerEmail = normalizeEmail(data.managerEmail as string | undefined);
    const position = (data.position as Position | null | undefined) ?? null;
    users.push({ email, managerEmail: managerEmail || null, position });
  });

  const childrenByManager = new Map<string, UserNode[]>();
  for (const u of users) {
    if (!u.managerEmail) continue;
    const list = childrenByManager.get(u.managerEmail) ?? [];
    list.push(u);
    childrenByManager.set(u.managerEmail, list);
  }

  return { users, childrenByManager };
};

const collectTeamEmails = (rootEmail: string, childrenByManager: Map<string, any[]>): string[] => {
  const visited = new Set<string>();
  const queue: string[] = [rootEmail];

  while (queue.length > 0) {
    const mgr = queue.shift()!;
    const children = childrenByManager.get(mgr) ?? [];
    for (const child of children) {
      if (!child.email || visited.has(child.email)) continue;
      visited.add(child.email);
      queue.push(child.email);
    }
  }

  return Array.from(visited);
};

async function fetchContractsForOwners(
  owners: string[],
  cursor: ParsedCursor | null,
  pageSize: number
): Promise<{
  list: ContractResponseItem[];
  hasMore: boolean;
  nextCursor: number | null;
  nextCursorToken: string | null;
}> {
  // Fetch one extra record to detect if more pages exist (so the UI can show the load-more button)
  const pageLimit = pageSize + 1;
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const collected: ContractResponseItem[] = [];
  const seen = new Set<string>();
  let collectionGroupFailed = false;
  const cursorTs = cursor?.ts ?? null;
  const cursorKey = cursor?.key ?? null;

  const shouldIncludeByCursor = (
    data: ContractDoc,
    docId: string,
    ownerEmail: string
  ): boolean => {
    if (!cursorTs) return true;
    const sortDate = contractSortDate(data);
    if (!sortDate) return false;
    const ts = sortDate.getTime();
    if (ts < cursorTs) return true;
    if (ts > cursorTs) return false;
    if (!cursorKey) return false;
    const itemKey = contractCursorKey(ownerEmail, docId);
    return itemKey < cursorKey;
  };

  const pushCollected = (docId: string, ownerEmail: string, data: ContractDoc) => {
    if (!shouldIncludeByCursor(data, docId, ownerEmail)) return;
    const key = `${ownerEmail}___${docId}`;
    if (seen.has(key)) return;
    seen.add(key);
    collected.push({
      ...data,
      contractSignedDate: toMillis(data.contractSignedDate),
      createdAt: toMillis(data.createdAt),
      policyStartDate: toMillis((data as any).policyStartDate),
      id: docId,
      adviserEmail: ownerEmail,
      userEmail: data.userEmail ?? ownerEmail,
    });
  };

  // collectionGroup queries (userEmail stored)
  // Pull by both date fields so records without contractSignedDate are still included.
  for (let i = 0; i < owners.length; i += 10) {
    const chunk = owners.slice(i, i + 10);
    try {
      let qBySigned = adminDb
        .collectionGroup("entries")
        .where("userEmail", "in", chunk)
        .orderBy("contractSignedDate", "desc");
      let qByCreated = adminDb
        .collectionGroup("entries")
        .where("userEmail", "in", chunk)
        .orderBy("createdAt", "desc");
      if (cursor) {
        qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
        qByCreated = qByCreated.where("createdAt", "<=", cursor.date);
      }

      const [signedSnap, createdSnap] = await Promise.all([
        qBySigned.limit(pageLimit).get(),
        qByCreated.limit(pageLimit).get(),
      ]);

      const consumeSnap = (snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => {
        snap.docs.forEach((doc) => {
          const data = doc.data() as any as ContractDoc;
          const ownerEmail = normalizeEmail(
            (data.userEmail as string | undefined) ??
              doc.ref.parent.parent?.id ??
              chunk[0]
          );
          pushCollected(doc.id, ownerEmail, data);
        });
      };

      consumeSnap(signedSnap);
      consumeSnap(createdSnap);
    } catch {
      // Keep the endpoint functional even when collectionGroup index is missing/misconfigured.
      collectionGroupFailed = true;
      break;
    }
  }

  if (collectionGroupFailed) {
    collected.length = 0;
    seen.clear();
  }

  // fallback: per-user path (covers records without userEmail)
  for (const owner of owners) {
    try {
      let qBySigned = adminDb
        .collection("users")
        .doc(owner)
        .collection("entries")
        .orderBy("contractSignedDate", "desc");
      let qByCreated = adminDb
        .collection("users")
        .doc(owner)
        .collection("entries")
        .orderBy("createdAt", "desc");
      if (cursor) {
        qBySigned = qBySigned.where("contractSignedDate", "<=", cursor.date);
        qByCreated = qByCreated.where("createdAt", "<=", cursor.date);
      }

      const [signedSnap, createdSnap] = await Promise.all([
        qBySigned.limit(pageLimit).get(),
        qByCreated.limit(pageLimit).get(),
      ]);

      const consumeSnap = (snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) => {
        snap.docs.forEach((doc) => {
          const data = doc.data() as any as ContractDoc;
          pushCollected(doc.id, owner, data);
        });
      };

      consumeSnap(signedSnap);
      consumeSnap(createdSnap);
    } catch {
      // Ignore one broken owner branch instead of failing the whole response.
    }
  }

  collected.sort((a, b) => {
    const da = contractSortDate(a);
    const db = contractSortDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const diff = db.getTime() - da.getTime();
    if (diff !== 0) return diff;
    const keyA = responseCursorKey(a);
    const keyB = responseCursorKey(b);
    if (keyA === keyB) return 0;
    return keyA > keyB ? -1 : 1;
  });

  const page = collected.slice(0, pageSize);
  const hasMore = collected.length > pageSize;
  const oldest = page.length > 0 ? contractSortDate(page[page.length - 1]) : null;
  const oldestKey =
    page.length > 0 ? responseCursorKey(page[page.length - 1]) : null;
  const nextCursor = oldest ? oldest.getTime() : null;
  const nextCursorToken =
    oldest && oldestKey ? encodeCursorToken(oldest.getTime(), oldestKey) : null;

  return {
    list: page,
    hasMore,
    nextCursor,
    nextCursorToken,
  };
}

async function getAuthContext(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return { error: "Server není správně nakonfigurován (chybí Firebase Admin credentials).", status: 500 } as const;
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return { error: "Missing bearer token", status: 401 } as const;
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (err: any) {
    const msg = err?.message || "Invalid or expired token";
    const code = err?.code || "auth/invalid-token";
    return { error: `Invalid or expired token (${code}): ${msg}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  const { users, childrenByManager } = await buildUserTree();
  const me = users.find((u) => u.email === email) ?? null;
  const position = (me?.position as Position | null | undefined) ?? null;
  const hasDirectSubs = (childrenByManager.get(email) ?? []).length > 0;
  const teamEmails =
    isManagerPosition(position) || hasDirectSubs
      ? collectTeamEmails(email, childrenByManager)
      : [];

  return {
    email,
    position,
    teamEmails,
  };
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }

  const { email, position, teamEmails } = ctx;
  const search = req.nextUrl.searchParams;
  const scopeParam = search.get("scope") === "team" ? "team" : "my";
  const includeTeam = search.get("includeTeam") === "1" || search.get("includeTeam") === "true";
  const cursor = parseCursor(search);
  const limitParam = Number(search.get("limit"));
  const pageSize =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(1, limitParam), PAGE_SIZE_MAX)
      : PAGE_SIZE_DEFAULT;

  if (scopeParam === "team" && teamEmails.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nemáš práva pro zobrazení týmových smluv." } satisfies ErrorResponse,
      { status: 403 }
    );
  }

  const owners = scopeParam === "team" ? teamEmails : [email];
  const { list, hasMore, nextCursor, nextCursorToken } =
    await fetchContractsForOwners(
    owners,
    cursor,
    pageSize
  );

  let teamContracts: ContractResponseItem[] | undefined;
  let teamHasMore: boolean | undefined;
  let teamNextCursor: number | null | undefined;
  let teamNextCursorToken: string | null | undefined;
  if (includeTeam && teamEmails.length > 0) {
    const teamRes = await fetchContractsForOwners(teamEmails, null, pageSize);
    teamContracts = teamRes.list;
    teamHasMore = teamRes.hasMore;
    teamNextCursor = teamRes.nextCursor;
    teamNextCursorToken = teamRes.nextCursorToken;
  }

  const response: ContractsResponse = {
    ok: true,
    scope: scopeParam,
    position,
    hasTeam: teamEmails.length > 0,
    teamEmails,
    contracts: list,
    hasMore,
    nextCursor,
    nextCursorToken,
    teamContracts,
    teamHasMore,
    teamNextCursor,
    teamNextCursorToken,
  };

  return NextResponse.json(response);
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  const { email, teamEmails } = ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  const paid = body.paid === true;

  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Chybí položky k úpravě." }, { status: 400 });
  }

  const allowedOwners = new Set<string>([email, ...teamEmails]);
  let updated = 0;
  for (const item of entries) {
    const owner = normalizeEmail(item.ownerEmail);
    const entryId = item.entryId as string | undefined;
    if (!owner || !entryId) continue;
    if (!allowedOwners.has(owner)) continue;

    await adminDb
      ?.collection("users")
      .doc(owner)
      .collection("entries")
      .doc(entryId)
      .set({ paid }, { merge: true });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if ("error" in ctx) {
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  }
  const { email, teamEmails } = ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON payload." }, { status: 400 });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "Chybí položky ke smazání." }, { status: 400 });
  }

  const allowedOwners = new Set<string>([email, ...teamEmails]);
  let deleted = 0;

  for (const item of entries) {
    const owner = normalizeEmail(item.ownerEmail);
    const entryId = item.entryId as string | undefined;
    if (!owner || !entryId) continue;
    if (!allowedOwners.has(owner)) continue;

    await adminDb
      ?.collection("users")
      .doc(owner)
      .collection("entries")
      .doc(entryId)
      .delete();
    deleted += 1;
  }

  return NextResponse.json({ ok: true, deleted });
}

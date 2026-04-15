// src/app/api/contracts/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  buildChildrenByManager,
  collectSubordinateHierarchy,
} from "@/app/lib/teamHierarchy";
import { toDate } from "@/app/lib/formatters";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type ContractDoc = {
  id: string;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | number | null;

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
const REPLACEMENT_STORNO_PRODUCTS = new Set<Product>([
  "zamex",
  "domex",
  "koopmajetekobcan",
  "maxdomov",
  "cppsimplex",
  "cppPPRbez",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "pillowAuto",
  "kooperativaAuto",
]);

const isManagerPosition = (pos: Position | null | undefined): boolean =>
  Boolean(pos) && (pos as Position).startsWith("manazer");

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

const safeDecodeCursorKey = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

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
        const key = keyPart ? safeDecodeCursorKey(keyPart) : null;
        if (keyPart && key == null) return null;
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

  const childrenByManager = buildChildrenByManager(users);
  return { users, childrenByManager };
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
      stornoDate: toMillis((data as any).stornoDate),
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

async function findEntriesByContractNumberAcrossUsers(
  contractNumber: string
): Promise<
  FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
> {
  if (!adminDb) {
    throw new Error("Firebase Admin credentials are not configured.");
  }
  const db = adminDb;

  try {
    const byGroup = await db
      .collectionGroup("entries")
      .where("contractNumber", "==", contractNumber)
      .get();
    return byGroup.docs;
  } catch (err) {
    console.warn(
      "Refresh storno: collectionGroup(contractNumber) selhal, pouštím fallback přes users/*/entries.",
      err
    );
  }

  const usersSnap = await db.collection("users").get();
  const ownerIds = usersSnap.docs.map((doc) => doc.id).filter(Boolean);
  const hits: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];

  for (let i = 0; i < ownerIds.length; i += 20) {
    const chunk = ownerIds.slice(i, i + 20);
    const chunkSnaps = await Promise.all(
      chunk.map(async (ownerId) => {
        try {
          return await db
            .collection("users")
            .doc(ownerId)
            .collection("entries")
            .where("contractNumber", "==", contractNumber)
            .get();
        } catch (scanErr) {
          console.warn(
            `Refresh storno: fallback query selhal pro users/${ownerId}/entries.`,
            scanErr
          );
          return null;
        }
      })
    );

    chunkSnaps.forEach((snap) => {
      if (!snap) return;
      hits.push(...snap.docs);
    });
  }

  return hits;
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
      ? collectSubordinateHierarchy(email, childrenByManager).subordinateEmails
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

  const action =
    typeof body?.action === "string" ? body.action.trim() : "";
  if (action === "refreshNeonStorno") {
    try {
      const originalContractNumber =
        typeof body?.originalContractNumber === "string"
          ? body.originalContractNumber.trim()
          : "";
      const newEntryId =
        typeof body?.newEntryId === "string" ? body.newEntryId.trim() : "";
      const stornoDateMs = Number(body?.stornoDateMs);
      const refreshSignedDateMs = Number(body?.refreshSignedDateMs);

      if (!originalContractNumber) {
        return NextResponse.json(
          { ok: false, error: "Chybí číslo původní smlouvy." },
          { status: 400 }
        );
      }
      if (!newEntryId) {
        return NextResponse.json(
          { ok: false, error: "Chybí ID nové smlouvy." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(stornoDateMs) || !Number.isFinite(refreshSignedDateMs)) {
        return NextResponse.json(
          { ok: false, error: "Chybí validní data refreshu." },
          { status: 400 }
        );
      }

      const stornoDate = new Date(stornoDateMs);
      const refreshSignedDate = new Date(refreshSignedDateMs);
      if (
        Number.isNaN(stornoDate.getTime()) ||
        Number.isNaN(refreshSignedDate.getTime())
      ) {
        return NextResponse.json(
          { ok: false, error: "Neplatné datum storna nebo sjednání refreshu." },
          { status: 400 }
        );
      }

      const newEntryRef = adminDb
        ?.collection("users")
        .doc(email)
        .collection("entries")
        .doc(newEntryId);
      const newEntrySnap = await newEntryRef?.get();
      if (!newEntrySnap?.exists) {
        return NextResponse.json(
          { ok: false, error: "Nová smlouva pro refresh nebyla nalezena." },
          { status: 404 }
        );
      }

      const newEntryData = newEntrySnap.data() as ContractDoc | undefined;
      if ((newEntryData?.productKey as Product | undefined) !== "neon") {
        return NextResponse.json(
          { ok: false, error: "Refresh storno je dostupné jen pro ČPP ŽP NEON." },
          { status: 400 }
        );
      }

      const refreshTargets = await findEntriesByContractNumberAcrossUsers(
        originalContractNumber
      );

      let updated = 0;
      for (const snap of refreshTargets) {
        const data = snap.data() as ContractDoc;
        if ((data.productKey as Product | undefined) !== "neon") continue;

        const owner = normalizeEmail(
          (snap.ref.parent.parent?.id as string | undefined) ??
            (data.userEmail as string | undefined)
        );
        if (owner === email && snap.id === newEntryId) continue;

        await snap.ref.set(
          {
            status: "storno",
            stornoDate,
            refreshReplacedByEntryId: newEntryId,
            refreshReplacedByOwnerEmail: email,
            refreshReplacedBySignedDate: refreshSignedDate,
          },
          { merge: true }
        );
        updated += 1;
      }

      return NextResponse.json({ ok: true, updated });
    } catch (refreshErr: any) {
      const message =
        typeof refreshErr?.message === "string" && refreshErr.message.trim()
          ? refreshErr.message.trim()
          : "Neznámá chyba při refresh storno.";
      console.error("PATCH /api/contracts refreshNeonStorno selhal:", refreshErr);
      return NextResponse.json(
        { ok: false, error: `Refresh storno selhalo: ${message}` },
        { status: 500 }
      );
    }
  }

  if (action === "replacementStorno") {
    try {
      const originalContractNumber =
        typeof body?.originalContractNumber === "string"
          ? body.originalContractNumber.trim()
          : "";
      const newEntryId =
        typeof body?.newEntryId === "string" ? body.newEntryId.trim() : "";
      const stornoDateMs = Number(body?.stornoDateMs);
      const replacementSignedDateMs = Number(body?.replacementSignedDateMs);

      if (!originalContractNumber) {
        return NextResponse.json(
          { ok: false, error: "Chybí číslo nahrazované smlouvy." },
          { status: 400 }
        );
      }
      if (!newEntryId) {
        return NextResponse.json(
          { ok: false, error: "Chybí ID nové smlouvy." },
          { status: 400 }
        );
      }
      if (!Number.isFinite(stornoDateMs) || !Number.isFinite(replacementSignedDateMs)) {
        return NextResponse.json(
          { ok: false, error: "Chybí validní data náhrady." },
          { status: 400 }
        );
      }

      const stornoDate = new Date(stornoDateMs);
      const replacementSignedDate = new Date(replacementSignedDateMs);
      if (
        Number.isNaN(stornoDate.getTime()) ||
        Number.isNaN(replacementSignedDate.getTime())
      ) {
        return NextResponse.json(
          { ok: false, error: "Neplatné datum storna nebo sjednání náhrady." },
          { status: 400 }
        );
      }

      const newEntryRef = adminDb
        ?.collection("users")
        .doc(email)
        .collection("entries")
        .doc(newEntryId);
      const newEntrySnap = await newEntryRef?.get();
      if (!newEntrySnap?.exists) {
        return NextResponse.json(
          { ok: false, error: "Nová smlouva pro náhradu nebyla nalezena." },
          { status: 404 }
        );
      }

      const newEntryData = newEntrySnap.data() as ContractDoc | undefined;
      const newEntryProduct = newEntryData?.productKey as Product | undefined;
      if (!newEntryProduct || !REPLACEMENT_STORNO_PRODUCTS.has(newEntryProduct)) {
        return NextResponse.json(
          { ok: false, error: "Náhrada storno není pro tento produkt podporovaná." },
          { status: 400 }
        );
      }

      const replacementTargets = await findEntriesByContractNumberAcrossUsers(
        originalContractNumber
      );

      let updated = 0;
      for (const snap of replacementTargets) {
        const data = snap.data() as ContractDoc;
        if ((data.productKey as Product | undefined) !== newEntryProduct) continue;

        const owner = normalizeEmail(
          (snap.ref.parent.parent?.id as string | undefined) ??
            (data.userEmail as string | undefined)
        );
        if (owner === email && snap.id === newEntryId) continue;

        await snap.ref.set(
          {
            status: "storno",
            stornoDate,
            replacementReplacedByEntryId: newEntryId,
            replacementReplacedByOwnerEmail: email,
            replacementReplacedBySignedDate: replacementSignedDate,
          },
          { merge: true }
        );
        updated += 1;
      }

      return NextResponse.json({ ok: true, updated });
    } catch (replacementErr: any) {
      const message =
        typeof replacementErr?.message === "string" && replacementErr.message.trim()
          ? replacementErr.message.trim()
          : "Neznámá chyba při náhradě storno.";
      console.error("PATCH /api/contracts replacementStorno selhal:", replacementErr);
      return NextResponse.json(
        { ok: false, error: `Náhrada storno selhala: ${message}` },
        { status: 500 }
      );
    }
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

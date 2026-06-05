import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPS_BULK_DELETE_RATE_LIMIT = 30;
const TIPS_BULK_DELETE_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BULK_DELETE_IDS = 80;

type AccountType = "advisor" | "tipster";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeId = (value: unknown): string => {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > 240 || normalized.includes("/")) return "";
  return normalized;
};

const resolveAccountType = (data: Record<string, unknown>): AccountType => {
  const raw =
    typeof data.accountType === "string"
      ? data.accountType
      : typeof data.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const loadAccountType = async (email: string): Promise<AccountType> => {
  if (!adminDb) return "advisor";
  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(email).get(),
    adminDb.collection("usersPrivate").doc(email).get(),
  ]);
  const merged = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };
  return resolveAccountType(merged);
};

const statusCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("advisorTipStatuses");

const mailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

const parseRequestIds = (body: unknown): string[] | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const idsRaw = (body as Record<string, unknown>).ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0 || idsRaw.length > MAX_BULK_DELETE_IDS) {
    return null;
  }

  const ids = new Set<string>();
  for (const value of idsRaw) {
    const id = normalizeId(value);
    if (!id) return null;
    ids.add(id);
  }

  return ids.size > 0 ? Array.from(ids) : null;
};

const deleteTipsterTips = async (email: string, ids: string[]) => {
  const tipRefs = ids.map((id) =>
    adminDb!.collection("usersPrivate").doc(email).collection("tipsterTips").doc(id)
  );
  const tipSnaps = await Promise.all(tipRefs.map((ref) => ref.get()));
  const batch = adminDb!.batch();
  const deletedIds: string[] = [];
  const skippedIds: string[] = [];

  tipSnaps.forEach((tipSnap, index) => {
    const id = ids[index]!;
    if (!tipSnap.exists) {
      skippedIds.push(id);
      return;
    }
    batch.delete(tipRefs[index]!);
    deletedIds.push(id);
  });

  if (deletedIds.length > 0) {
    await batch.commit();
  }

  return { deletedIds, skippedIds };
};

const deleteAdvisorTips = async (email: string, ids: string[]) => {
  const mailboxRefs = ids.map((id) => mailboxCollection(email).doc(id));
  const mailboxSnaps = await Promise.all(mailboxRefs.map((ref) => ref.get()));
  const batch = adminDb!.batch();
  const deletedIds: string[] = [];
  const skippedIds: string[] = [];

  mailboxSnaps.forEach((mailboxSnap, index) => {
    const id = ids[index]!;
    if (!mailboxSnap.exists) {
      skippedIds.push(id);
      return;
    }

    const data = (mailboxSnap.data() ?? {}) as Record<string, unknown>;
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
    if (
      data.type !== "direct_message" ||
      metadata.tipsterTip !== true ||
      metadata.mailboxDirection !== "received"
    ) {
      skippedIds.push(id);
      return;
    }

    batch.delete(mailboxRefs[index]!);
    batch.delete(statusCollection(email).doc(id));
    deletedIds.push(id);
  });

  if (deletedIds.length > 0) {
    await batch.commit();
  }

  return { deletedIds, skippedIds };
};

export async function DELETE(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:tips-bulk-delete:delete",
    limit: TIPS_BULK_DELETE_RATE_LIMIT,
    windowMs: TIPS_BULK_DELETE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const ids = parseRequestIds(await req.json().catch(() => null));
  if (!ids) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Vyber 1 až ${MAX_BULK_DELETE_IDS} platných tipů ke smazání.`,
        },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const accountType = await loadAccountType(ctx.email);
    const result =
      accountType === "tipster"
        ? await deleteTipsterTips(normalizeEmail(ctx.email), ids)
        : await deleteAdvisorTips(normalizeEmail(ctx.email), ids);

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        deletedIds: result.deletedIds,
        skippedIds: result.skippedIds,
        deletedCount: result.deletedIds.length,
        skippedCount: result.skippedIds.length,
      }),
      ctx
    );
  } catch (error) {
    console.error("Tips bulk DELETE failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Vybrané tipy se nepodařilo smazat." },
        { status: 500 }
      ),
      ctx
    );
  }
}

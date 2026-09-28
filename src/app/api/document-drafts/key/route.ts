import { sealPrivateValue, openPrivateValue, isPrivateValue } from "@/lib/server/privateEncryption";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { requireAuthedRateLimited } from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization", "X-Content-Type-Options": "nosniff" };

async function hasBodyContent(req: NextRequest): Promise<boolean> {
  // Production adapters may expose an empty stream for a bodyless POST.
  // Reject actual bytes without buffering an arbitrarily large request.
  if (!req.body) return false;
  const reader = req.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength) {
        await reader.cancel();
        return true;
      }
    }
  } catch {
    return true;
  } finally {
    reader.releaseLock();
  }
}

/** Only the verified actor can unlock their local drafts. Roles grant no override. */
export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:document-draft-key", limit: 30, windowMs: 60_000,
    enforceAdvisorSetup: false, allowImpersonation: false,
  });
  if (!guard.ok) {
    Object.entries(headers).forEach(([key, value]) => guard.response.headers.set(key, value));
    return guard.response;
  }
  const { ctx } = guard;
  if (ctx.isImpersonating || ctx.uid !== ctx.actorUid || ctx.actorUid !== ctx.decoded.uid) {
    return NextResponse.json({ ok: false, error: "Koncept může otevřít pouze jeho autor." }, { status: 403, headers });
  }
  // No caller-supplied owner, path, email or UID is accepted, even for administrators.
  if (req.nextUrl.search || await hasBodyContent(req)) {
    return NextResponse.json({ ok: false, error: "U tohoto požadavku nelze určit jiného autora." }, { status: 400, headers });
  }
  if (!adminDb) return NextResponse.json({ ok: false, error: "Zabezpečené ukládání není dostupné." }, { status: 503, headers });
  try {
    const ownerUid = ctx.actorUid;
    const id = createHash("sha256").update(ownerUid).digest("hex");
    const ref = adminDb.collection("documentDraftKeys").doc(id);
    const key = await adminDb.runTransaction(async transaction => {
      const record = await transaction.get(ref);
      if (record.exists) {
        const data = record.data();
        if (data?.ownerUid !== ownerUid) throw new Error("Invalid draft key owner");
        const rawKey = openPrivateValue(data.key, `documentDraftKeys/${id}:key`);
        if (data?.ownerUid !== ownerUid || data.version !== 1 || typeof rawKey !== "string" ||
          !/^[A-Za-z0-9+/]{43}=$/.test(rawKey)) throw new Error("Invalid draft key record");
        if (!isPrivateValue(data.key)) transaction.update(ref, { key: sealPrivateValue(rawKey, `documentDraftKeys/${id}:key`) });
        return rawKey as string;
      }
      const generated = randomBytes(32).toString("base64");
      transaction.create(ref, { version: 1, ownerUid, key: sealPrivateValue(generated, `documentDraftKeys/${id}:key`), createdAt: Date.now() });
      return generated;
    });
    return NextResponse.json({ ok: true, ownerUid, ownerEmail: ctx.actorEmail, key }, { headers });
  } catch {
    // Never log key material or document contents.
    return NextResponse.json({ ok: false, error: "Koncept se nepodařilo bezpečně odemknout. Zkus to znovu." }, { status: 503, headers });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { loadContactDirectoryMembers } from "@/lib/server/contactDirectoryMembers";
import { canManageToolDocuments } from "@/lib/server/toolDocuments";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2048;
const MAX_RESULTS = 12;
type AuthContext = Parameters<typeof withRateLimitHeaders>[1];

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Vary", "Authorization, Cookie");
  return response;
}

function json(payload: Record<string, unknown>, status: number, ctx?: AuthContext) {
  const response = noStore(NextResponse.json(payload, { status }));
  return ctx ? withRateLimitHeaders(response, ctx) : response;
}

class BodyError extends Error {
  constructor(readonly status: 400 | 413) { super("Invalid contact member search body"); }
}

async function readBody(req: NextRequest): Promise<unknown> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) throw new BodyError(400);
    if (Number(declaredLength) > MAX_BODY_BYTES) throw new BodyError(413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new BodyError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyError(413);
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    reader.releaseLock();
  }
}

const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");

export async function POST(req: NextRequest) {
  let ctx: AuthContext | undefined;
  try {
    const guard = await requireAdvisorAuthedRateLimited(req, {
      namespace: "api:contacts:members",
      limit: 60,
      windowMs: 60_000,
    });
    if (!guard.ok) return noStore(guard.response);
    ctx = guard.ctx;
    if (!await canManageToolDocuments({ email: ctx.email, uid: ctx.uid, decoded: ctx.decoded as Record<string, unknown> })) {
      return json({ ok: false, error: "Členy skupin může vyhledávat pouze administrátor nebo specialista." }, 403, ctx);
    }
    if (req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return json({ ok: false, error: "Požadavek musí obsahovat JSON." }, 415, ctx);
    }
    let raw: unknown;
    try { raw = await readBody(req); }
    catch (error) {
      return json({ ok: false, error: "Neplatné nebo příliš velké vyhledávání." }, error instanceof BodyError ? error.status : 400, ctx);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return json({ ok: false, error: "Zadej hledané jméno nebo e-mail." }, 400, ctx);
    }
    const body = raw as Record<string, unknown>;
    if (Object.keys(body).some(key => key !== "query") || typeof body.query !== "string") {
      return json({ ok: false, error: "Neplatné vyhledávání členů." }, 400, ctx);
    }
    const query = body.query.trim();
    if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) {
      return json({ ok: false, error: "Zadej 2 až 80 znaků jména nebo e-mailu." }, 400, ctx);
    }
    const normalizedQuery = normalizeSearch(query);
    if (normalizedQuery.length < 2) {
      return json({ ok: false, error: "Zadej alespoň 2 znaky jména nebo e-mailu." }, 400, ctx);
    }
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    const users = (await loadContactDirectoryMembers()).filter(member => {
      const text = normalizeSearch(`${member.name} ${member.email}`);
      return terms.every(term => text.includes(term));
    }).slice(0, MAX_RESULTS).map(({ uid, name, email }) => ({ uid, name, email }));
    return json({ ok: true, users }, 200, ctx);
  } catch {
    // Directory failures may contain account data. Never expose or log them.
    return json({ ok: false, error: "Členy skupin se momentálně nepodařilo vyhledat." }, 503, ctx);
  }
}

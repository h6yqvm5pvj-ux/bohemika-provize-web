import { NextResponse, type NextRequest } from "next/server";

import { adminRoleAtLeast, resolveAdminRoleFromClaims } from "@/lib/adminAccess";
import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { isStorageNotFoundError } from "@/lib/server/contractPdfStorage";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { resolveSafeUserAttachmentServing } from "@/lib/server/safeUserAttachments";
import {
  downloadUserRequestScreenshot,
  normalizeStoredUserRequestScreenshots,
  userRequestScreenshotContentDisposition,
} from "@/lib/server/userRequestScreenshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_LIMIT = 120;
const DOWNLOAD_WINDOW_MS = 60_000;

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string =>
  normalizeText(value).toLowerCase();

const isAdmin = (
  email: string,
  decoded: Record<string, unknown> | null | undefined
): boolean =>
  adminRoleAtLeast(resolveAdminRoleFromClaims(email, decoded), "admin");

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:user-requests:attachment:get",
    limit: DOWNLOAD_LIMIT,
    windowMs: DOWNLOAD_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." },
        { status: 500 }
      ),
      ctx
    );
  }

  const requestId = normalizeText(req.nextUrl.searchParams.get("requestId"));
  const screenshotId = normalizeText(req.nextUrl.searchParams.get("screenshotId"));
  if (!requestId || !screenshotId) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Chybí identifikace žádosti nebo screenshotu." },
        { status: 400 }
      ),
      ctx
    );
  }

  const snap = await adminDb.collection("userRequests").doc(requestId).get();
  if (!snap.exists) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Žádost nebyla nalezena." }, { status: 404 }),
      ctx
    );
  }

  const row = (snap.data() ?? {}) as Record<string, unknown>;
  const requesterEmail = normalizeEmail(row.requesterEmail);
  const canRead =
    requesterEmail === ctx.email ||
    isAdmin(ctx.email, ctx.decoded as Record<string, unknown>);
  if (!canRead) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nemáš oprávnění otevřít tento screenshot." },
        { status: 403 }
      ),
      ctx
    );
  }

  const screenshot = normalizeStoredUserRequestScreenshots(row.screenshots).find(
    (item) => item.id === screenshotId
  );
  if (!screenshot) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Screenshot nebyl nalezen." }, { status: 404 }),
      ctx
    );
  }

  let bytes: Buffer;
  try {
    bytes = await downloadUserRequestScreenshot(screenshot);
  } catch (error) {
    const status = isStorageNotFoundError(error) ? 404 : 500;
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            status === 404
              ? "Screenshot nebyl nalezen."
              : "Screenshot se nepodařilo načíst.",
        },
        { status }
      ),
      ctx
    );
  }

  const serving = resolveSafeUserAttachmentServing({
    bytes,
    fileName: screenshot.originalName,
    storedContentType: screenshot.contentType,
    downloadRequested: false,
  });
  const responseHeaders = new Headers({
    "Content-Type": serving.contentType,
    "Content-Length": String(bytes.length),
    "Content-Disposition": userRequestScreenshotContentDisposition(
      screenshot.originalName,
      serving.shouldDownload
    ),
    "Cache-Control": "private, no-store, max-age=0",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  return withRateLimitHeaders(
    new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: responseHeaders,
    }),
    ctx
  );
}

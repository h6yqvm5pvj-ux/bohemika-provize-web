import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  buildContractPdfStoredFileName,
  contractPdfContentDisposition,
  deleteContractPdfAttachment,
  downloadContractPdfAttachment,
  isStorageNotFoundError,
  normalizeStoredContractPdfAttachment,
  toPublicContractPdfAttachment,
  uploadContractPdfAttachment,
  type StoredContractPdfAttachment,
} from "@/lib/server/contractPdfStorage";
import {
  CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL,
  hasContractAccess,
  requireContractsEntryGuard,
} from "../_lib/contractsApi";
import type { ContractDoc, ErrorResponse } from "../_lib/contractsApi.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_ATTACHMENT_UPLOAD_RATE_LIMIT = 20;
const CONTRACT_ATTACHMENT_DOWNLOAD_RATE_LIMIT = 120;
const CONTRACT_ATTACHMENT_RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeEntryId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const jsonError = (error: string, status: number) =>
  NextResponse.json({ ok: false, error } satisfies ErrorResponse, { status });

async function loadContractForAttachment({
  ownerEmail,
  entryId,
  viewerEmail,
  teamEmails,
}: {
  ownerEmail: string;
  entryId: string;
  viewerEmail: string;
  teamEmails: string[];
}) {
  if (!adminDb) {
    return {
      ok: false,
      response: jsonError("Server není správně nakonfigurován.", 500),
    } as const;
  }
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail) || !entryId) {
    return {
      ok: false,
      response: jsonError("Chybí ownerEmail nebo entryId.", 400),
    } as const;
  }

  const entryRef = adminDb
    .collection("users")
    .doc(ownerEmail)
    .collection("entries")
    .doc(entryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    return {
      ok: false,
      response: jsonError("Smlouva nebyla nalezena.", 404),
    } as const;
  }

  const contract = entrySnap.data() as ContractDoc;
  const canAccess = hasContractAccess({
    viewerEmail,
    teamEmails,
    ownerEmail,
    contract,
  });
  if (!canAccess) {
    return {
      ok: false,
      response: jsonError("Nemáš oprávnění pro tuto smlouvu.", 403),
    } as const;
  }

  return {
    ok: true,
    entryRef,
    contract,
  } as const;
}

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:attachment:post",
    limit: CONTRACT_ATTACHMENT_UPLOAD_RATE_LIMIT,
    windowMs: CONTRACT_ATTACHMENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;
  if (ctx.accountType === "tipster") {
    return withRateLimit(
      jsonError("Tipařské účty nemají oprávnění nahrávat PDF smluv.", 403)
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return withRateLimit(jsonError("Neplatný formát požadavku.", 400));
  }

  const fileRaw = form.get("file");
  if (!(fileRaw instanceof File)) {
    return withRateLimit(jsonError("Vyber PDF soubor smlouvy.", 400));
  }

  const ownerEmail = normalizeEmail(form.get("ownerEmail"));
  const entryId = normalizeEntryId(form.get("entryId"));
  const loaded = await loadContractForAttachment({
    ownerEmail,
    entryId,
    viewerEmail: ctx.email,
    teamEmails: ctx.contractAccessEmails,
  });
  if (!loaded.ok) return withRateLimit(loaded.response);

  const canUpload =
    ctx.email === ownerEmail ||
    (ctx.email === CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL &&
      ctx.contractAccessEmails.includes(ownerEmail));
  if (!canUpload) {
    return withRateLimit(
      jsonError("PDF smlouvy může nahrát jen vlastník smlouvy.", 403)
    );
  }

  const previousAttachment = normalizeStoredContractPdfAttachment(
    (loaded.contract as { contractPdfAttachment?: unknown }).contractPdfAttachment
  );

  let uploaded: StoredContractPdfAttachment | null = null;
  try {
    uploaded = await uploadContractPdfAttachment({
      file: fileRaw,
      ownerEmail,
      entryId,
      uploaderEmail: ctx.email,
      storedFileName: buildContractPdfStoredFileName({
        entryType: loaded.contract.entryType,
        contractNumber: loaded.contract.contractNumber,
        entryId,
      }),
    });

    await loaded.entryRef.update({
      contractPdfAttachment: uploaded,
      contractPdfAttachmentUpdatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (uploaded) {
      try {
        await deleteContractPdfAttachment(uploaded);
      } catch (cleanupErr) {
        console.warn("POST /api/contracts/attachment: cleanup po chybě selhal:", cleanupErr);
      }
    }
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "PDF se nepodařilo uložit.";
    return withRateLimit(jsonError(message, 400));
  }

  if (
    previousAttachment &&
    previousAttachment.storagePath !== uploaded.storagePath
  ) {
    try {
      await deleteContractPdfAttachment(previousAttachment);
    } catch (cleanupErr) {
      console.warn("POST /api/contracts/attachment: staré PDF se nepodařilo smazat:", cleanupErr);
    }
  }

  return withRateLimit(
    NextResponse.json({
      ok: true,
      attachment: toPublicContractPdfAttachment(uploaded),
    })
  );
}

export async function GET(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:contracts:attachment:get",
    limit: CONTRACT_ATTACHMENT_DOWNLOAD_RATE_LIMIT,
    windowMs: CONTRACT_ATTACHMENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;

  const ownerEmail = normalizeEmail(req.nextUrl.searchParams.get("ownerEmail"));
  const entryId = normalizeEntryId(req.nextUrl.searchParams.get("entryId"));
  const loaded = await loadContractForAttachment({
    ownerEmail,
    entryId,
    viewerEmail: ctx.email,
    teamEmails: ctx.contractAccessEmails,
  });
  if (!loaded.ok) return withRateLimit(loaded.response);

  const attachment = normalizeStoredContractPdfAttachment(
    (loaded.contract as { contractPdfAttachment?: unknown }).contractPdfAttachment
  );
  if (!attachment) {
    return withRateLimit(jsonError("Smlouva nemá uloženou PDF přílohu.", 404));
  }

  let bytes: Buffer;
  try {
    bytes = await downloadContractPdfAttachment(attachment);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      return withRateLimit(jsonError("PDF příloha nebyla nalezena.", 404));
    }
    console.error("GET /api/contracts/attachment selhal:", error);
    return withRateLimit(jsonError("PDF přílohu se nepodařilo načíst.", 500));
  }

  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";
  return withRateLimit(
    new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": contractPdfContentDisposition(
          attachment.originalName,
          shouldDownload
        ),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    })
  );
}

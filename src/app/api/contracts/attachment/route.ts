import { validateAutoAmendmentPdf as validateAmendmentPdf } from "@/lib/server/autoAmendmentPdf";
import { withCashflowMutation, trackCashflowWrite } from "@/lib/server/cashflowMutationTracking";
import { withContractHistory } from "@/lib/server/contractHistory";
import { fillClientCardEmailFromUploadedPdf, type ClientCardEmailImportStatus } from "@/lib/server/clientCardEmailImport";
import { fillClientCardCompanyIdFromUploadedPdf, type ClientCardCompanyIdImportStatus } from "@/lib/server/clientCardCompanyIdImport";
import { Readable } from "node:stream";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { adminDb } from "@/lib/server/firebaseAdmin";
import { adminRoleAtLeast } from "@/lib/adminAccess";
import {
  buildContractPdfStoredFileName,
  contractPdfContentDisposition,
  contractPdfNumberBindingStatus,
  contractPdfNumberFingerprint,
  createContractPdfAttachmentReadStream,
  isStorageNotFoundError,
  normalizeStoredContractPdfAttachment,
  strengthenExistingContractPdfBinding,
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
import { CONTRACT_ACCESS_FIELDS } from "../_lib/contractsApi.access";
import { isSafeContractNoteId } from "../notes/contractNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONTRACT_ATTACHMENT_UPLOAD_RATE_LIMIT = 20;
const CONTRACT_ATTACHMENT_DOWNLOAD_RATE_LIMIT = 120;
const CONTRACT_ATTACHMENT_RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_PDF_VALIDATION_ERRORS = new Set([
  "PDF soubor je prázdný.",
  "PDF je příliš velké. Maximální velikost je 12 MB.",
  "Příloha musí být PDF soubor.",
  "Příloha musí mít příponu .pdf.",
  "Soubor nevypadá jako platné PDF.",
  "Číslo smlouvy chybí nebo není platné.",
]);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeEntryId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const jsonError = (error: string, status: number) =>
  NextResponse.json({ ok: false, error } satisfies ErrorResponse, { status });

const pdfUploadFailureCode = (error: unknown): string => {
  if (!error || typeof error !== "object") return "PDF_STORAGE_WRITE_FAILED";
  const row = error as { code?: unknown; name?: unknown };
  const code = String(row.code ?? "").toLowerCase();
  if (row.name === "MailboxEncryptionConfigurationError") return "PDF_ENCRYPTION_CONFIG";
  if (["7", "403", "permission-denied", "storage/unauthorized"].includes(code)) {
    return "PDF_STORAGE_PERMISSION_DENIED";
  }
  if (["5", "404", "not-found", "storage/bucket-not-found"].includes(code)) {
    return "PDF_STORAGE_NOT_FOUND";
  }
  if (["14", "429", "500", "502", "503", "unavailable", "storage/retry-limit-exceeded"].includes(code)) {
    return "PDF_STORAGE_UNAVAILABLE";
  }
  return "PDF_STORAGE_WRITE_FAILED";
};

async function loadContractForAttachment({
  ownerEmail,
  entryId,
  viewerEmail,
  teamEmails,
  forDownload = false,
}: {
  ownerEmail: string;
  entryId: string;
  viewerEmail: string;
  teamEmails: string[];
  forDownload?: boolean;
}) {
  if (!adminDb) {
    return {
      ok: false,
      response: jsonError("Server není správně nakonfigurován.", 500),
    } as const;
  }
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail) || !isSafeContractNoteId(entryId)) {
    return {
      ok: false,
      response: jsonError("Chybí nebo je neplatný ownerEmail či entryId.", 400),
    } as const;
  }

  const entryRef = adminDb
    .collection("users")
    .doc(ownerEmail)
    .collection("entries")
    .doc(entryId);
  const entrySnap = forDownload
    ? (await adminDb.getAll(entryRef, {
        fieldMask: [...CONTRACT_ACCESS_FIELDS, "contractNumber", "contractPdfAttachment"],
      }))[0]
    : await entryRef.get();
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
    entrySnap,
    contract,
  } as const;
}

export async function POST(req: NextRequest) {
  return withCashflowMutation("app/api/contracts/attachment/route:POST", async () => {
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
  const bindExistingRaw = form.get("bindExisting");
  if (form.getAll("bindExisting").length > 1 || (bindExistingRaw != null && bindExistingRaw !== "1")) {
    return withRateLimit(jsonError("Neplatný režim ověření PDF.", 400));
  }
  const bindExisting = bindExistingRaw === "1";
  if (bindExisting && fileRaw != null) {
    return withRateLimit(jsonError("Pro ověření existujícího PDF soubor znovu neposílej.", 400));
  }
  if (!bindExisting && !(fileRaw instanceof File)) {
    return withRateLimit(jsonError("Vyber PDF soubor smlouvy.", 400));
  }
  const onlyIfMissingRaw = form.get("onlyIfMissing");
  if (form.getAll("onlyIfMissing").length > 1 || (onlyIfMissingRaw != null && onlyIfMissingRaw !== "1")) {
    return withRateLimit(jsonError("Neplatný režim nahrání PDF.", 400));
  }
  const onlyIfMissing = onlyIfMissingRaw === "1";
  if (bindExisting && onlyIfMissingRaw != null) {
    return withRateLimit(jsonError("Neplatná kombinace režimů PDF.", 400));
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
    (ctx.isImpersonating &&
      adminRoleAtLeast(ctx.impersonation?.actorRole ?? null, "admin")) ||
    (ctx.email === CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL &&
      ctx.contractAccessEmails.includes(ownerEmail));
  if (!canUpload) {
    return withRateLimit(
      jsonError("PDF smlouvy může nahrát jen vlastník smlouvy.", 403)
    );
  }

  const contractNumberFingerprint = contractPdfNumberFingerprint(loaded.contract.contractNumber);
  if (!contractNumberFingerprint) {
    return withRateLimit(jsonError("Před ověřením nebo nahráním PDF doplň platné číslo smlouvy.", 409));
  }

  // The explicit upload control may fill a missing PDF or strengthen an older
  // unbound one. A verified, usable attachment is never silently replaced.
  const existingAttachment = normalizeStoredContractPdfAttachment(loaded.contract.contractPdfAttachment);
  const existingBindingStatus = existingAttachment
    ? contractPdfNumberBindingStatus(existingAttachment, loaded.contract.contractNumber)
    : "unverified";
  if (onlyIfMissing && loaded.contract.contractPdfAttachment != null &&
    !["mismatch", "legacy"].includes(existingBindingStatus)) {
    return withRateLimit(jsonError("Smlouva už má uloženou PDF přílohu. Obnov detail smlouvy.", 409));
  }

  const previousAttachment = existingAttachment;

  if (bindExisting) {
    if (!previousAttachment) return withRateLimit(jsonError("Smlouva nemá ověřitelnou PDF přílohu.", 404));
    let strengthened: StoredContractPdfAttachment;
    try {
      strengthened = await strengthenExistingContractPdfBinding({
        attachment: previousAttachment,
        contractNumber: loaded.contract.contractNumber!,
      });
    } catch (error) {
      return withRateLimit(jsonError(
        isStorageNotFoundError(error)
          ? "Uložený PDF soubor nebyl nalezen."
          : "PDF se nepodařilo ověřit. Obnov detail a zkus to znovu.",
        isStorageNotFoundError(error) ? 404 : 409,
      ));
    }
    if (existingBindingStatus === "verified") {
      return withRateLimit(NextResponse.json({
        ok: true,
        attachment: toPublicContractPdfAttachment(strengthened, loaded.contract.contractNumber),
      }));
    }
    if (!loaded.entrySnap.updateTime) return withRateLimit(jsonError("Smlouva se mezitím změnila. Obnov detail.", 409));

    const batch = loaded.entryRef.firestore.batch();
    const patch = withContractHistory(batch, loaded.entryRef, loaded.contract, {
      contractPdfAttachment: strengthened,
      contractPdfAttachmentUpdatedAt: FieldValue.serverTimestamp(),
    }, {
      actorEmail: ctx.actorEmail,
      kind: "attachment",
      title: "Zpevněna vazba PDF",
      changes: [{ label: "Vazba PDF", before: "neověřená", after: "číslo smlouvy" }],
    });
    batch.update(loaded.entryRef, patch, {
      lastUpdateTime: loaded.entrySnap.updateTime,
    });
    try {
      await trackCashflowWrite(() => batch.commit());
    } catch {
      try {
        const current = await loadContractForAttachment({
          ownerEmail, entryId, viewerEmail: ctx.email, teamEmails: ctx.contractAccessEmails,
        });
        const saved = current.ok ? normalizeStoredContractPdfAttachment(current.contract.contractPdfAttachment) : null;
        if (saved && saved.bucketName === strengthened.bucketName && saved.storagePath === strengthened.storagePath &&
          saved.sha256 === strengthened.sha256 &&
          contractPdfNumberBindingStatus(saved, current.ok ? current.contract.contractNumber : null) === "verified") {
          strengthened = saved;
        } else {
          return withRateLimit(jsonError("Výsledek ověření PDF se nepodařilo potvrdit. Obnov detail.", 503));
        }
      } catch {
        return withRateLimit(jsonError("Výsledek ověření PDF se nepodařilo potvrdit. Obnov detail.", 503));
      }
    }
    return withRateLimit(NextResponse.json({
      ok: true,
      attachment: toPublicContractPdfAttachment(strengthened, loaded.contract.contractNumber),
    }));
  }

  if (loaded.contract.autoPremiumAmendment === true || (loaded.contract.productKey === "neon" && loaded.contract.entryType === "endorsement")) {
    try { await validateAmendmentPdf(fileRaw as File); }
    catch { return withRateLimit(jsonError("PDF nelze bezpečně přijmout. Použij platné PDF bez skriptů a vložených souborů, nejvýše 100 stran a 12 MB.", 400)); }
  }

  let uploaded: StoredContractPdfAttachment | null = null;
  try {
    uploaded = await uploadContractPdfAttachment({
      file: fileRaw as File,
      ownerEmail,
      entryId,
      contractNumber: loaded.contract.contractNumber!,
      uploaderEmail: ctx.email,
      storedFileName: buildContractPdfStoredFileName({
        entryType: loaded.contract.entryType,
        contractNumberFingerprint,
      }),
    });

    const batch = loaded.entryRef.firestore.batch();
    batch.update(loaded.entryRef, withContractHistory(batch, loaded.entryRef, loaded.contract, {
      contractPdfAttachment: uploaded,
      contractPdfAttachmentUpdatedAt: FieldValue.serverTimestamp(),
    }, { actorEmail: ctx.actorEmail, kind: "attachment", title: previousAttachment ? "Nahrazeno PDF smlouvy" : "Nahráno PDF smlouvy",
      changes: [{ label: "Soubor", before: previousAttachment?.originalName ?? null, after: uploaded.originalName }] }), { lastUpdateTime: loaded.entrySnap.updateTime! });
    const prepared = uploaded;
    await trackCashflowWrite(async () => {
      try {
        await batch.commit();
      } catch (error) {
        // A transport failure does not prove the atomic write was rejected.
        // Confirm through the same per-record authorization boundary before
        // reporting success to either the caller or the mutation tracker.
        try {
          const current = await loadContractForAttachment({
            ownerEmail, entryId, viewerEmail: ctx.email, teamEmails: ctx.contractAccessEmails,
          });
          const saved = current.ok ? normalizeStoredContractPdfAttachment(current.contract.contractPdfAttachment) : null;
          if (saved && saved.bucketName === prepared.bucketName && saved.storagePath === prepared.storagePath &&
            saved.sha256 === prepared.sha256 && saved.contractNumberFingerprint === contractNumberFingerprint &&
            contractPdfNumberBindingStatus(saved, current.ok ? current.contract.contractNumber : null) === "verified") {
            uploaded = saved;
            return;
          }
        } catch {
          // Preserve the encrypted object when the result cannot be established.
        }
        throw error;
      }
    });
  } catch (error) {
    // Firestore and Storage cannot commit together. Never destroy a prepared
    // PDF here: it may already be referenced, including after a transfer.
    if (uploaded) {
      const conflict = error && typeof error === "object" && "code" in error && [5, 9, 10].includes(Number(error.code));
      return withRateLimit(jsonError(conflict
        ? "Smlouva se mezitím změnila. Obnov detail před dalším nahráním."
        : "Uložení PDF se nepodařilo spolehlivě potvrdit. Obnov detail před dalším nahráním.", conflict ? 409 : 503));
    }
    const message = error instanceof Error && PUBLIC_PDF_VALIDATION_ERRORS.has(error.message)
      ? error.message : "PDF se nepodařilo uložit. Zkus nahrání znovu.";
    if (message !== "PDF se nepodařilo uložit. Zkus nahrání znovu.") {
      return withRateLimit(jsonError(message, 400));
    }
    const failureCode = pdfUploadFailureCode(error);
    // Keep provider messages, object paths, and customer data out of logs.
    console.error("Contract PDF upload failed.", { failureCode });
    return withRateLimit(jsonError(
      `PDF se nepodařilo uložit. Kód chyby: ${failureCode}. Zkus nahrání znovu.`,
      503,
    ));
  }

  if (!uploaded) return withRateLimit(jsonError("Uložení PDF se nepodařilo potvrdit. Obnov detail smlouvy.", 503));

  // Keep superseded encrypted files for a separate, verified cleanup. Immediate
  // deletion could invalidate a reference retained by another contract record.

  let clientCardEmail: ClientCardEmailImportStatus | "unavailable" = "skipped";
  if (["cppAuto", "domexneuron"].includes(loaded.contract.productKey ?? "") && ctx.email === ownerEmail && !ctx.isImpersonating) {
    try {
      clientCardEmail = await fillClientCardEmailFromUploadedPdf(loaded.entryRef.firestore, { email: ctx.email, uid: ctx.uid }, entryId, uploaded.sha256);
    } catch {
      // The PDF is already saved. Contact enrichment must not turn a completed
      // upload into an error or expose PDF contents through an error message.
      clientCardEmail = "unavailable";
    }
  }

  let clientCardCompanyId: ClientCardCompanyIdImportStatus | "unavailable" | undefined;
  if (["cppPPRbez", "cppPPRs"].includes(loaded.contract.productKey ?? "") && !loaded.contract.autoPremiumAmendment &&
    ctx.email === ownerEmail && !ctx.isImpersonating) {
    try {
      clientCardCompanyId = await fillClientCardCompanyIdFromUploadedPdf(loaded.entryRef.firestore, { email: ctx.email, uid: ctx.uid }, entryId, uploaded.sha256);
    } catch {
      clientCardCompanyId = "unavailable";
    }
  }

  return withRateLimit(
    NextResponse.json({
      ok: true,
      attachment: toPublicContractPdfAttachment(uploaded, loaded.contract.contractNumber),
      clientCardEmail,
      ...(clientCardCompanyId ? { clientCardCompanyId } : {}),
    })
  );
  });
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
    forDownload: true,
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
  if (contractPdfNumberBindingStatus(attachment, loaded.contract.contractNumber) === "mismatch") {
    return withRateLimit(jsonError("PDF neodpovídá aktuálnímu číslu smlouvy. Nahraj správný soubor.", 409));
  }

  let download: Awaited<ReturnType<typeof createContractPdfAttachmentReadStream>>;
  try {
    download = await createContractPdfAttachmentReadStream(attachment);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      return withRateLimit(jsonError("PDF příloha nebyla nalezena.", 404));
    }
    console.error("GET /api/contracts/attachment selhal.");
    return withRateLimit(jsonError("PDF přílohu se nepodařilo načíst.", 500));
  }

  download.stream.once("error", () => {
    console.error("GET /api/contracts/attachment: stream PDF selhal.");
  });
  const responseStream = Readable.toWeb(download.stream) as ReadableStream<Uint8Array>;

  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";
  return withRateLimit(
    new NextResponse(responseStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
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

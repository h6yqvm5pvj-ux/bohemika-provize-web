import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getStorage } from "firebase-admin/storage";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { resolveSafeUserAttachmentServing } from "@/lib/server/safeUserAttachments";
import {
  loadStoredToolDocument,
  storageBucketCandidates,
} from "@/lib/server/toolDocuments";

export const runtime = "nodejs";

const DOCUMENT_RATE_LIMIT = 120;
const DOCUMENT_RATE_LIMIT_WINDOW_MS = 60_000;

type DocumentMeta = {
  fileName: string;
  contentType: string;
  localPath?: string;
};

type ResolvedDocumentFile = DocumentMeta & {
  bytes: Buffer;
};

const DOCUMENTS: Record<string, DocumentMeta> = {
  "cpp-storno-dohodou": {
    fileName: "zpneonstornodohodou.pdf",
    contentType: "application/pdf",
  },
  "cpp-vypoved-zp": {
    fileName: "Výpověď_PS_ŽP_062023.pdf",
    contentType: "application/pdf",
  },
  "cpp-vypoved-zp-zadanky": {
    fileName: "ŽP DOKUMENTY Žádanky Výpověď_PS_ŽP_062023.pdf",
    contentType: "application/pdf",
  },
  "generali-nezivot": {
    fileName: "generalinezivot.pdf",
    contentType: "application/pdf",
  },
  "koop-vypoved": {
    fileName: "koopvypoved.pdf",
    contentType: "application/pdf",
  },
  "max-denni-cpp": {
    fileName: "maxdenni.jpg",
    contentType: "image/jpeg",
  },
  "koop-prijem": {
    fileName: "koopprijem.jpg",
    contentType: "image/jpeg",
  },
  "metlife-vypoved": {
    fileName: "metlifevypoved.pdf",
    contentType: "application/pdf",
  },
  "metlife-zivot": {
    fileName: "metlifezivot.pdf",
    contentType: "application/pdf",
  },
  "metlife-oneguard-conditions-2024": {
    fileName: "2024_09_OneGuard_Pojistne_podminky_PR059_PP_OGR0924.pdf",
    contentType: "application/pdf",
  },
  "cpp-neon-conditions-2026": {
    fileName: "cpp-neon-04-2026.pdf",
    contentType: "application/pdf",
  },
  "cpp-travel-vppcp": {
    fileName: "VPPCP.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/VPPCP.pdf",
  },
  "cpp-travel-dppap": {
    fileName: "DPPAP.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPAP.pdf",
  },
  "cpp-travel-dppcov-1-23": {
    fileName: "DPPCOV_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPCOV_1_23.pdf",
  },
  "cpp-travel-dppcp-2022-06": {
    fileName: "DPPCP_2022_06.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPCP_2022_06.pdf",
  },
  "cpp-travel-dppgp-2022-06": {
    fileName: "DPPGP_2022_06.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPGP_2022_06.pdf",
  },
  "cpp-travel-dppgup": {
    fileName: "DPPGUP.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPGUP.pdf",
  },
  "cpp-travel-dppletp": {
    fileName: "DPPLETP.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPLETP.pdf",
  },
  "cpp-travel-dpplp-1-23": {
    fileName: "DPPLP_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPLP_1_23.pdf",
  },
  "cpp-travel-dpplv-1-23": {
    fileName: "DPPLV_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPLV_1_23.pdf",
  },
  "cpp-travel-dppodc": {
    fileName: "DPPODC.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPODC.pdf",
  },
  "cpp-travel-dppstp-1-23": {
    fileName: "DPPSTP_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPSTP_1_23.pdf",
  },
  "cpp-travel-dppurc-1-23": {
    fileName: "DPPURC_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPURC_1_23.pdf",
  },
  "cpp-travel-dppzav-2022-06": {
    fileName: "DPPZAV_2022_06.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPZAV_2022_06.pdf",
  },
  "cpp-travel-dppzp-1-23": {
    fileName: "DPPZP_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPZP_1_23.pdf",
  },
  "cpp-travel-dppzvp": {
    fileName: "DPPZVP.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/DPPZVP.pdf",
  },
  "cpp-travel-ipid-1-cp-cp2-2023": {
    fileName: "IPID_Cestovni_pojisteni_CPP_1_23.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/cpp/IPID_Cestovni_pojisteni_CPP_1_23.pdf",
  },
  "koop-travel-kolumbus-m750-23": {
    fileName: "koopkolumbus.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/kooperativa/koopkolumbus.pdf",
  },
  "koop-travel-ipid-07-2023": {
    fileName: "IPID_Kolumbus_07_2023.pdf",
    contentType: "application/pdf",
    localPath: "cestovni-pojisteni/kooperativa/IPID_Kolumbus_07_2023.pdf",
  },
  "nn-zivot-vypoved": {
    fileName: "nnvypoved.pdf",
    contentType: "application/pdf",
  },
  "maxima-nezivot-vypoved": {
    fileName: "maximavypoved.pdf",
    contentType: "application/pdf",
  },
};

const normalizeDocumentId = (value: string | null): string =>
  (value ?? "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isStorageNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: number | string;
    statusCode?: number;
    message?: string;
  };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("no such object") || message.includes("not found");
};

async function downloadStorageFile({
  path,
  bucketName,
}: {
  path: string;
  bucketName?: string | null;
}): Promise<Buffer | null> {
  let lastError: unknown = null;
  for (const candidate of storageBucketCandidates(bucketName)) {
    try {
      const [downloaded] = await getStorage().bucket(candidate).file(path).download();
      return downloaded;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) break;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

function contentDisposition(fileName: string, shouldDownload: boolean): string {
  const fallback = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "document";
  return `${shouldDownload ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    fileName
  )}`;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:documents:file:get",
    limit: DOCUMENT_RATE_LIMIT,
    windowMs: DOCUMENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  const id = normalizeDocumentId(req.nextUrl.searchParams.get("id"));

  const managed = await loadStoredToolDocument(id);
  if (managed.stored?.disabled === true) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Dokument nebyl nalezen." },
        { status: 404 }
      ),
      guard.ctx
    );
  }

  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";
  let resolved: ResolvedDocumentFile | null = null;

  const storedPath = normalizeText(managed.stored?.storagePath);
  if (managed.publicDoc && storedPath) {
    let bytes: Buffer | null = null;
    try {
      bytes = await downloadStorageFile({
        path: storedPath,
        bucketName: normalizeText(managed.stored?.bucketName),
      });
    } catch {
      bytes = null;
    }

    if (!bytes) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Soubor nebyl nalezen." },
          { status: 404 }
        ),
        guard.ctx
      );
    }

    resolved = {
      bytes,
      fileName: managed.publicDoc.fileName,
      contentType: managed.publicDoc.contentType,
    };
  } else {
    const meta = managed.publicDoc
      ? {
          fileName: managed.publicDoc.fileName,
          contentType: managed.publicDoc.contentType,
        }
      : DOCUMENTS[id];

    if (!meta) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Dokument nebyl nalezen." },
          { status: 404 }
        ),
        guard.ctx
      );
    }

    const filePath = join(
      process.cwd(),
      "private",
      "dokumenty",
      meta.localPath ?? meta.fileName
    );

    try {
      resolved = {
        fileName: meta.fileName,
        contentType: meta.contentType,
        bytes: await readFile(filePath),
      };
    } catch {
      resolved = null;
    }
  }

  if (!resolved) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Soubor nebyl nalezen." },
        { status: 404 }
      ),
      guard.ctx
    );
  }

  const serving = resolveSafeUserAttachmentServing({
    bytes: resolved.bytes,
    fileName: resolved.fileName,
    storedContentType: resolved.contentType,
    downloadRequested: shouldDownload,
  });

  const responseHeaders = new Headers({
    "Content-Type": serving.contentType,
    "Content-Length": String(resolved.bytes.length),
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Disposition": contentDisposition(resolved.fileName, serving.shouldDownload),
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  if (serving.contentSecurityPolicy) {
    responseHeaders.set("Content-Security-Policy", serving.contentSecurityPolicy);
  }

  return withRateLimitHeaders(
    new NextResponse(new Uint8Array(resolved.bytes), {
      status: 200,
      headers: responseHeaders,
    }),
    guard.ctx
  );
}

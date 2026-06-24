import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CONNECT_SRC = [
  "'self'",
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.gstatic.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://query1.finance.yahoo.com",
  "https://api.frankfurter.app",
  "https://stooq.com",
  "https://stooq.pl",
  "https://prices.lbma.org.uk",
  "https://data-asg.goldprice.org",
  "https://api.gold-api.com",
  "https://cdn.jsdelivr.net",
  "https://wsextra.cpp.cz",
  "https://europe-central2-bohemikasmlouvy.cloudfunctions.net",
].join(" ");

const FRAME_SRC = [
  "'self'",
  "https://*.firebaseapp.com",
  "https://*.web.app",
].join(" ");

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function maybeAddReportUri(directives: string[]): string[] {
  const reportUri = process.env.CSP_REPORT_URI?.trim();
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }
  return directives;
}

function normalizeFrameAncestorList(value: string): string {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" ");
}

function getMeetingEmbedFrameAncestors(): string {
  const configured = normalizeFrameAncestorList(
    process.env.MEETING_EMBED_FRAME_ANCESTORS ?? ""
  );
  return configured ? `'self' ${configured}` : "'self' *";
}

function buildBaselineCsp(frameAncestors = "'none'"): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(process.env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return maybeAddReportUri([
    "default-src 'self'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "form-action 'self'",
    `frame-src ${FRAME_SRC}`,
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    `script-src ${scriptSrc}`,
    `connect-src ${CONNECT_SRC}`,
    "upgrade-insecure-requests",
  ]).join("; ");
}

function buildStrictNonceCsp(
  nonce: string,
  frameAncestors = "'none'"
): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(process.env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return maybeAddReportUri([
    "default-src 'self'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "form-action 'self'",
    `frame-src ${FRAME_SRC}`,
    "worker-src 'self' blob:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    `script-src ${scriptSrc}`,
    "script-src-attr 'none'",
    `connect-src ${CONNECT_SRC}`,
    "upgrade-insecure-requests",
  ]).join("; ");
}

function isPrivateWorkspacePath(pathname: string): boolean {
  return pathname === "/provizni-vypisy" || pathname.startsWith("/klienti");
}

function isClientCardsPath(pathname: string): boolean {
  return pathname === "/klienti" || pathname.startsWith("/klienti/");
}

function isClientCardsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_CLIENTS_PAGE === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_CLIENTS_PAGE === "1"
  );
}

export function middleware(req: NextRequest) {
  const nonce = createNonce();
  const pathname = req.nextUrl.pathname.toLowerCase();
  if (isClientCardsPath(pathname) && !isClientCardsEnabled()) {
    return new NextResponse("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  if (pathname.startsWith("/dokumenty/")) {
    return new NextResponse("Not found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      },
    });
  }

  const isMeetingEmbed = pathname.startsWith("/embed/schuzka/");
  const frameAncestors = isMeetingEmbed ? getMeetingEmbedFrameAncestors() : "'none'";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const strictCsp = buildStrictNonceCsp(nonce, frameAncestors);
  if (isMeetingEmbed) {
    res.headers.delete("X-Frame-Options");
    res.headers.set("Cross-Origin-Opener-Policy", "unsafe-none");
    res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  } else {
    res.headers.set("X-Frame-Options", "DENY");
  }

  if (process.env.CSP_STRICT_ENFORCE === "1") {
    res.headers.set("Content-Security-Policy", strictCsp);
  } else {
    res.headers.set("Content-Security-Policy", buildBaselineCsp(frameAncestors));
    res.headers.set("Content-Security-Policy-Report-Only", strictCsp);
  }

  if (isPrivateWorkspacePath(pathname)) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    res.headers.set("Vary", "Authorization, Cookie");
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

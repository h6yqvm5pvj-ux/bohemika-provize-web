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

function buildBaselineCsp(frameAncestors: "'none'" | "'self'" = "'none'"): string {
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
  frameAncestors: "'none'" | "'self'" = "'none'"
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

export function middleware(req: NextRequest) {
  const nonce = createNonce();
  const pathname = req.nextUrl.pathname.toLowerCase();
  const isPdfDocumentPreview =
    pathname.startsWith("/dokumenty/") && pathname.endsWith(".pdf");
  const frameAncestors = isPdfDocumentPreview ? "'self'" : "'none'";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const strictCsp = buildStrictNonceCsp(nonce, frameAncestors);
  res.headers.set("X-Frame-Options", isPdfDocumentPreview ? "SAMEORIGIN" : "DENY");

  if (process.env.CSP_STRICT_ENFORCE === "1") {
    res.headers.set("Content-Security-Policy", strictCsp);
  } else {
    res.headers.set("Content-Security-Policy", buildBaselineCsp(frameAncestors));
    res.headers.set("Content-Security-Policy-Report-Only", strictCsp);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

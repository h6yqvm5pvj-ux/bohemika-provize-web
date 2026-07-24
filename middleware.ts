import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  APP_SESSION_COOKIE_NAME,
  verifyAppSessionCookieValue,
} from "@/lib/appSession";

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

function isServerProtectedPagePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/cashflow") ||
    pathname.startsWith("/cuzk") ||
    pathname.startsWith("/intranet") ||
    pathname.startsWith("/kalkulacka") ||
    pathname.startsWith("/klienti") ||
    pathname.startsWith("/muj-tym") ||
    pathname.startsWith("/nastaveni") ||
    pathname.startsWith("/pomucky") ||
    pathname.startsWith("/posta") ||
    pathname.startsWith("/provizni-vypisy") ||
    pathname.startsWith("/smlouvy") ||
    pathname.startsWith("/tipy")
  );
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

function privateNotFoundResponse(): NextResponse {
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

function clearAppSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

async function buildAuthRedirectResponse(
  req: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  if (!isServerProtectedPagePath(pathname)) return null;

  const verification = await verifyAppSessionCookieValue(
    req.cookies.get(APP_SESSION_COOKIE_NAME)?.value
  );
  if (verification.ok) return null;

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";

  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (nextPath && nextPath !== "/" && !nextPath.startsWith("/login")) {
    loginUrl.searchParams.set("next", nextPath);
  }

  const response = NextResponse.redirect(loginUrl);
  if (verification.reason !== "missing") {
    clearAppSessionCookie(response);
  }
  return response;
}

export async function middleware(req: NextRequest) {
  const nonce = createNonce();
  const pathname = req.nextUrl.pathname.toLowerCase();
  if (isClientCardsPath(pathname) && !isClientCardsEnabled()) {
    return privateNotFoundResponse();
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
  const isContractDetailEmbed =
    pathname.startsWith("/smlouvy/") && req.nextUrl.searchParams.get("embedded") === "1";
  const frameAncestors = isMeetingEmbed
    ? getMeetingEmbedFrameAncestors()
    : isContractDetailEmbed
      ? "'self'"
      : "'none'";
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const authRedirect = await buildAuthRedirectResponse(req, pathname);
  const res =
    authRedirect ??
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  const strictCsp = buildStrictNonceCsp(nonce, frameAncestors);
  if (isMeetingEmbed) {
    res.headers.delete("X-Frame-Options");
    res.headers.set("Cross-Origin-Opener-Policy", "unsafe-none");
    res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  } else if (isContractDetailEmbed) {
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
  } else {
    res.headers.set("X-Frame-Options", "DENY");
  }

  if (process.env.CSP_STRICT_ENFORCE === "1") {
    res.headers.set("Content-Security-Policy", strictCsp);
  } else {
    res.headers.set("Content-Security-Policy", buildBaselineCsp(frameAncestors));
    res.headers.set("Content-Security-Policy-Report-Only", strictCsp);
  }

  if (isServerProtectedPagePath(pathname) || isPrivateWorkspacePath(pathname)) {
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

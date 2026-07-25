import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { markExpiredPolicyEndContractsDozita } from "@/lib/server/contractLifecycleMaintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const expectedSecret = (process.env.CRON_SECRET ?? "").trim();

  if (!expectedSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return false;

  const received = authHeader.slice(7).trim();
  return Boolean(received && timingSafeStringEquals(received, expectedSecret));
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const result = await markExpiredPolicyEndContractsDozita({
      write: !dryRun,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Contract lifecycle cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se aktualizovat stavy smluv." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

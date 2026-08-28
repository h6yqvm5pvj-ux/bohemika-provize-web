import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { markExpiredPolicyEndContractsDozita } from "@/lib/server/contractLifecycleMaintenance";
import { processScheduledContractTransfers } from "@/app/api/contracts/_lib/contractsApi";

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
    const [lifecycle, contractTransfers] = await Promise.all([
      markExpiredPolicyEndContractsDozita({ write: !dryRun }),
      processScheduledContractTransfers({ write: !dryRun }),
    ]);
    return NextResponse.json({ ...lifecycle, contractTransfers });
  } catch (error) {
    console.error("Contract lifecycle cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se provést údržbu smluv." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

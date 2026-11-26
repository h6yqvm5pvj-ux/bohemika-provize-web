import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { runContractNoteReminders } from "@/lib/server/contractNoteReminders";
import { runClientNoteReminders } from "@/lib/server/clientNoteReminders";
import { runLifeCommissionReminders } from "@/lib/server/lifeCommissionReminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timingSafeStringEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

const isAuthorizedCronRequest = (req: NextRequest): boolean => {
  const expectedSecret = (process.env.CRON_SECRET ?? "").trim();
  if (!expectedSecret) return process.env.NODE_ENV !== "production";
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return false;
  const received = authorization.slice(7).trim();
  return Boolean(received && timingSafeStringEquals(received, expectedSecret));
};

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }
  try {
    const [contracts, clients, lifeCommissions] = await Promise.allSettled([
      runContractNoteReminders(req), runClientNoteReminders(),
      process.env.CRON_SECRET?.trim() ? runLifeCommissionReminders() : Promise.resolve(null),
    ]);
    if (contracts.status === "rejected" || clients.status === "rejected" || lifeCommissions.status === "rejected") {
      return NextResponse.json({ ok: false, error: "Některé připomínky se nepodařilo zpracovat." }, { status: 500 });
    }
    const failed = (lifeCommissions.value?.failed ?? 0) > 0;
    return NextResponse.json({ ...contracts.value, ok: !failed, clientNotes: clients.value,
      ...(lifeCommissions.value ? { lifeCommissions: lifeCommissions.value } : {}),
    }, { status: failed ? 500 : 200 });
  } catch (error) {
    console.error("Contract note reminders cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se zpracovat připomínky ke smlouvám." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

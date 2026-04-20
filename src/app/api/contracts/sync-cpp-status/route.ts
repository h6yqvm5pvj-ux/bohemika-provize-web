import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  void req;
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "cpp-sync-disabled",
  });
}

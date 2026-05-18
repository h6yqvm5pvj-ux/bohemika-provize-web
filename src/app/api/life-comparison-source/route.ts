import { NextResponse } from "next/server";

import { resolveLifeComparisonSourcePayload } from "@/lib/server/lifeComparisonSource";

export function GET() {
  return NextResponse.json(resolveLifeComparisonSourcePayload());
}

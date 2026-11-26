import type { NextRequest } from "next/server";

import { handleContractDetail } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractDetail(req);
}

export async function POST(req: NextRequest) {
  return handleContractDetail(req);
}

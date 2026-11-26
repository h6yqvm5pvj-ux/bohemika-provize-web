import type { NextRequest } from "next/server";

import { handleContractsList } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsList(req);
}

export async function POST(req: NextRequest) {
  return handleContractsList(req);
}

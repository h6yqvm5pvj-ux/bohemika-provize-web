import type { NextRequest } from "next/server";

import { handleContractsFind, handleContractsFindBulk } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsFind(req);
}

export async function POST(req: NextRequest) {
  return handleContractsFindBulk(req);
}

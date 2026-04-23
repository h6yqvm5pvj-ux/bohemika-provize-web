import type { NextRequest } from "next/server";

import { handleContractsFind } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsFind(req);
}

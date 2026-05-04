import type { NextRequest } from "next/server";

import { handleContractsPrecheck } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsPrecheck(req);
}

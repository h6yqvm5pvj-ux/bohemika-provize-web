import type { NextRequest } from "next/server";

import { handleContractsList } from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsList(req);
}

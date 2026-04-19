import type { NextRequest } from "next/server";

import { handleContractsSyncCppStatus } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsSyncCppStatus(req);
}

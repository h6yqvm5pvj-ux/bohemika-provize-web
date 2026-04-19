import type { NextRequest } from "next/server";

import { handleContractsSyncEntryIndex } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsSyncEntryIndex(req);
}

import type { NextRequest } from "next/server";

import { handleContractsSetPaid } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsSetPaid(req);
}

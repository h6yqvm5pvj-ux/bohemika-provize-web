import type { NextRequest } from "next/server";

import { handleContractsReplacementStorno } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsReplacementStorno(req);
}

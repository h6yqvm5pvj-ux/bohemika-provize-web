import type { NextRequest } from "next/server";

import { handleContractsRefreshNeonStorno } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsRefreshNeonStorno(req);
}

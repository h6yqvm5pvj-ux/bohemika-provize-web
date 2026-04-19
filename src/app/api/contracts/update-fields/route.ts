import type { NextRequest } from "next/server";

import { handleContractsUpdateFields } from "../_lib/contractsApi";

export async function PATCH(req: NextRequest) {
  return handleContractsUpdateFields(req);
}

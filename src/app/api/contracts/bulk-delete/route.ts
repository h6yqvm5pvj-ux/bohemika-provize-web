import type { NextRequest } from "next/server";

import { handleContractsDelete } from "../_lib/contractsApi";

export async function DELETE(req: NextRequest) {
  return handleContractsDelete(req);
}

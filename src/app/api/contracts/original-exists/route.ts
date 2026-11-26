import type { NextRequest } from "next/server";

import { handleOriginalContractExists } from "../_lib/contractsApi";

export async function POST(req: NextRequest) {
  return handleOriginalContractExists(req);
}

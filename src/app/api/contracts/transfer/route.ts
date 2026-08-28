import type { NextRequest } from "next/server";

import {
  handleContractsTransfer,
  handleContractTransferRequestsGet,
} from "../_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractTransferRequestsGet(req);
}

export async function PATCH(req: NextRequest) {
  return handleContractsTransfer(req);
}

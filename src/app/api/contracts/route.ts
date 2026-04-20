import type { NextRequest } from "next/server";

import {
  handleContractsCreate,
  handleContractsDelete,
  handleContractsGet,
  handleContractsPatch,
} from "./_lib/contractsApi";

export async function GET(req: NextRequest) {
  return handleContractsGet(req);
}

export async function PATCH(req: NextRequest) {
  return handleContractsPatch(req);
}

export async function POST(req: NextRequest) {
  return handleContractsCreate(req);
}

export async function DELETE(req: NextRequest) {
  return handleContractsDelete(req);
}

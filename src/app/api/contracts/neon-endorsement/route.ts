import type { NextRequest } from "next/server";
import { handleContractsCreate } from "../_lib/contractsApi";

export function POST(request: NextRequest) {
  return handleContractsCreate(request, "neon-endorsement");
}

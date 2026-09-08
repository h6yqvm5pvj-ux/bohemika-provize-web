"use client";

import { StatementProgressPanel } from "./StatementProgressPanel";
import type { ContractMatchStats } from "./statementTypes";

export function StatementPairingLoader({ stats, hasUser }: { stats: ContractMatchStats; hasUser: boolean }) {
  return <StatementProgressPanel mode="pairing" stats={stats} hasUser={hasUser} />;
}

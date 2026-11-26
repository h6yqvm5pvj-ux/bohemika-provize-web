import { positionLabel } from "@/app/lib/formatters";
import type { Position } from "@/app/types/domain";
import { statementCareerPositionFromValue } from "./statementSystemContracts";
import styles from "./statementContractDetail.module.css";

export function StatementPositionCells({ systemPosition, career }: {
  systemPosition?: Position | null;
  career?: string | null;
}) {
  const statementPosition = statementCareerPositionFromValue(career)?.position;
  const mismatch = Boolean(systemPosition && statementPosition && systemPosition !== statementPosition);
  return (
    <>
      <td className={styles.positionCell}>{positionLabel(systemPosition)}</td>
      <td className={styles.positionCell}>
        {statementPosition ? positionLabel(statementPosition) : career?.trim() || "—"}
        {mismatch && <div><span className={styles.badge} data-tone="error">Nesoulad</span></div>}
      </td>
    </>
  );
}

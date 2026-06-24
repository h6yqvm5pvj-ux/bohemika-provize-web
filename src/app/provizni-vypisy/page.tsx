import { notFound } from "next/navigation";

import CommissionStatementsPage from "../_provizni-vypisy/page";
import { COMMISSION_STATEMENTS_ENABLED } from "../_provizni-vypisy/statementFeature";

export const dynamic = "force-dynamic";

export default function CommissionStatementsRoute() {
  if (!COMMISSION_STATEMENTS_ENABLED) notFound();
  return <CommissionStatementsPage />;
}

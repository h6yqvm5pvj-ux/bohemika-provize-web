"use client";

import { BriefcaseBusiness } from "lucide-react";
import { InsuranceDetailHeading } from "@/components/insurance/InsuranceDetailHeading";
import detailStyles from "@/components/insurance/insuranceDetail.module.css";
import type { KoopOdzamDetail } from "@/app/lib/parseKoopOdzamPdf";
import { KoopOdzamCoverageRows } from "@/components/insurance/KoopOdzamCoverageRows";

export function KoopOdzamDetailPanel({ detail }: { detail: KoopOdzamDetail | null }) {
  if (!detail || !Object.values(detail).some((value) => value != null)) return null;

  return (
    <section
      className={detailStyles.card}
      data-detail-tone="emerald"
      aria-label="PDF do detailu smlouvy: odpovědnost zaměstnance"
    >
      <InsuranceDetailHeading icon={BriefcaseBusiness}>Odpovědnost zaměstnance</InsuranceDetailHeading>
      <KoopOdzamCoverageRows detail={detail} />
    </section>
  );
}

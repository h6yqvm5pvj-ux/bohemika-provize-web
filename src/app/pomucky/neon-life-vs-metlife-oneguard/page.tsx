import { AppLayout } from "@/components/AppLayout";
import { COMPARISON_ROWS } from "./comparisonData";
import { LifeInsuranceComparison } from "./LifeInsuranceComparison";

export default function NeonLifeVsMetLifeOneGuardPage() {
  return (
    <AppLayout active="tools">
      <LifeInsuranceComparison rows={COMPARISON_ROWS} />
    </AppLayout>
  );
}

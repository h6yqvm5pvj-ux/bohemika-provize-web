import type { CalculatorPdfFormValues, PdfFormMappingResult } from "./calculatorPdfFormTypes";
import type { ParsedContractPdf } from "./calculatorPdfImport";
import type { Product } from "../types/domain";
import type { NeonPdfEditorTextField, NeonPdfEditorBooleanField } from "./CalculatorNeonPdfDetailEditor";
import { createEmptyNeonPdfDetailFields } from "./neonPdfDetailFields";

export function mapNeonPdfFormValues(importProduct: Product, parsed: ParsedContractPdf): PdfFormMappingResult {
  const values: Partial<CalculatorPdfFormValues> = {};
  let applied = 0;
  if (importProduct === "neon" && parsed.riskFields && typeof parsed.riskFields === "object") {
    const riskFields = parsed.riskFields as Record<string, unknown>;
    const nextNeonFields = createEmptyNeonPdfDetailFields();
    let riskApplied = 0;
    const applyText = (field: NeonPdfEditorTextField, value: unknown) => {
      if (value == null)
        return;
      const normalized = typeof value === "string" ? value.trim() : String(value).trim();
      if (!normalized)
        return;
      nextNeonFields[field] = normalized;
      riskApplied += 1;
    };
    const applyBoolean = (field: NeonPdfEditorBooleanField, value: unknown) => {
      nextNeonFields[field] = value === true;
      if (value === true)
        riskApplied += 1;
    };
    applyText("version", riskFields.version ?? "neon_life");
    applyText("deathType", riskFields.deathType);
    applyText("deathAmount", riskFields.deathAmount);
    applyText("death2Type", riskFields.death2Type);
    applyText("death2Amount", riskFields.death2Amount);
    applyText("deathTerminalAmount", riskFields.deathTerminalAmount);
    applyBoolean("waiverInvalidity", riskFields.waiverInvalidity);
    applyBoolean("waiverUnemployment", riskFields.waiverUnemployment);
    applyText("invalidityAType", riskFields.invalidityAType);
    applyText("invalidityA1", riskFields.invalidityA1);
    applyText("invalidityA2", riskFields.invalidityA2);
    applyText("invalidityA3", riskFields.invalidityA3);
    applyText("invalidityBType", riskFields.invalidityBType);
    applyText("invalidityB1", riskFields.invalidityB1);
    applyText("invalidityB2", riskFields.invalidityB2);
    applyText("invalidityB3", riskFields.invalidityB3);
    applyBoolean("invalidityPension", riskFields.invalidityPension);
    applyText("criticalType", riskFields.criticalType);
    applyText("criticalVariant", riskFields.criticalVariant);
    applyText("criticalAmount", riskFields.criticalAmount);
    applyText("childSurgeryAmount", riskFields.childSurgeryAmount);
    applyText("vaccinationCompAmount", riskFields.vaccinationCompAmount);
    applyText("diabetesAmount", riskFields.diabetesAmount);
    applyText("deathAccidentAmount", riskFields.deathAccidentAmount);
    applyText("injuryPermanentAmount", riskFields.injuryPermanentAmount);
    applyText("injuryPermanentFulfillmentFrom", riskFields.injuryPermanentFulfillmentFrom);
    applyText("injuryPermanentProgression", riskFields.injuryPermanentProgression);
    applyText("injuryPermanent2Amount", riskFields.injuryPermanent2Amount);
    applyText("injuryPermanent2FulfillmentFrom", riskFields.injuryPermanent2FulfillmentFrom);
    applyText("injuryPermanent2Progression", riskFields.injuryPermanent2Progression);
    applyText("hospitalizationIllnessAmount", riskFields.hospitalizationIllnessAmount);
    applyText("hospitalizationInjuryAmount", riskFields.hospitalizationInjuryAmount);
    applyText("accidentDailyBenefitStart", riskFields.accidentDailyBenefitStart);
    applyText("accidentDailyBenefitBackpay", riskFields.accidentDailyBenefitBackpay);
    applyText("accidentDailyBenefit", riskFields.accidentDailyBenefit);
    applyText("workIncapacityStart", riskFields.workIncapacityStart);
    applyText("workIncapacityBackpay", riskFields.workIncapacityBackpay);
    applyText("workIncapacityAmount", riskFields.workIncapacityAmount);
    applyBoolean("workIncapacityInjury", riskFields.workIncapacityInjury);
    applyBoolean("workIncapacityIllness", riskFields.workIncapacityIllness);
    applyText("workIncapacity2Start", riskFields.workIncapacity2Start);
    applyText("workIncapacity2Backpay", riskFields.workIncapacity2Backpay);
    applyText("workIncapacity2Amount", riskFields.workIncapacity2Amount);
    applyBoolean("workIncapacity2Injury", riskFields.workIncapacity2Injury);
    applyBoolean("workIncapacity2Illness", riskFields.workIncapacity2Illness);
    applyText("careDependencyAmount", riskFields.careDependencyAmount);
    applyText("specialAidAmount", riskFields.specialAidAmount);
    applyText("caregivingAmount", riskFields.caregivingAmount);
    applyText("reproductionCostAmount", riskFields.reproductionCostAmount);
    applyBoolean("cppHelp", riskFields.cppHelp);
    applyText("liabilityCitizenLimit", riskFields.liabilityCitizenLimit);
    applyText("liabilityEmployeeLimit", riskFields.liabilityEmployeeLimit);
    applyBoolean("travelInsurance", riskFields.travelInsurance);
    values.neonPdfDetailFields = nextNeonFields;
    applied += riskApplied;
  }

  return { values, applied };
}

import type { CalculatorPdfFormValues, PdfFormMappingResult } from "./calculatorPdfFormTypes";
import type { ParsedContractPdf } from "./calculatorPdfImport";

export function mapPropertyPdfFormValues(parsed: ParsedContractPdf): PdfFormMappingResult {
  const values: Partial<CalculatorPdfFormValues> = {};
  let applied = 0;
  if ("domexAddress" in parsed) {
    const address = typeof parsed.domexAddress === "string" ? parsed.domexAddress.trim() : "";
    values.domexAddress = address;
    if (address) applied += 1;
  }
  if ("domexPropertyType" in parsed) {
    const propertyType = typeof parsed.domexPropertyType === "string" ? parsed.domexPropertyType.trim() : "";
    values.domexPropertyType = propertyType;
    if (propertyType) applied += 1;
  }
  if ("domexPropertyCoverage" in parsed) {
    const propertyCoverage = typeof parsed.domexPropertyCoverage === "string"
      ? parsed.domexPropertyCoverage.trim()
      : "";
    values.domexPropertyCoverage = propertyCoverage;
    if (propertyCoverage) applied += 1;
  }
  if ("domexPropertySumInsured" in parsed) {
    const sumInsured = typeof parsed.domexPropertySumInsured === "number" &&
      Number.isFinite(parsed.domexPropertySumInsured)
      ? Math.round(parsed.domexPropertySumInsured)
      : null;
    values.domexPropertySumInsured = sumInsured;
    if (sumInsured != null) applied += 1;
  }
  if ("domexPropertyDeductible" in parsed) {
    const deductible = typeof parsed.domexPropertyDeductible === "number" &&
      Number.isFinite(parsed.domexPropertyDeductible)
      ? Math.round(parsed.domexPropertyDeductible)
      : null;
    values.domexPropertyDeductible = deductible;
    if (deductible != null) applied += 1;
  }
  if ("domexHouseholdType" in parsed) {
    const householdType = typeof parsed.domexHouseholdType === "string" ? parsed.domexHouseholdType.trim() : "";
    values.domexHouseholdType = householdType;
    if (householdType) applied += 1;
  }
  if ("domexHouseholdCoverage" in parsed) {
    const householdCoverage = typeof parsed.domexHouseholdCoverage === "string"
      ? parsed.domexHouseholdCoverage.trim()
      : "";
    values.domexHouseholdCoverage = householdCoverage;
    if (householdCoverage) applied += 1;
  }
  if ("domexHouseholdSumInsured" in parsed) {
    const householdSumInsured = typeof parsed.domexHouseholdSumInsured === "number" &&
      Number.isFinite(parsed.domexHouseholdSumInsured)
      ? Math.round(parsed.domexHouseholdSumInsured)
      : null;
    values.domexHouseholdSumInsured = householdSumInsured;
    if (householdSumInsured != null) applied += 1;
  }
  if ("domexHouseholdDeductible" in parsed) {
    const householdDeductible = typeof parsed.domexHouseholdDeductible === "number" &&
      Number.isFinite(parsed.domexHouseholdDeductible)
      ? Math.round(parsed.domexHouseholdDeductible)
      : null;
    values.domexHouseholdDeductible = householdDeductible;
    if (householdDeductible != null) applied += 1;
  }
  if ("domexOutbuildingSumInsured" in parsed) {
    const outbuildingSumInsured = typeof parsed.domexOutbuildingSumInsured === "number" &&
      Number.isFinite(parsed.domexOutbuildingSumInsured)
      ? Math.round(parsed.domexOutbuildingSumInsured)
      : null;
    values.domexOutbuildingSumInsured = outbuildingSumInsured;
    if (outbuildingSumInsured != null) applied += 1;
  }
  if ("domexLiabilitySumInsured" in parsed) {
    const liabilitySumInsured = typeof parsed.domexLiabilitySumInsured === "number" &&
      Number.isFinite(parsed.domexLiabilitySumInsured)
      ? Math.round(parsed.domexLiabilitySumInsured)
      : null;
    values.domexLiabilitySumInsured = liabilitySumInsured;
    if (liabilitySumInsured != null) applied += 1;
  }
  if ("domexLiabilityDeductible" in parsed) {
    const liabilityDeductible = typeof parsed.domexLiabilityDeductible === "number" &&
      Number.isFinite(parsed.domexLiabilityDeductible)
      ? Math.round(parsed.domexLiabilityDeductible)
      : null;
    values.domexLiabilityDeductible = liabilityDeductible;
    if (liabilityDeductible != null) applied += 1;
  }
  if ("domexLiabilityMobile" in parsed) {
    const hasAddon = parsed.domexLiabilityMobile === true;
    values.domexLiabilityMobile = hasAddon;
    if (hasAddon) applied += 1;
  }
  if ("domexLiabilityTenant" in parsed) {
    const hasAddon = parsed.domexLiabilityTenant === true;
    values.domexLiabilityTenant = hasAddon;
    if (hasAddon) applied += 1;
  }
  if ("domexLiabilityLandlord" in parsed) {
    const hasAddon = parsed.domexLiabilityLandlord === true;
    values.domexLiabilityLandlord = hasAddon;
    if (hasAddon) applied += 1;
  }
  if ("domexAssistancePlus" in parsed) {
    const hasAssistance = parsed.domexAssistancePlus === true;
    values.domexAssistancePlus = hasAssistance;
    if (hasAssistance) applied += 1;
  }

  return { values, applied };
}

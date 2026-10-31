import type { CalculatorPdfFormValues, PdfFormMappingResult } from "./calculatorPdfFormTypes";
import type { ParsedContractPdf } from "./calculatorPdfImport";
import type { Product } from "../types/domain";
import { parsedSlaviaAutoDetailValue } from "./calculatorBulkPdfImport";

export function mapAutoPdfFormValues(importProduct: Product, parsed: ParsedContractPdf): PdfFormMappingResult {
  const values: Partial<CalculatorPdfFormValues> = {};
  let applied = 0;
  if ("carMake" in parsed) {
    const carMake = typeof parsed.carMake === "string" ? parsed.carMake.trim() : "";
    values.autoCarMake = carMake;
    if (carMake) applied += 1;
  }
  if ("carPlate" in parsed) {
    const plate = typeof parsed.carPlate === "string" ? parsed.carPlate.trim() : "";
    values.autoCarPlate = plate;
    if (plate) applied += 1;
  }
  if ("carVin" in parsed) {
    const vin = typeof parsed.carVin === "string" ? parsed.carVin.trim() : "";
    values.autoCarVin = vin;
    if (vin) applied += 1;
  }
  if ("carTp" in parsed) {
    const tp = typeof parsed.carTp === "string" ? parsed.carTp.trim() : "";
    values.autoCarTp = tp;
    if (tp) applied += 1;
  }
  if ("carOrv" in parsed) {
    const orv = typeof parsed.carOrv === "string" ? parsed.carOrv.trim() : "";
    values.autoCarOrv = orv;
    if (orv) applied += 1;
  }
  if ("carAnnualMileage" in parsed) {
    const annualMileage = typeof parsed.carAnnualMileage === "string"
      ? parsed.carAnnualMileage.trim()
      : "";
    values.autoCarAnnualMileage = annualMileage;
    if (annualMileage) applied += 1;
  }
  if ("carAllianzScope" in parsed) {
    const scope = typeof parsed.carAllianzScope === "string"
      ? parsed.carAllianzScope.trim()
      : "";
    values.autoCarAllianzScope = scope;
    if (scope) applied += 1;
  }
  if ("carLiabilityLimit" in parsed) {
    const liabilityLimit = typeof parsed.carLiabilityLimit === "number" &&
      Number.isFinite(parsed.carLiabilityLimit)
      ? Math.round(parsed.carLiabilityLimit)
      : null;
    values.autoCarLiabilityLimit = liabilityLimit;
    if (liabilityLimit != null) applied += 1;
    if (importProduct === "cppAuto" && liabilityLimit === 200000000) {
      values.autoCarAddonSmartGap = true;
      values.autoCarAddonServisPro = true;
      applied += 2;
    }
  }
  if ("carSlaviaDetail" in parsed) {
    const slaviaDetail = parsedSlaviaAutoDetailValue(parsed);
    values.autoCarSlaviaDetail = slaviaDetail;
    if (slaviaDetail) applied += 1;
  }
  if ("carHullSumInsured" in parsed) {
    const hullSumInsured = typeof parsed.carHullSumInsured === "number" &&
      Number.isFinite(parsed.carHullSumInsured)
      ? Math.round(parsed.carHullSumInsured)
      : null;
    values.autoCarHullSumInsured = hullSumInsured;
    values.autoCarHullSumInsuredDraft = "";
    if (hullSumInsured != null) applied += 1;
  }
  if ("carHullSumInsuredText" in parsed) {
    const hullSumInsuredText = typeof parsed.carHullSumInsuredText === "string"
      ? parsed.carHullSumInsuredText.trim()
      : "";
    values.autoCarHullSumInsuredText = hullSumInsuredText;
    values.autoCarHullSumInsuredDraft = "";
    if (hullSumInsuredText) {
      values.autoCarHullSumInsured = null;
      applied += 1;
    }
  }
  if ("carHullDeductible" in parsed) {
    const hullDeductible = typeof parsed.carHullDeductible === "number" &&
      Number.isFinite(parsed.carHullDeductible)
      ? Math.round(parsed.carHullDeductible)
      : null;
    values.autoCarHullDeductible = hullDeductible;
    if (hullDeductible != null) applied += 1;
  }
  if ("carHullDeductibleText" in parsed) {
    const hullDeductibleText = typeof parsed.carHullDeductibleText === "string"
      ? parsed.carHullDeductibleText.trim()
      : "";
    values.autoCarHullDeductibleText = hullDeductibleText;
    if (hullDeductibleText) applied += 1;
  }
  if ("carHullRiskAccident" in parsed) {
    const risk = parsed.carHullRiskAccident === true;
    values.autoCarHullRiskAccident = risk;
    if (risk) applied += 1;
  }
  if ("carHullRiskTheft" in parsed) {
    const risk = parsed.carHullRiskTheft === true;
    values.autoCarHullRiskTheft = risk;
    if (risk) applied += 1;
  }
  if ("carHullRiskNatural" in parsed) {
    const risk = parsed.carHullRiskNatural === true;
    values.autoCarHullRiskNatural = risk;
    if (risk) applied += 1;
  }
  if ("carHullRiskVandalism" in parsed) {
    const risk = parsed.carHullRiskVandalism === true;
    values.autoCarHullRiskVandalism = risk;
    if (risk) applied += 1;
  }
  if ("carHullRiskAnimalCollision" in parsed) {
    const risk = parsed.carHullRiskAnimalCollision === true;
    values.autoCarHullRiskAnimalCollision = risk;
    if (risk) applied += 1;
  }
  if ("carAssistancePlan" in parsed) {
    const assistance = typeof parsed.carAssistancePlan === "string"
      ? parsed.carAssistancePlan.trim()
      : "";
    values.autoCarAssistancePlan = assistance;
    if (assistance) applied += 1;
  }
  if ("carAddonEso" in parsed) {
    const addon = parsed.carAddonEso === true;
    values.autoCarAddonEso = addon;
    if (addon) applied += 1;
  }
  if ("carAddonNaturalRisks" in parsed) {
    const addon = parsed.carAddonNaturalRisks === true;
    values.autoCarAddonNaturalRisks = addon;
    if (addon) applied += 1;
  }
  if ("carAddonGlass" in parsed) {
    const addon = parsed.carAddonGlass === true;
    values.autoCarAddonGlass = addon;
    if (addon) applied += 1;
  }
  if ("carAddonGlassLimit" in parsed) {
    const limit = typeof parsed.carAddonGlassLimit === "number" &&
      Number.isFinite(parsed.carAddonGlassLimit)
      ? Math.round(parsed.carAddonGlassLimit)
      : null;
    values.autoCarAddonGlassLimit = limit;
    if (limit != null) {
      values.autoCarAddonGlass = true;
      applied += 1;
    }
  }
  if ("carAddonAnimalCollision" in parsed) {
    const addon = parsed.carAddonAnimalCollision === true;
    values.autoCarAddonAnimalCollision = addon;
    if (addon) applied += 1;
  }
  if ("carAddonAnimalCollisionLimit" in parsed) {
    const limit = typeof parsed.carAddonAnimalCollisionLimit === "number" &&
      Number.isFinite(parsed.carAddonAnimalCollisionLimit)
      ? Math.round(parsed.carAddonAnimalCollisionLimit)
      : null;
    values.autoCarAddonAnimalCollisionLimit = limit;
    if (limit != null) {
      values.autoCarAddonAnimalCollision = true;
      applied += 1;
    }
  }
  if ("carAddonAnimalDamage" in parsed) {
    const addon = parsed.carAddonAnimalDamage === true;
    values.autoCarAddonAnimalDamage = addon;
    if (addon) applied += 1;
  }
  if ("carAddonAnimalDamageLimit" in parsed) {
    const limit = typeof parsed.carAddonAnimalDamageLimit === "number" &&
      Number.isFinite(parsed.carAddonAnimalDamageLimit)
      ? Math.round(parsed.carAddonAnimalDamageLimit)
      : null;
    values.autoCarAddonAnimalDamageLimit = limit;
    if (limit != null) {
      values.autoCarAddonAnimalDamage = true;
      applied += 1;
    }
  }
  if ("carAddonVandalism" in parsed) {
    const addon = parsed.carAddonVandalism === true;
    values.autoCarAddonVandalism = addon;
    if (addon) applied += 1;
  }
  if ("carAddonTheft" in parsed) {
    const addon = parsed.carAddonTheft === true;
    values.autoCarAddonTheft = addon;
    if (addon) applied += 1;
  }
  if ("carAddonNatural" in parsed) {
    const addon = parsed.carAddonNatural === true;
    values.autoCarAddonNatural = addon;
    if (addon) applied += 1;
  }
  if ("carAddonGap" in parsed) {
    const addon = parsed.carAddonGap === true;
    values.autoCarAddonGap = addon;
    if (addon) applied += 1;
  }
  if ("carAddonSmartGap" in parsed) {
    const addon = parsed.carAddonSmartGap === true;
    values.autoCarAddonSmartGap = addon;
    if (addon) applied += 1;
  }
  if ("carAddonServisPro" in parsed) {
    const addon = parsed.carAddonServisPro === true;
    values.autoCarAddonServisPro = addon;
    if (addon) applied += 1;
  }
  if ("carAddonFireExplosion" in parsed) {
    const addon = parsed.carAddonFireExplosion === true;
    values.autoCarAddonFireExplosion = addon;
    if (addon) applied += 1;
  }
  if ("carAddonLegalAdvice" in parsed) {
    const addon = parsed.carAddonLegalAdvice === true;
    values.autoCarAddonLegalAdvice = addon;
    if (addon) applied += 1;
  }
  if ("carAddonReplacementCar" in parsed) {
    const addon = parsed.carAddonReplacementCar === true;
    values.autoCarAddonReplacementCar = addon;
    if (addon) applied += 1;
  }
  if ("carAddonLuggage" in parsed) {
    const addon = parsed.carAddonLuggage === true;
    values.autoCarAddonLuggage = addon;
    if (addon) applied += 1;
  }
  if ("carAddonTransportedGoods" in parsed) {
    const addon = parsed.carAddonTransportedGoods === true;
    values.autoCarAddonTransportedGoods = addon;
    if (addon) applied += 1;
  }
  if ("carAddonPothole" in parsed) {
    const addon = parsed.carAddonPothole === true;
    values.autoCarAddonPothole = addon;
    if (addon) applied += 1;
  }
  if ("carAddonNonFaultAccident" in parsed) {
    const addon = parsed.carAddonNonFaultAccident === true;
    values.autoCarAddonNonFaultAccident = addon;
    if (addon) applied += 1;
  }
  if ("carAddonKeyLossTheft" in parsed) {
    const addon = parsed.carAddonKeyLossTheft === true;
    values.autoCarAddonKeyLossTheft = addon;
    if (addon) applied += 1;
  }

  return { values, applied };
}

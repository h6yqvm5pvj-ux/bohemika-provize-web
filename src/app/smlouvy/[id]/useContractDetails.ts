"use client";

import { useCallback } from "react";

import type { Product } from "../../types/domain";
import { isAutoProduct } from "./contractDetailHelpers";
import type { ContractDoc } from "./contractDetailTypes";

export type ContractDetailsForm = {
  editCarAddonAnimalCollision: boolean;
  editCarAddonAnimalCollisionLimit: string;
  editCarAddonAnimalDamage: boolean;
  editCarAddonAnimalDamageLimit: string;
  editCarAddonEso: boolean;
  editCarAddonFireExplosion: boolean;
  editCarAddonGap: boolean;
  editCarAddonGapLimit: string;
  editCarAddonGlass: boolean;
  editCarAddonGlassLimit: string;
  editCarAddonKeyLossTheft: boolean;
  editCarAddonKlika: boolean;
  editCarAddonLegalAdvice: boolean;
  editCarAddonLuggage: boolean;
  editCarAddonNatural: boolean;
  editCarAddonNaturalLimit: string;
  editCarAddonNaturalRisks: boolean;
  editCarAddonNonFaultAccident: boolean;
  editCarAddonOwnDamage: boolean;
  editCarAddonOwnDamageLimit: string;
  editCarAddonPassengerInjury: boolean;
  editCarAddonPothole: boolean;
  editCarAddonReplacementCar: boolean;
  editCarAddonServisPro: boolean;
  editCarAddonSmartGap: boolean;
  editCarAddonTheft: boolean;
  editCarAddonTheftLimit: string;
  editCarAddonTransportedGoods: boolean;
  editCarAddonVandalism: boolean;
  editCarAllianzScope: string;
  editCarAnnualMileage: string;
  editCarAssistancePlan: string;
  editCarHullDeductible: string;
  editCarHullRiskAccident: boolean;
  editCarHullRiskAnimalCollision: boolean;
  editCarHullRiskNatural: boolean;
  editCarHullRiskTheft: boolean;
  editCarHullRiskVandalism: boolean;
  editCarHullSumInsured: string;
  editCarLiabilityLimit: string;
  editCarMake: string;
  editCarOrv: string;
  editCarPlate: string;
  editCarTp: string;
  editCarVin: string;
  editClientAddress: string;
  editClientEmail: string;
  editClientName: string;
  editClientPhone: string;
  editContractNumber: string;
  editContractSigned: string;
  editDomexAddress: string;
  editDomexAssistancePlus: boolean;
  editDomexDeductible: string;
  editDomexHouseholdCoverage: string;
  editDomexHouseholdDeductible: string;
  editDomexHouseholdSumInsured: string;
  editDomexHouseholdType: string;
  editDomexLiabilityDeductible: string;
  editDomexLiabilityLandlord: boolean;
  editDomexLiabilityMobile: boolean;
  editDomexLiabilitySumInsured: string;
  editDomexLiabilityTenant: boolean;
  editDomexNote: string;
  editDomexOutbuildingSumInsured: string;
  editDomexPropertyCoverage: string;
  editDomexPropertyType: string;
  editDomexSumInsured: string;
  editDuration: number | null;
  editFlexiAccidentDailyBenefit: string;
  editFlexiAddonLiabilityCitizen: string;
  editFlexiAddonMajakBasic: boolean;
  editFlexiAddonMajakPlus: boolean;
  editFlexiAddonTravel: boolean;
  editFlexiCaregivingAmount: string;
  editFlexiDeathAccidentAmount: string;
  editFlexiDeathAmount: string;
  editFlexiDeathTypedAmount: string;
  editFlexiDeathTypedType: string;
  editFlexiHospitalAccidentAmount: string;
  editFlexiHospitalGeneralAmount: string;
  editFlexiIllnessForHer: string;
  editFlexiIllnessForHim: string;
  editFlexiInjuryDamageAmount: string;
  editFlexiInvalidityAccident1: string;
  editFlexiInvalidityAccident2: string;
  editFlexiInvalidityAccident3: string;
  editFlexiInvalidityAccidentType: string;
  editFlexiInvalidityIllness1: string;
  editFlexiInvalidityIllness2: string;
  editFlexiInvalidityIllness3: string;
  editFlexiInvalidityIllnessType: string;
  editFlexiLoanDeathAmount: string;
  editFlexiLoanIllnessAmount: string;
  editFlexiLoanInvalidity1: string;
  editFlexiLoanInvalidity2: string;
  editFlexiLoanInvalidity3: string;
  editFlexiLoanInvalidityType: string;
  editFlexiLoanWorkIncapacityAmount: string;
  editFlexiPermanentAccidentAmount: string;
  editFlexiPermanentIllnessAmount: string;
  editFlexiSeriousIllnessAmount: string;
  editFlexiSeriousIllnessType: string;
  editFlexiTrafficAccidentDailyBenefit: string;
  editFlexiTrafficDeathAccidentAmount: string;
  editFlexiTrafficHospitalAccidentAmount: string;
  editFlexiTrafficInjuryDamageAmount: string;
  editFlexiTrafficInvalidityAmount: string;
  editFlexiTrafficPermanentAccidentAmount: string;
  editFlexiTrafficWorkIncapacityAmount: string;
  editFlexiWorkIncapacityAmount: string;
  editFlexiWorkIncapacityBackpay: string;
  editFlexiWorkIncapacityStart: string;
  editNeonAccidentDailyBenefit: string;
  editNeonAccidentDailyBenefitBackpay: string;
  editNeonAccidentDailyBenefitStart: string;
  editNeonCareDependencyAmount: string;
  editNeonCaregivingAmount: string;
  editNeonChildSurgeryAmount: string;
  editNeonCppHelp: boolean;
  editNeonCriticalAmount: string;
  editNeonCriticalType: string;
  editNeonCriticalVariant: string;
  editNeonDeath2Amount: string;
  editNeonDeath2Type: string;
  editNeonDeathAccidentAmount: string;
  editNeonDeathAmount: string;
  editNeonDeathTerminalAmount: string;
  editNeonDeathType: string;
  editNeonDiabetesAmount: string;
  editNeonHospitalizationAmount: string;
  editNeonHospitalizationIllnessAmount: string;
  editNeonHospitalizationInjuryAmount: string;
  editNeonInjuryPermanent2Amount: string;
  editNeonInjuryPermanent2FulfillmentFrom: string;
  editNeonInjuryPermanent2Progression: string;
  editNeonInjuryPermanentAmount: string;
  editNeonInjuryPermanentFulfillmentFrom: string;
  editNeonInjuryPermanentProgression: string;
  editNeonInvalidityA1: string;
  editNeonInvalidityA2: string;
  editNeonInvalidityA3: string;
  editNeonInvalidityAType: string;
  editNeonInvalidityB1: string;
  editNeonInvalidityB2: string;
  editNeonInvalidityB3: string;
  editNeonInvalidityBType: string;
  editNeonInvalidityPension: boolean;
  editNeonLiabilityCitizenLimit: string;
  editNeonLiabilityEmployeeLimit: string;
  editNeonReproductionCostAmount: string;
  editNeonSpecialAidAmount: string;
  editNeonTravelInsurance: boolean;
  editNeonVaccinationCompAmount: string;
  editNeonVersion: string;
  editNeonWaiverInvalidity: boolean;
  editNeonWaiverUnemployment: boolean;
  editNeonWorkIncapacity2Amount: string;
  editNeonWorkIncapacity2Backpay: string;
  editNeonWorkIncapacity2Illness: boolean;
  editNeonWorkIncapacity2Injury: boolean;
  editNeonWorkIncapacity2Start: string;
  editNeonWorkIncapacityAmount: string;
  editNeonWorkIncapacityBackpay: string;
  editNeonWorkIncapacityIllness: boolean;
  editNeonWorkIncapacityInjury: boolean;
  editNeonWorkIncapacityStart: string;
  editPolicyEnd: string;
  editPolicyStart: string;
};

export type ContractDetailsBuildInput = {
  product: Product | null | undefined;
  form: ContractDetailsForm;
  durationBounds: readonly [number, number] | null;
  showDurationForProduct: boolean;
};

export type ContractDetailsSavePlan =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      updates: Record<string, unknown>;
      applyToContract: (previous: ContractDoc) => ContractDoc;
    };

export const buildContractDetailsSavePlan = ({
  product,
  form,
  durationBounds,
  showDurationForProduct,
}: ContractDetailsBuildInput): ContractDetailsSavePlan => {
      const toNumberOrNull = (txt: string) => {
        const trimmed = txt.trim().replace(/\s+/g, "").replace(",", ".");
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
      };

      const trimmedName = form.editClientName.trim();
      const trimmedEmail = form.editClientEmail.trim();
      const trimmedPhone = form.editClientPhone.trim();
      const trimmedAddress = form.editClientAddress.trim();
      const trimmedNumber = form.editContractNumber.trim();
      const signedDate = form.editContractSigned ? new Date(form.editContractSigned) : null;
      const startDate = form.editPolicyStart ? new Date(form.editPolicyStart) : null;
      const endDate = form.editPolicyEnd ? new Date(form.editPolicyEnd) : null;
      if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
        return {
          ok: false as const,
          error: "Datum „Pojištění do“ nesmí být před datem počátku.",
        };
      }
      const durationVal =
        durationBounds != null &&
        typeof form.editDuration === "number" &&
        !Number.isNaN(form.editDuration)
          ? Math.max(
              durationBounds[0],
              Math.min(durationBounds[1], Math.floor(form.editDuration))
            )
          : null;
      const trimmedCarHullSumInsured = form.editCarHullSumInsured.trim();
      const parsedCarHullSumInsured = toNumberOrNull(trimmedCarHullSumInsured);
      const parsedCarHullSumInsuredText =
        trimmedCarHullSumInsured && parsedCarHullSumInsured == null
          ? trimmedCarHullSumInsured
          : null;

      const autoFields =
        isAutoProduct(product ?? null)
          ? {
              carMake: form.editCarMake.trim() || null,
              carPlate: form.editCarPlate.trim() || null,
              carVin: form.editCarVin.trim() || null,
              carTp: form.editCarTp.trim() || null,
              carOrv: form.editCarOrv.trim() || null,
              carAnnualMileage:
                product === "allianzAuto" || product === "pillowAuto"
                  ? form.editCarAnnualMileage.trim() || null
                  : null,
              carAllianzScope:
                product === "allianzAuto" ? form.editCarAllianzScope.trim() || null : null,
              carLiabilityLimit: toNumberOrNull(form.editCarLiabilityLimit),
              carHullSumInsured: parsedCarHullSumInsured,
              carHullSumInsuredText: parsedCarHullSumInsuredText,
              carHullDeductible: toNumberOrNull(form.editCarHullDeductible),
              carHullDeductibleText: form.editCarHullDeductible.trim() || null,
              carHullRiskAccident: !!form.editCarHullRiskAccident,
              carHullRiskTheft: !!form.editCarHullRiskTheft,
              carHullRiskNatural: !!form.editCarHullRiskNatural,
              carHullRiskVandalism: !!form.editCarHullRiskVandalism,
              carHullRiskAnimalCollision: !!form.editCarHullRiskAnimalCollision,
              carAssistancePlan: form.editCarAssistancePlan.trim() || null,
              carAddonEso: !!form.editCarAddonEso,
              carAddonNaturalRisks: !!form.editCarAddonNaturalRisks,
              carAddonKlika: !!form.editCarAddonKlika,
              carAddonGlass: !!form.editCarAddonGlass,
              carAddonGlassLimit: form.editCarAddonGlass ? toNumberOrNull(form.editCarAddonGlassLimit) : null,
              carAddonAnimalCollision: !!form.editCarAddonAnimalCollision,
              carAddonAnimalCollisionLimit: form.editCarAddonAnimalCollision
                ? toNumberOrNull(form.editCarAddonAnimalCollisionLimit)
                : null,
              carAddonAnimalDamage: !!form.editCarAddonAnimalDamage,
              carAddonAnimalDamageLimit: form.editCarAddonAnimalDamage
                ? toNumberOrNull(form.editCarAddonAnimalDamageLimit)
                : null,
              carAddonVandalism: !!form.editCarAddonVandalism,
              carAddonTheft: !!form.editCarAddonTheft,
              carAddonTheftLimit: form.editCarAddonTheft
                ? toNumberOrNull(form.editCarAddonTheftLimit)
                : null,
              carAddonNatural: !!form.editCarAddonNatural,
              carAddonNaturalLimit: form.editCarAddonNatural
                ? toNumberOrNull(form.editCarAddonNaturalLimit)
                : null,
              carAddonOwnDamage: !!form.editCarAddonOwnDamage,
              carAddonOwnDamageLimit: form.editCarAddonOwnDamage
                ? toNumberOrNull(form.editCarAddonOwnDamageLimit)
                : null,
              carAddonPothole: !!form.editCarAddonPothole,
              carAddonNonFaultAccident: !!form.editCarAddonNonFaultAccident,
              carAddonGap: !!form.editCarAddonGap,
              carAddonGapLimit: form.editCarAddonGap ? toNumberOrNull(form.editCarAddonGapLimit) : null,
              carAddonSmartGap: !!form.editCarAddonSmartGap,
              carAddonServisPro: !!form.editCarAddonServisPro,
              carAddonReplacementCar: !!form.editCarAddonReplacementCar,
              carAddonLuggage: !!form.editCarAddonLuggage,
              carAddonTransportedGoods: !!form.editCarAddonTransportedGoods,
              carAddonFireExplosion: !!form.editCarAddonFireExplosion,
              carAddonLegalAdvice: !!form.editCarAddonLegalAdvice,
              carAddonPassengerInjury: !!form.editCarAddonPassengerInjury,
              carAddonKeyLossTheft: !!form.editCarAddonKeyLossTheft,
            }
          : {
              carMake: null,
              carPlate: null,
              carVin: null,
              carTp: null,
              carOrv: null,
              carAnnualMileage: null,
              carAllianzScope: null,
              carLiabilityLimit: null,
              carHullSumInsured: null,
              carHullSumInsuredText: null,
              carHullDeductible: null,
              carHullDeductibleText: null,
              carHullRiskAccident: null,
              carHullRiskTheft: null,
              carHullRiskNatural: null,
              carHullRiskVandalism: null,
              carHullRiskAnimalCollision: null,
              carAssistancePlan: null,
              carAddonEso: null,
              carAddonNaturalRisks: null,
              carAddonKlika: null,
              carAddonGlass: null,
              carAddonGlassLimit: null,
              carAddonAnimalCollision: null,
              carAddonAnimalCollisionLimit: null,
              carAddonAnimalDamage: null,
              carAddonAnimalDamageLimit: null,
              carAddonVandalism: null,
              carAddonTheft: null,
              carAddonTheftLimit: null,
              carAddonNatural: null,
              carAddonNaturalLimit: null,
              carAddonOwnDamage: null,
              carAddonOwnDamageLimit: null,
              carAddonPothole: null,
              carAddonNonFaultAccident: null,
              carAddonGap: null,
              carAddonGapLimit: null,
              carAddonSmartGap: null,
              carAddonServisPro: null,
              carAddonReplacementCar: null,
              carAddonLuggage: null,
              carAddonTransportedGoods: null,
              carAddonFireExplosion: null,
              carAddonLegalAdvice: null,
              carAddonPassengerInjury: null,
              carAddonKeyLossTheft: null,
            };

      const propertyDetailPayload = {
        address: form.editDomexAddress.trim() || null,
        propertyType: form.editDomexPropertyType.trim() || null,
        propertyCoverage: form.editDomexPropertyCoverage.trim() || null,
        sumInsured: toNumberOrNull(form.editDomexSumInsured),
        deductible: toNumberOrNull(form.editDomexDeductible),
        householdType: form.editDomexHouseholdType.trim() || null,
        householdCoverage: form.editDomexHouseholdCoverage.trim() || null,
        householdSumInsured: toNumberOrNull(form.editDomexHouseholdSumInsured),
        householdDeductible: toNumberOrNull(form.editDomexHouseholdDeductible),
        outbuildingSumInsured: toNumberOrNull(form.editDomexOutbuildingSumInsured),
        liabilitySumInsured: toNumberOrNull(form.editDomexLiabilitySumInsured),
        liabilityDeductible: toNumberOrNull(form.editDomexLiabilityDeductible),
        liabilityMobile: !!form.editDomexLiabilityMobile,
        liabilityTenant: !!form.editDomexLiabilityTenant,
        liabilityLandlord: !!form.editDomexLiabilityLandlord,
        assistancePlus: !!form.editDomexAssistancePlus,
        note: form.editDomexNote.trim() || null,
      };

      const propertyDetailUpdate =
        product === "domex" || product === "domexneuron"
          ? { domexDetail: propertyDetailPayload, maxdomovDetail: null }
          : product === "maxdomov"
            ? { domexDetail: null, maxdomovDetail: propertyDetailPayload }
            : { domexDetail: null, maxdomovDetail: null };

      const neonUpdate =
        product === "neon"
          ? {
              neonDetail: {
                version: form.editNeonVersion.trim() || null,
                deathType: form.editNeonDeathType.trim() || null,
                deathAmount: toNumberOrNull(form.editNeonDeathAmount),
                death2Type: form.editNeonDeath2Type.trim() || null,
                death2Amount: toNumberOrNull(form.editNeonDeath2Amount),
                deathTerminalAmount: toNumberOrNull(form.editNeonDeathTerminalAmount),
                waiverInvalidity: !!form.editNeonWaiverInvalidity,
                waiverUnemployment: !!form.editNeonWaiverUnemployment,
                invalidityAType: form.editNeonInvalidityAType.trim() || null,
                invalidityA1: toNumberOrNull(form.editNeonInvalidityA1),
                invalidityA2: toNumberOrNull(form.editNeonInvalidityA2),
                invalidityA3: toNumberOrNull(form.editNeonInvalidityA3),
                invalidityBType: form.editNeonInvalidityBType.trim() || null,
                invalidityB1: toNumberOrNull(form.editNeonInvalidityB1),
                invalidityB2: toNumberOrNull(form.editNeonInvalidityB2),
                invalidityB3: toNumberOrNull(form.editNeonInvalidityB3),
                invalidityPension: !!form.editNeonInvalidityPension,
                criticalIllnessType: form.editNeonCriticalType.trim() || null,
                criticalIllnessVariant: form.editNeonCriticalVariant.trim() || null,
                criticalIllnessAmount: toNumberOrNull(form.editNeonCriticalAmount),
                childSurgeryAmount: toNumberOrNull(form.editNeonChildSurgeryAmount),
                vaccinationCompAmount: toNumberOrNull(form.editNeonVaccinationCompAmount),
                accidentDailyBenefitStart: form.editNeonAccidentDailyBenefitStart.trim() || null,
                accidentDailyBenefitBackpay:
                  form.editNeonAccidentDailyBenefitBackpay.trim() || null,
                accidentDailyBenefit: toNumberOrNull(form.editNeonAccidentDailyBenefit),
                diabetesAmount: toNumberOrNull(form.editNeonDiabetesAmount),
                deathAccidentAmount: toNumberOrNull(form.editNeonDeathAccidentAmount),
                injuryPermanentAmount: toNumberOrNull(form.editNeonInjuryPermanentAmount),
                injuryPermanentFulfillmentFrom:
                  form.editNeonInjuryPermanentFulfillmentFrom.trim() || null,
                injuryPermanentProgression:
                  form.editNeonInjuryPermanentProgression.trim() || null,
                injuryPermanent2Amount: toNumberOrNull(form.editNeonInjuryPermanent2Amount),
                injuryPermanent2FulfillmentFrom:
                  form.editNeonInjuryPermanent2FulfillmentFrom.trim() || null,
                injuryPermanent2Progression:
                  form.editNeonInjuryPermanent2Progression.trim() || null,
                hospitalizationAmount: toNumberOrNull(form.editNeonHospitalizationAmount),
                hospitalizationIllnessAmount: toNumberOrNull(form.editNeonHospitalizationIllnessAmount),
                hospitalizationInjuryAmount: toNumberOrNull(form.editNeonHospitalizationInjuryAmount),
                workIncapacityStart: form.editNeonWorkIncapacityStart.trim() || null,
                workIncapacityBackpay: form.editNeonWorkIncapacityBackpay.trim() || null,
                workIncapacityAmount: toNumberOrNull(form.editNeonWorkIncapacityAmount),
                workIncapacityInjury: form.editNeonWorkIncapacityInjury,
                workIncapacityIllness: form.editNeonWorkIncapacityIllness,
                workIncapacity2Start: form.editNeonWorkIncapacity2Start.trim() || null,
                workIncapacity2Backpay: form.editNeonWorkIncapacity2Backpay.trim() || null,
                workIncapacity2Amount: toNumberOrNull(form.editNeonWorkIncapacity2Amount),
                workIncapacity2Injury: form.editNeonWorkIncapacity2Injury,
                workIncapacity2Illness: form.editNeonWorkIncapacity2Illness,
                careDependencyAmount: toNumberOrNull(form.editNeonCareDependencyAmount),
                specialAidAmount: toNumberOrNull(form.editNeonSpecialAidAmount),
                caregivingAmount: toNumberOrNull(form.editNeonCaregivingAmount),
                reproductionCostAmount: toNumberOrNull(form.editNeonReproductionCostAmount),
                cppHelp: !!form.editNeonCppHelp,
                liabilityCitizenLimit: toNumberOrNull(form.editNeonLiabilityCitizenLimit),
                liabilityEmployeeLimit: toNumberOrNull(form.editNeonLiabilityEmployeeLimit),
                travelInsurance: !!form.editNeonTravelInsurance,
                neonPdfRisks: null,
              },
            }
          : { neonDetail: null };

      const flexiUpdate =
        product === "flexi"
          ? {
              flexiDetail: {
                deathAmount: toNumberOrNull(form.editFlexiDeathAmount),
                deathTypedType: form.editFlexiDeathTypedType.trim() || null,
                deathTypedAmount: toNumberOrNull(form.editFlexiDeathTypedAmount),
                deathAccidentAmount: toNumberOrNull(form.editFlexiDeathAccidentAmount),
                seriousIllnessType: form.editFlexiSeriousIllnessType.trim() || null,
                seriousIllnessAmount: toNumberOrNull(form.editFlexiSeriousIllnessAmount),
                seriousIllnessForHim: toNumberOrNull(form.editFlexiIllnessForHim),
                seriousIllnessForHer: toNumberOrNull(form.editFlexiIllnessForHer),
                permanentIllnessAmount: toNumberOrNull(form.editFlexiPermanentIllnessAmount),
                invalidityIllnessType: form.editFlexiInvalidityIllnessType.trim() || null,
                invalidityIllness1: toNumberOrNull(form.editFlexiInvalidityIllness1),
                invalidityIllness2: toNumberOrNull(form.editFlexiInvalidityIllness2),
                invalidityIllness3: toNumberOrNull(form.editFlexiInvalidityIllness3),
                hospitalGeneralAmount: toNumberOrNull(form.editFlexiHospitalGeneralAmount),
                workIncapacityStart: form.editFlexiWorkIncapacityStart.trim() || null,
                workIncapacityBackpay: form.editFlexiWorkIncapacityBackpay.trim() || null,
                workIncapacityAmount: toNumberOrNull(form.editFlexiWorkIncapacityAmount),
                caregivingAmount: toNumberOrNull(form.editFlexiCaregivingAmount),
                permanentAccidentAmount: toNumberOrNull(form.editFlexiPermanentAccidentAmount),
                injuryDamageAmount: toNumberOrNull(form.editFlexiInjuryDamageAmount),
                accidentDailyBenefit: toNumberOrNull(form.editFlexiAccidentDailyBenefit),
                hospitalAccidentAmount: toNumberOrNull(form.editFlexiHospitalAccidentAmount),
                invalidityAccidentType: form.editFlexiInvalidityAccidentType.trim() || null,
                invalidityAccident1: toNumberOrNull(form.editFlexiInvalidityAccident1),
                invalidityAccident2: toNumberOrNull(form.editFlexiInvalidityAccident2),
                invalidityAccident3: toNumberOrNull(form.editFlexiInvalidityAccident3),
                trafficDeathAccidentAmount: toNumberOrNull(form.editFlexiTrafficDeathAccidentAmount),
                trafficPermanentAccidentAmount: toNumberOrNull(form.editFlexiTrafficPermanentAccidentAmount),
                trafficInjuryDamageAmount: toNumberOrNull(form.editFlexiTrafficInjuryDamageAmount),
                trafficAccidentDailyBenefit: toNumberOrNull(form.editFlexiTrafficAccidentDailyBenefit),
                trafficHospitalAccidentAmount: toNumberOrNull(form.editFlexiTrafficHospitalAccidentAmount),
                trafficWorkIncapacityAmount: toNumberOrNull(form.editFlexiTrafficWorkIncapacityAmount),
                trafficInvalidityAmount: toNumberOrNull(form.editFlexiTrafficInvalidityAmount),
                loanDeathAmount: toNumberOrNull(form.editFlexiLoanDeathAmount),
                loanInvalidityType: form.editFlexiLoanInvalidityType.trim() || null,
                loanInvalidity1: toNumberOrNull(form.editFlexiLoanInvalidity1),
                loanInvalidity2: toNumberOrNull(form.editFlexiLoanInvalidity2),
                loanInvalidity3: toNumberOrNull(form.editFlexiLoanInvalidity3),
                loanIllnessAmount: toNumberOrNull(form.editFlexiLoanIllnessAmount),
                loanWorkIncapacityAmount: toNumberOrNull(form.editFlexiLoanWorkIncapacityAmount),
                addonMajakBasic: !!form.editFlexiAddonMajakBasic,
                addonMajakPlus: !!form.editFlexiAddonMajakPlus,
                addonLiabilityCitizen: toNumberOrNull(form.editFlexiAddonLiabilityCitizen),
                addonTravel: !!form.editFlexiAddonTravel,
              },
            }
          : { flexiDetail: null };

      const updates: Record<string, unknown> = {
        clientName: trimmedName || null,
        clientEmail: trimmedEmail || null,
        clientPhone: trimmedPhone || null,
        clientAddress: trimmedAddress || null,
        contractNumber: trimmedNumber || null,
        contractSignedDate: signedDate ?? null,
        policyStartDate: startDate ?? null,
        policyEndDate: endDate ?? null,
        ...autoFields,
        ...neonUpdate,
        ...flexiUpdate,
        ...propertyDetailUpdate,
      };
      if (showDurationForProduct) {
        updates.durationYears = durationVal ?? null;
      }



  return {
    ok: true,
    updates,
    applyToContract: (previous) =>
      ({
        ...previous,
        ...updates,
        durationYears: showDurationForProduct
          ? durationVal ?? previous.durationYears ?? null
          : previous.durationYears ?? null,
      }) as ContractDoc,
  };
};

export type ContractDetailsApiRequest = <T>(
  path: string,
  init?: RequestInit
) => Promise<T>;

export type SaveContractDetailsInput = ContractDetailsBuildInput & {
  ownerEmail: string;
  entryId: string;
  requestContractsApi: ContractDetailsApiRequest;
};

export const saveContractDetails = async (
  input: SaveContractDetailsInput
): Promise<ContractDetailsSavePlan> => {
  const plan = buildContractDetailsSavePlan(input);
  if (!plan.ok) return plan;

  await input.requestContractsApi("/api/contracts/update-fields", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ownerEmail: input.ownerEmail,
      entryId: input.entryId,
      updates: plan.updates,
    }),
  });

  return plan;
};

export const useContractDetails = () =>
  useCallback((input: SaveContractDetailsInput) => saveContractDetails(input), []);

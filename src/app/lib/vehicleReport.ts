export type VehicleReportSummary = {
  ownerCount?: unknown;
  ownerRecordCount?: unknown;
  ownerPartyCount?: unknown;
  wasImported?: unknown;
  importCountry?: unknown;
  importDate?: unknown;
  totalDefects?: unknown;
  lastOdometerKm?: unknown;
  lastOdometerDate?: unknown;
  avgAnnualKm?: unknown;
};

export type VehicleReportStkStatus = {
  state?: unknown;
  nextDue?: unknown;
  daysRemaining?: unknown;
  note?: unknown;
  scorePenalty?: unknown;
};

export type VehicleReportHero = {
  score?: unknown;
  letter?: unknown;
  label?: unknown;
  yearLabel?: unknown;
  fuelLabel?: unknown;
  powerLabel?: unknown;
  colorLabel?: unknown;
};

export type VehicleReportOdometerRow = {
  dateIso?: unknown;
  km?: unknown;
  deltaKm?: unknown;
  deltaDays?: unknown;
  protocolLabel?: unknown;
  result?: unknown;
  quality?: unknown;
};

export type VehicleReportInspectionRow = {
  protocolLabel?: unknown;
  dateIso?: unknown;
  stationNumber?: unknown;
  stationTown?: unknown;
  inspectionType?: unknown;
  inspectionTypeLabel?: unknown;
  result?: unknown;
  resultLabel?: unknown;
  mileageKm?: unknown;
  durationMin?: unknown;
  defectCount?: unknown;
  worstSeverity?: unknown;
  sameDayGroupId?: unknown;
  sourceLabel?: unknown;
  defectsText?: unknown;
};

export type VehicleReportOwnerRow = {
  roleLabel?: unknown;
  isCurrent?: unknown;
  name?: unknown;
  icoLabel?: unknown;
  addressLabel?: unknown;
  fromIso?: unknown;
  toIso?: unknown;
};

export type VehicleReportValuationMileageRow = {
  km?: unknown;
  price?: unknown;
  widthPercent?: unknown;
  highlighted?: unknown;
};

export type VehicleReportValuation = {
  estimatedPrice?: unknown;
  confidenceLabel?: unknown;
  comparableCount?: unknown;
  referenceMileageKm?: unknown;
  fairRangeLow?: unknown;
  fairRangeHigh?: unknown;
  fairRangePct?: unknown;
  marketMin?: unknown;
  marketMax?: unknown;
  segmentUnderPct?: unknown;
  segmentFairPct?: unknown;
  segmentOverPct?: unknown;
  markerPct?: unknown;
  infoTitle?: unknown;
  infoText?: unknown;
  highlightedMileageKm?: unknown;
  mileagePriceRows?: unknown;
};

export type VehicleReportTechnicalRow = {
  label?: unknown;
  value?: unknown;
};

export type VehicleReportTechnicalSection = {
  title?: unknown;
  rows?: unknown;
};

export type VehicleReportTechnical = {
  sections?: unknown;
};

export type VehicleReportPayload = {
  status?: unknown;
  summary?: unknown;
  stkStatus?: unknown;
  hero?: unknown;
  valuation?: unknown;
  technical?: unknown;
  odometerHistory?: unknown;
  inspections?: unknown;
  owners?: unknown;
};

export type VehicleLookupResult = {
  vin: string;
  payload: { Status: string; Data: Record<string, unknown> };
};

export type VehicleChecks = {
  mileageManipulated: boolean | null;
  ambiguous: boolean;
  insuranceDataThrough: string | null;
  insurance: { insurer: string | null; from: string | null }[];
};

export type VehicleLookupResponse = {
  ok: true;
  result: VehicleLookupResult;
  report: VehicleReportPayload;
  checks: VehicleChecks;
};

export type VehicleVignetteResponse = {
  ok: true;
  vignette: {
    available: boolean;
    exempt: boolean | null;
    valid: boolean | null;
    from: string | null;
    until: string | null;
  };
};

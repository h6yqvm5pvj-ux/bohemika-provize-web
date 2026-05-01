export type GlassQuality = "aftermarket" | "original" | "dealer";
export type CalibrationMode = "none" | "static" | "dynamic" | "full";
export type VehicleSegment = "small" | "compact" | "middle" | "suv" | "van" | "premium" | "luxury" | "sport";
export type CatalogGlassStrategy = "selected" | "highest";

export type WindshieldVehicleSummary = {
  brand: string;
  model: string;
  year: number | null;
  firstRegistration: Date | null;
  fuel: string;
  powerKw: number | null;
  category: string;
  body: string;
};

export type WindshieldInputs = {
  rainSensor: boolean;
  camera: boolean;
  heated: boolean;
  hud: boolean;
  acoustic: boolean;
  antenna: boolean;
  quality: GlassQuality;
  calibration: CalibrationMode;
};

export type WindshieldCostLine = {
  label: string;
  amount: number;
  note: string;
};

export type CatalogGlassBasis = {
  price: number;
  label: string;
  source: string;
  partNumber: string;
  variantCount: number;
  strategy: CatalogGlassStrategy;
};

export type WindshieldEstimate = {
  segment: VehicleSegment;
  glassPrice: number;
  glassPriceSource: "estimate" | "catalogSelected" | "catalogHighest";
  glassPriceNote: string;
  laborAndMaterials: number;
  calibrationPrice: number;
  replacementTotal: number;
  recommendedLimit: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: "vysoká" | "střední" | "nižší";
  confidenceScore: number;
  lines: WindshieldCostLine[];
};

const LUXURY_BRANDS_RE = /(porsche|maserati|ferrari|bentley|rolls|aston|lamborghini|mclaren)/;
const PREMIUM_BRANDS_RE = /(audi|bmw|mercedes|lexus|volvo|tesla|jaguar|land rover|mini|alfa romeo|infiniti|cadillac)/;
const BUDGET_BRANDS_RE = /(dacia|lada|ssangyong|mg)/;

export function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function roundUpTo(value: number, step: number): number {
  return Math.max(step, Math.ceil(value / step) * step);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function vehicleText(summary: WindshieldVehicleSummary | null): string {
  if (!summary) return "";
  return normalizeText(`${summary.brand} ${summary.model} ${summary.category} ${summary.body} ${summary.fuel}`);
}

function brandTier(brand: string): "budget" | "mainstream" | "premium" | "luxury" {
  const normalized = normalizeText(brand);
  if (LUXURY_BRANDS_RE.test(normalized)) return "luxury";
  if (PREMIUM_BRANDS_RE.test(normalized)) return "premium";
  if (BUDGET_BRANDS_RE.test(normalized)) return "budget";
  return "mainstream";
}

export function inferVehicleSegment(summary: WindshieldVehicleSummary | null): VehicleSegment {
  if (!summary) return "compact";

  const text = vehicleText(summary);
  const tier = brandTier(summary.brand);
  const power = summary.powerKw ?? 90;

  if (/(911|718|boxster|cayman|amg gt|mustang|corvette|supra|tt|z4)/.test(text)) return "sport";
  if (tier === "luxury") return "luxury";
  if (/(transit|transporter|crafter|sprinter|ducato|boxer|jumper|vito|viano|multivan|trafic|vivaro|proace|tourneo|dodav|naklad|n1)/.test(text)) {
    return "van";
  }
  if (/(suv|crossover|kodiaq|karoq|kamiq|tiguan|touareg|qashqai|x-trail|rav4|cr-v|x1|x3|x5|q2|q3|q5|q7|glc|gle|xc40|xc60|xc90|duster|sportage|tucson|ateca|kona)/.test(text)) {
    return "suv";
  }
  if (tier === "premium" || power >= 180) return "premium";
  if (/(fabia|citigo|polo|up|fiesta|yaris|aygo|clio|twingo|corsa|i10|i20|swift|micra|sandero|rio)/.test(text)) {
    return "small";
  }
  if (/(superb|passat|mondeo|insignia|camry|mazda 6|accord|arteon|talisman|508)/.test(text)) return "middle";

  return "compact";
}

function baseGlassPrice(summary: WindshieldVehicleSummary | null, segment: VehicleSegment): number {
  const segmentBase: Record<VehicleSegment, number> = {
    small: 8_200,
    compact: 10_800,
    middle: 13_600,
    suv: 15_800,
    van: 14_800,
    premium: 19_500,
    luxury: 33_000,
    sport: 24_500,
  };

  const tier = brandTier(summary?.brand ?? "");
  const tierMultiplier =
    segment === "premium" || segment === "luxury"
      ? 1
      : {
          budget: 0.92,
          mainstream: 1,
          premium: 1.18,
          luxury: 1.45,
        }[tier];

  const year = summary?.year ?? summary?.firstRegistration?.getFullYear() ?? null;
  const yearMultiplier = year == null ? 1 : year >= 2022 ? 1.1 : year >= 2018 ? 1.05 : year < 2010 ? 0.92 : 1;
  const fuel = normalizeText(summary?.fuel ?? "");
  const electricMultiplier = fuel.includes("elekt") ? 1.08 : 1;

  return roundTo(segmentBase[segment] * tierMultiplier * yearMultiplier * electricMultiplier, 500);
}

function qualityMultiplier(quality: GlassQuality): number {
  if (quality === "aftermarket") return 0.92;
  if (quality === "dealer") return 1.22;
  return 1.08;
}

function calibrationPrice(mode: CalibrationMode): number {
  if (mode === "static") return 3_200;
  if (mode === "dynamic") return 4_800;
  if (mode === "full") return 6_800;
  return 0;
}

function calibrationLabel(mode: CalibrationMode): string {
  if (mode === "static") return "statická kalibrace";
  if (mode === "dynamic") return "dynamická kalibrace";
  if (mode === "full") return "statická + dynamická kalibrace";
  return "bez kalibrace";
}

export function inferWindshieldInputs(summary: WindshieldVehicleSummary | null): WindshieldInputs {
  const text = vehicleText(summary);
  const year = summary?.year ?? summary?.firstRegistration?.getFullYear() ?? null;
  const tier = brandTier(summary?.brand ?? "");
  const segment = inferVehicleSegment(summary);
  const recent = year != null && year >= 2018;
  const veryRecent = year != null && year >= 2021;

  const camera =
    veryRecent ||
    (recent && (tier === "premium" || tier === "luxury")) ||
    /(tesla|id\.|enyaq|ioniq|ev6|xc60|xc90|q5|q7|x3|x5|glc|gle|kodiaq|superb)/.test(text);

  return {
    rainSensor: recent || tier === "premium" || tier === "luxury",
    camera,
    heated: /(ford|volvo|jaguar|land rover|range rover|mondeo|focus|kuga|s-max|galaxy)/.test(text),
    hud: (tier === "premium" || tier === "luxury") && recent,
    acoustic: tier === "premium" || tier === "luxury" || (recent && (segment === "middle" || segment === "suv")),
    antenna: false,
    quality: tier === "budget" ? "aftermarket" : "original",
    calibration: camera ? "dynamic" : "none",
  };
}

export function buildWindshieldEstimate(params: {
  summary: WindshieldVehicleSummary | null;
  inputs: WindshieldInputs;
  catalogBasis: CatalogGlassBasis | null;
}): WindshieldEstimate {
  const segment = inferVehicleSegment(params.summary);
  const lines: WindshieldCostLine[] = [];
  const catalogBasis =
    params.catalogBasis != null && Number.isFinite(params.catalogBasis.price) && params.catalogBasis.price > 0
      ? {
          ...params.catalogBasis,
          price: roundTo(params.catalogBasis.price, 100),
          variantCount: Math.max(1, params.catalogBasis.variantCount),
        }
      : null;

  const base = baseGlassPrice(params.summary, segment);
  let glassPrice = catalogBasis?.price ?? 0;
  let glassPriceNote = "odhad podle vozidla a výbavy";

  if (catalogBasis != null) {
    const noteParts = [
      catalogBasis.strategy === "highest" ? "nejvyšší nalezená varianta" : "vybraná varianta",
      catalogBasis.source,
      catalogBasis.partNumber,
    ].filter((value) => value.trim().length > 0);
    glassPriceNote = noteParts.join(" · ");
    lines.push({
      label: "Katalogová cena skla",
      amount: catalogBasis.price,
      note: glassPriceNote,
    });
  } else {
    lines.push({
      label: "Základ skla",
      amount: base,
      note: "segment vozidla a značka",
    });

    const featureLines: WindshieldCostLine[] = [];
    if (params.inputs.rainSensor) featureLines.push({ label: "Dešťový / světelný senzor", amount: 1_600, note: "držák a plocha senzoru" });
    if (params.inputs.camera) featureLines.push({ label: "Kamera / ADAS držák", amount: 2_800, note: "držák kamery a příprava pro asistenty" });
    if (params.inputs.heated) featureLines.push({ label: "Vyhřívané sklo", amount: 4_600, note: "topná vrstva nebo vlákna" });
    if (params.inputs.hud) featureLines.push({ label: "Head-up display", amount: 6_500, note: "optická vrstva pro projekci" });
    if (params.inputs.acoustic) featureLines.push({ label: "Akustické / termo sklo", amount: 2_700, note: "lepší vrstvení skla" });
    if (params.inputs.antenna) featureLines.push({ label: "Anténa ve skle", amount: 1_500, note: "integrovaná anténa nebo příprava" });
    lines.push(...featureLines);

    const glassBeforeQuality = base + featureLines.reduce((sum, item) => sum + item.amount, 0);
    glassPrice = roundTo(glassBeforeQuality * qualityMultiplier(params.inputs.quality), 500);
    glassPriceNote =
      params.inputs.quality === "dealer"
        ? "odhad autorizované dodávky"
        : params.inputs.quality === "original"
          ? "odhad originální kvality"
          : "odhad aftermarket skla";
    lines.push({
      label:
        params.inputs.quality === "dealer"
          ? "Dodání přes autorizovaný servis"
          : params.inputs.quality === "original"
            ? "Originální kvalita skla"
            : "Aftermarket sklo",
      amount: glassPrice - glassBeforeQuality,
      note: "úprava ceny podle zvolené kvality",
    });
  }

  const laborBase = {
    small: 3_600,
    compact: 3_900,
    middle: 4_300,
    suv: 4_800,
    van: 4_900,
    premium: 5_400,
    luxury: 6_400,
    sport: 5_800,
  }[segment];
  const complexity =
    (params.inputs.rainSensor ? 250 : 0) +
    (params.inputs.camera ? 600 : 0) +
    (params.inputs.heated ? 450 : 0) +
    (params.inputs.hud ? 700 : 0) +
    (params.inputs.acoustic ? 250 : 0);
  const laborAndMaterials = roundTo(laborBase + complexity + 1_200, 100);
  lines.push({
    label: "Práce a materiál",
    amount: laborAndMaterials,
    note: "demontáž, lepení, lišty a spotřební materiál",
  });

  const calibration = params.inputs.camera ? calibrationPrice(params.inputs.calibration) : 0;
  if (calibration > 0) {
    lines.push({
      label: "Kalibrace kamer",
      amount: calibration,
      note: calibrationLabel(params.inputs.calibration),
    });
  }

  const replacementTotal = roundTo(glassPrice + laborAndMaterials + calibration, 500);
  const reservePct = params.inputs.camera || params.inputs.hud ? 0.18 : 0.14;
  const recommendedLimit = roundUpTo(replacementTotal * (1 + reservePct), 1_000);

  const confidenceScore = [
    params.summary ? 35 : 0,
    params.summary?.brand && params.summary.brand !== "—" ? 12 : 0,
    params.summary?.model && params.summary.model !== "—" ? 12 : 0,
    params.summary?.year != null || params.summary?.firstRegistration != null ? 10 : 0,
    catalogBasis != null ? 24 : 0,
    catalogBasis != null && catalogBasis.variantCount >= 2 && catalogBasis.strategy === "highest" ? 6 : 0,
    params.inputs.camera && params.inputs.calibration === "none" ? 0 : 10,
    params.inputs.quality !== "dealer" ? 8 : 6,
    params.inputs.rainSensor || params.inputs.camera || params.inputs.heated || params.inputs.hud || params.inputs.acoustic ? 8 : 3,
  ].reduce((sum, value) => sum + value, 0);

  const confidence = confidenceScore >= 78 ? "vysoká" : confidenceScore >= 56 ? "střední" : "nižší";
  const rangePct =
    catalogBasis != null
      ? catalogBasis.strategy === "highest"
        ? 0.06
        : 0.08
      : confidence === "vysoká"
        ? 0.1
        : confidence === "střední"
          ? 0.16
          : 0.24;

  return {
    segment,
    glassPrice,
    glassPriceSource:
      catalogBasis == null ? "estimate" : catalogBasis.strategy === "highest" ? "catalogHighest" : "catalogSelected",
    glassPriceNote,
    laborAndMaterials,
    calibrationPrice: calibration,
    replacementTotal,
    recommendedLimit,
    rangeLow: roundTo(replacementTotal * (1 - rangePct), 500),
    rangeHigh: roundTo(replacementTotal * (1 + rangePct), 500),
    confidence,
    confidenceScore: clamp(confidenceScore, 0, 100),
    lines,
  };
}

import type { VehicleLookupResponse, VehicleVignetteResponse } from "./vehicleReport";

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const bool = (value: unknown): boolean | null => value === true || value === 1 || value === "1" ? true
  : value === false || value === 0 || value === "0" ? false : null;
const display = (value: unknown): string | null => {
  if (typeof value === "boolean") return value ? "Ano" : "Ne";
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("cs-CZ");
  if (Array.isArray(value)) return value.map((item) => {
    const row = object(item);
    return text(row.value) ? `${row.axle ?? "—"}. náprava: ${row.value}` : text(item);
  }).filter(Boolean).join(" · ") || null;
  return text(value);
};

// Field names follow the supplied Autokuk OpenAPI v1 document. Missing values
// stay unknown; an inspection result alone does not establish current STK validity.
const technicalGroups: [string, string, Record<string, string>][] = [
  ["specification", "Identifikace", { brand: "Značka", model: "Model", type: "Typ", variant: "Varianta", version: "Verze", vehicle_kind: "Druh vozidla", category: "Kategorie", body_type: "Karoserie", vehicle_manufacturer: "Výrobce", color: "Barva" }],
  ["registration", "Registrace a doklady", { first_registration: "První registrace", first_registration_cz: "První registrace v ČR", technical_certificate_number: "Číslo technického průkazu (TP)", registration_certificate_number: "Číslo ORV", type_approval_number: "Číslo schválení typu" }],
  ["engine", "Motor a výkon", { manufacturer: "Výrobce motoru", type: "Kód motoru", fuel: "Palivo", displacement_cc: "Objem (cm³)", max_power_kw: "Výkon (kW)", max_power_rpm: "Otáčky při max. výkonu (ot./min)", max_speed_kmh: "Max. rychlost (km/h)" }],
  ["dimensions", "Rozměry", { length_mm: "Délka (mm)", width_mm: "Šířka (mm)", height_mm: "Výška (mm)", wheelbase_mm: "Rozvor (mm)" }],
  ["weights", "Hmotnosti", { operating_weight_kg: "Provozní hmotnost (kg)", max_technically_permissible_weight_kg: "Technicky přípustná hmotnost (kg)", max_permitted_weight_kg: "Povolená hmotnost (kg)" }],
  ["towing", "Přívěs a souprava", { braked_trailer_technically_permissible_kg: "Brzděný přívěs – přípustná hmotnost (kg)", braked_trailer_permitted_kg: "Brzděný přívěs – povolená hmotnost (kg)", unbraked_trailer_technically_permissible_kg: "Nebrzděný přívěs – přípustná hmotnost (kg)", unbraked_trailer_permitted_kg: "Nebrzděný přívěs – povolená hmotnost (kg)", train_permitted_kg: "Souprava – povolená hmotnost (kg)", coupling_device: "Tažné zařízení" }],
  ["wheels_and_tyres", "Nápravy, kola a pneumatiky", { axles_count: "Počet náprav", powered_axles: "Poháněné nápravy", tyres: "Pneumatiky", wheels: "Ráfky" }],
  ["emissions_consumption", "Spotřeba a emise", { fuel_consumption_combined_l_100km: "Kombinovaná spotřeba (l/100 km)", co2_g_km: "CO₂ (g/km)", emission_level: "Emisní norma" }],
  ["capacity", "Obsaditelnost", { seats_total: "Míst celkem", seats_sitting: "Míst k sezení", seats_standing: "Míst k stání" }],
];

// RSV relationship codes: https://download.dataovozidlech.cz/info/vlastnikprovozovatelvozidla
const relationshipLabels: Record<string, string> = { "1": "Vlastník", "2": "Provozovatel", "3": "Spoluvlastník", "4": "Nabyvatel" };

export function normalizeAutokukVehicle(payload: unknown): VehicleLookupResponse | null {
  const envelope = object(payload);
  const data = object(envelope.data);
  const vehicle = object(data.vehicle);
  const vin = text(data.vin) ?? text(vehicle.vin);
  if (envelope.status !== "ok" || !vin || !Object.keys(vehicle).length) return null;
  const technical = object(data.technical);
  const specification = object(technical.specification);
  const registration = object(technical.registration);
  const engine = object(technical.engine);
  const owners = object(data.owners);
  const ownerRows = rows(owners.records);
  const mileage = object(data.mileage);
  const mileagePoints = rows(mileage.points).filter((row) => text(row.date) && number(row.mileage) != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const imports = rows(data.imports);
  const index = object(data.autokuk_index);
  const firstRegistration = text(vehicle.first_registration) ?? text(registration.first_registration);
  const sections = technicalGroups.map(([key, title, fields]) => {
    const source = object(technical[key]);
    return { title, rows: Object.entries(fields).flatMap(([field, label]) => {
      const value = /registration|_from|_until/.test(field) && typeof source[field] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source[field] as string)
        ? new Date(`${source[field]}T12:00:00`).toLocaleDateString("cs-CZ") : display(source[field]);
      return value == null ? [] : [{ label, value }];
    }) };
  }).filter((section) => section.rows.length > 0);
  const latestMileage = mileagePoints.at(-1);
  const imported = imports.length > 0 ? true : firstRegistration && text(registration.first_registration_cz)
    ? firstRegistration !== registration.first_registration_cz : null;
  return {
    ok: true,
    result: { vin, payload: { Status: "ok", Data: {
      TovarniZnacka: text(vehicle.brand) ?? text(specification.brand),
      ObchodniOznaceni: text(vehicle.model) ?? text(specification.model),
      RokVyroby: number(vehicle.manufacture_year) ?? number(specification.manufacture_year),
      DatumPrvniRegistrace: firstRegistration,
      DatumPrvniRegistraceVCr: text(registration.first_registration_cz),
      Palivo: text(vehicle.fuel) ?? text(engine.fuel),
      MotorMaxVykon: number(vehicle.power_kw) ?? number(engine.max_power_kw),
      MotorZdvihObjem: number(vehicle.engine_capacity_cc) ?? number(engine.displacement_cc),
      Kategorie: text(vehicle.category) ?? text(specification.category),
      DruhVozidla: text(specification.vehicle_kind),
      VozidloKaroserieDruh: text(vehicle.body_type) ?? text(specification.body_type),
      VozidloKaroserieBarva: text(vehicle.color) ?? text(specification.color),
      PocetVlastniku: number(owners.count),
      CisloOrv: text(registration.registration_certificate_number),
      CisloTp: text(registration.technical_certificate_number),
      Typ: text(vehicle.type) ?? text(specification.type),
    } } },
    report: {
      status: text(vehicle.status) ?? text(registration.status),
      summary: { ownerCount: number(owners.count), ownerRecordCount: ownerRows.length,
        wasImported: imported, importCountry: text(imports[0]?.country), importDate: text(imports[0]?.imported_at),
        lastOdometerKm: number(mileage.last) ?? number(latestMileage?.mileage), lastOdometerDate: text(latestMileage?.date) },
      technical: { sections },
      odometerHistory: mileagePoints.map((row) => ({ dateIso: text(row.date), km: number(row.mileage) })),
      inspections: rows(data.inspections).map((row, index) => ({
        protocolLabel: text(row.cislo_protokolu), dateIso: text(row.datum),
        inspectionTypeLabel: text(row.typ), resultLabel: text(row.zpusobilost),
        mileageKm: number(row.km), sourceLabel: text(row.source), defectsText: text(row.seznam_zavad_text),
        // Keep individual protocols: a failed inspection followed by a successful
        // reinspection on the same day must not disappear into a merged result.
        sameDayGroupId: `autokuk-inspection-${index}`,
      })),
      owners: ownerRows.map((row) => ({
        roleLabel: relationshipLabels[String(row.vehicle_relation)] ?? (/vlast|provoz/i.test(text(row.vehicle_relation) ?? "") ? text(row.vehicle_relation) : "Evidovaný subjekt"),
        isCurrent: bool(row.current), name: text(row.name) ?? (bool(row.redacted) === true ? "Jméno nezveřejněno" : null), icoLabel: text(row.ico), addressLabel: text(row.address),
        fromIso: text(row.from), toIso: text(row.to),
      })),
    },
    checks: {
      mileageManipulated: bool(mileage.is_manipulated),
      ambiguous: bool(object(data.vehicle_records).ambiguous) === true,
      insuranceDataThrough: text(index.insurance_data_max_date),
      insurance: rows(data.insurance)
        .sort((a, b) => (text(b.valid_from) ?? "").localeCompare(text(a.valid_from) ?? ""))
        .slice(0, 1)
        .map((row) => ({ insurer: text(row.insurer_name), from: text(row.valid_from) })),
    },
  };
}

export function normalizeAutokukVignette(payload: unknown): VehicleVignetteResponse | null {
  const envelope = object(payload);
  const vignette = object(object(envelope.data).vignette);
  if (envelope.status !== "ok" || !text(vignette.status)) return null;
  const available = vignette.status === "ok";
  return { ok: true, vignette: {
    available,
    exempt: available ? bool(vignette.exempt) : null,
    valid: available ? bool(vignette.valid) : null,
    from: available ? text(vignette.valid_from) : null,
    until: available ? text(vignette.valid_until) : null,
  } };
}

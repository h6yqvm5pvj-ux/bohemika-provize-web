import { describe, expect, it } from "vitest";
import sample from "./__fixtures__/autokuk.sample.json";
import { normalizeAutokukVehicle, normalizeAutokukVignette } from "./autokukVehicle";
import { isValidVehicleQuery, normalizeVehicleQuery } from "./vehicleLookupQuery";

describe("Autokuk vehicle adapter", () => {
  it("maps the documented response into the existing vehicle report", () => {
    const result = normalizeAutokukVehicle(sample)!;
    expect(result.result).toMatchObject({ vin: sample.data.vin, payload: { Data: { TovarniZnacka: "SKODA", MotorMaxVykon: 81, MotorZdvihObjem: 1968 } } });
    expect(result.report).toMatchObject({
      summary: { lastOdometerKm: 133700, ownerCount: 2, wasImported: true },
      inspections: [{ dateIso: "2024-06-28", mileageKm: 133700, resultLabel: "zpusobile", sourceLabel: "STK" }],
      owners: [{ name: "Jan Novak", isCurrent: true, roleLabel: "Vlastník" }],
    });
    expect(result.report).not.toHaveProperty("stkStatus");
    expect(result.report).not.toHaveProperty("valuation");
    expect(result.checks).toMatchObject({ mileageManipulated: false });
    expect(result.checks).not.toHaveProperty("theft");
    expect(result.checks).not.toHaveProperty("vignette");
    expect(result.checks.insurance).toHaveLength(1);
  });

  it("preserves ORV and TP separately, relationship roles and useful technical fields while excluding unrelated sections", () => {
    const result = normalizeAutokukVehicle({ ...sample, data: { ...sample.data,
      technical: { ...sample.data.technical, registration: { technical_certificate_number: "TP123", registration_certificate_number: "ORV456" } },
      deregistrations: [{ reason: "Evidence ekologické likvidace", private_note: "excluded" }],
      manufacturer_notes: ["excluded"], history: ["excluded"],
      owners: { count: 1, records: [{ vehicle_relation: "1", current: true }, { vehicle_relation: 2, current: false }, { vehicle_relation: "unknown" }] },
    } })!;
    expect(result.result.payload.Data).toMatchObject({ CisloOrv: "ORV456", CisloTp: "TP123" });
    expect(result.report.owners).toMatchObject([{ roleLabel: "Vlastník", isCurrent: true }, { roleLabel: "Provozovatel", isCurrent: false }, { roleLabel: "Evidovaný subjekt" }]);
    expect(JSON.stringify(result.report.technical)).toContain("ORV456");
    expect(JSON.stringify(result.report.technical)).toContain("TP123");
    expect(JSON.stringify(result)).not.toMatch(/deregistrations|ekologické|excluded|manufacturer_notes/);
  });

  it("projects only vignette fields and does not turn failed or missing checks into a negative result", () => {
    expect(normalizeAutokukVignette(sample)).toEqual({ ok: true, vignette: { available: true, exempt: false, valid: false, from: null, until: null } });
    expect(normalizeAutokukVignette({ status: "ok", data: { vignette: { status: "unavailable", valid: false } } })).toMatchObject({ vignette: { available: false, valid: null } });
    expect(normalizeAutokukVignette({ status: "ok", data: {} })).toBeNull();
  });

  it("preserves unknown values instead of treating missing mileage, ownership or checks as clean", () => {
    const result = normalizeAutokukVehicle({ status: "ok", data: { vin: "TESTVIN1234567890", vehicle: { status: "Provozované" },
      owners: { records: [{ from: "2020-01-01", current: "0", to: null }] }, mileage: { last: null } } })!;
    expect(result.report).toMatchObject({ summary: { ownerCount: null, wasImported: null, lastOdometerKm: null }, owners: [{ isCurrent: false, name: null }] });
    expect(result.checks).toMatchObject({ mileageManipulated: null, insurance: [] });
  });

  it("keeps multiple inspections on the same day and their actual defect text", () => {
    const payload = { ...sample, data: { ...sample.data, inspections: [
      { ...sample.data.inspections[0], zpusobilost: "nezpusobile", seznam_zavad_text: "Brzdy" },
      { ...sample.data.inspections[0], cislo_protokolu: "repeat", zpusobilost: "zpusobile" },
    ] } };
    const result = normalizeAutokukVehicle(payload)!;
    expect(result.report.inspections).toMatchObject([{ resultLabel: "nezpusobile", defectsText: "Brzdy" }, { resultLabel: "zpusobile" }]);
    const inspections = result.report.inspections as { sameDayGroupId: string }[];
    expect(inspections[0].sameDayGroupId).not.toBe(inspections[1].sameDayGroupId);
  });

  it.each([null, {}, { status: "error", error: { code: "NOT_FOUND" } }, { status: "ok", data: { vin: "example" } }])("rejects an invalid success envelope: %j", (payload) => {
    expect(normalizeAutokukVehicle(payload)).toBeNull();
  });

  it.each(["1AB2345", " ab1-23 45 ", "TMBXXX12X34567890"])("accepts and normalizes a VIN or registration plate: %s", (query) => {
    expect(isValidVehicleQuery(normalizeVehicleQuery(query))).toBe(true);
  });
  it.each(["", "AB", "ABCDE", "../../file", "<script>", "A".repeat(26)])("rejects an invalid lookup: %s", (query) => {
    expect(isValidVehicleQuery(normalizeVehicleQuery(query))).toBe(false);
  });
});

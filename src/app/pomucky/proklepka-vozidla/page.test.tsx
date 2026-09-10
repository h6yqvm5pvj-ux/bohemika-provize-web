// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import sample from "@/app/lib/__fixtures__/autokuk.sample.json";
import { normalizeAutokukVehicle } from "@/app/lib/autokukVehicle";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), user: { uid: "adviser", getIdToken: vi.fn() } }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/firebase-auth", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => { callback(mocks.user); return () => {}; } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJson: mocks.fetch }));
import VehicleAuditPage from "./page";

describe("vehicle lookup flow", () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text))!;
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.fetch.mockResolvedValue({ response: new Response(), data: normalizeAutokukVehicle({ ...sample, data: { ...sample.data,
      technical: { ...sample.data.technical, registration: { ...sample.data.technical.registration, registration_certificate_number: "ORV456", technical_certificate_number: "TP123" } },
    } }) });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<VehicleAuditPage />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const search = async () => {
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("#vehicle-vin")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "5k1 5233");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  };

  it("loads one report by SPZ, shows the resolved VIN and both documents, and keeps the bonus closed", async () => {
    await search();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][1]).toBe("/api/autokuk/vehicle");
    expect(JSON.parse(mocks.fetch.mock.calls[0][2].body)).toEqual({ query: "5K15233" });
    expect(container.textContent).toContain(sample.data.vin);
    expect(button("ORV").textContent).toContain("ORV456");
    expect(button("TP").textContent).toContain("TP123");
    expect(container.textContent).toContain("Vlastníci a provozovatelé");
    expect(container.textContent).toContain("Poslední STK");
    expect(container.textContent).toContain("Platnost neuvedena");
    expect(container.textContent).not.toContain("Evidence ekologické likvidace");
    expect(button("Dálniční známka").getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Platná dálniční známka nenalezena");

    mocks.fetch.mockResolvedValue({ response: new Response(), data: { ok: true, vignette: { available: true, valid: false, exempt: false, from: null, until: null } } });
    await act(async () => button("Dálniční známka").click());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mocks.fetch.mock.calls[1][2].body)).toEqual({ query: "5K15233", check: "vignette" });
    expect(container.textContent).toContain("Platná dálniční známka nenalezena");
    await act(async () => button("Dálniční známka").click());
    await act(async () => button("Dálniční známka").click());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("leaves unavailable mileage history empty instead of generating records", async () => {
    mocks.fetch.mockResolvedValue({ response: new Response(), data: normalizeAutokukVehicle({ status: "ok", data: { vin: sample.data.vin, vehicle: { brand: "AUDI", model: "A6", manufacture_year: 2012 } } }) });
    await search();
    expect(container.textContent).toContain("Historie tachometru zatím není dostupná");
    expect(container.textContent).toContain("Záznam STK není dostupný");
    expect(button("TP").disabled).toBe(true);
  });

  it("keeps market pricing on demand and sends the manually corrected mileage to SAUTO", async () => {
    const marketFetch = vi.fn().mockResolvedValue(Response.json({ ok: true, source: "sauto", listings: [], comparableCount: 12,
      stats: { recommended: 320000, median: 315000, min: 250000, max: 400000, q1: 290000, q3: 350000 } }));
    vi.stubGlobal("fetch", marketFetch);
    mocks.user.getIdToken.mockResolvedValue("test-user-token");
    await search();
    expect(marketFetch).not.toHaveBeenCalled();
    await act(async () => button("Zpřesnit odhad nájezdem").click());
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>("#vehicle-mileage")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "200000");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Dopočítat ze SAUTO").click());
    expect(marketFetch).toHaveBeenCalledTimes(1);
    expect(marketFetch.mock.calls[0][0]).toBe("/api/vehicle-market/sauto");
    expect(JSON.parse(marketFetch.mock.calls[0][1].body)).toMatchObject({ brand: "SKODA", model: "OCTAVIA", mileageKm: 200000 });
    expect(container.textContent).toContain("Podle nabídek SAUTO");
    expect(container.textContent).toContain("12 srovnatelných vozidel");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows lookup errors and allows a manual retry without automatic paid requests", async () => {
    mocks.fetch.mockResolvedValue({ response: new Response(null, { status: 429 }), data: { ok: false, error: "Limit prověření je vyčerpaný." } });
    await search();
    expect(container.textContent).toContain("Limit prověření je vyčerpaný.");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(button("Prověřit vozidlo").disabled).toBe(false);
  });
});

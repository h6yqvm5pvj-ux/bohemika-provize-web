// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalculatorDomexPdfDetailEditor, type DomexPdfDetailEditorFields } from "./CalculatorDomexPdfDetailEditor";

const fixture = (): DomexPdfDetailEditorFields => ({
  address: "Dřívější místo 3", propertyAddress: "Syntetická stavba 1", householdAddress: "Modelová domácnost 2",
  propertyAssistance: "basic", householdAssistance: "plus", propertyType: "dum", propertyCoverage: "maxi",
  sumInsured: "4000000", deductible: "1000", outbuildingSumInsured: "", householdType: "trvale",
  householdCoverage: "opti", householdSumInsured: "500000", householdDeductible: "1000",
  liabilitySumInsured: "20000000", liabilityDeductible: "", note: "",
  liabilityMobile: false, liabilityTenant: false, liabilityLandlord: false, assistancePlus: true,
});
const view = (fields = fixture(), neuron = true) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<CalculatorDomexPdfDetailEditor fields={fields} neuron={neuron}
    onTextChange={() => {}} onBooleanChange={() => {}} />);
  return container;
};
const control = (container: HTMLElement, label: string) => [...container.querySelectorAll("label")]
  .find(element => element.textContent?.trim().startsWith(label))?.querySelector("input,select") as HTMLInputElement | HTMLSelectElement | undefined;
// Inspect SSR selection attributes: happy-dom's HTML parser may select an
// earlier option even when another option has the explicit selected attribute.
const selectedValue = (container: HTMLElement, label: string) => control(container, label)
  ?.querySelector("option[selected]")?.getAttribute("value");

describe("Neuron property PDF detail editor", () => {
  it("displays distinct building and household locations with separate assistance variants", () => {
    const container = view();
    expect(control(container, "Adresa stavby")?.value).toBe("Syntetická stavba 1");
    expect(control(container, "Adresa domácnosti")?.value).toBe("Modelová domácnost 2");
    expect(selectedValue(container, "Asistence ke stavbě")).toBe("basic");
    expect(selectedValue(container, "Asistence k domácnosti")).toBe("plus");
    expect(control(container, "Asistence PLUS")).toBeUndefined();
  });

  it("leaves missing scoped assistance unknown rather than selecting basic cover", () => {
    const container = view({ ...fixture(), propertyAddress: "", propertyAssistance: "", householdAssistance: "" });
    expect(control(container, "Adresa stavby")?.value).toBe("");
    expect(selectedValue(container, "Asistence ke stavbě")).toBe("");
    expect(selectedValue(container, "Asistence k domácnosti")).toBe("");
  });

  it("preserves the existing single-address and PLUS editor for legacy property products", () => {
    const container = view(fixture(), false);
    expect(control(container, "Adresa")?.value).toBe("Dřívější místo 3");
    expect(control(container, "Adresa domácnosti")).toBeUndefined();
    expect(control(container, "Asistence ke stavbě")).toBeUndefined();
    expect((control(container, "Asistence PLUS") as HTMLInputElement).checked).toBe(true);
  });
});

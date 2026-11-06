// @vitest-environment happy-dom

import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomexNeuronData, DomexNeuronObject } from "@/app/lib/domexNeuronSchema";
import { normalizeDomexNeuronData } from "@/app/lib/domexNeuronValidation";
import { DomexNeuronObjectsPanel, DomexNeuronParserVersion } from "./DomexNeuronObjectsPanel";

const object = (id: string, kind: "property" | "household", address: string): DomexNeuronObject => ({
  id, kind, type: kind === "property" ? "dum" : "trvale", address, coverage: "opti", sumInsured: 4000000,
  deductible: 1000, assistance: "basic",
  fields: { type: "found", address: "found", coverage: "found", sumInsured: "found", deductible: "found", assistance: "found" },
});
const fixture = (): DomexNeuronData => ({
  parserVersion: 2, sections: { property: "found", household: "found", liability: "not_found", assistance: "found" },
  objects: [object("property-1", "property", "Stavba jedna 10"), object("property-2", "property", "Stavba dvě 20"),
    { ...object("household-1", "household", "Domácnost tři 30"), sumInsured: 500000, assistance: "plus" }],
  liabilityFields: { sumInsured: "not_found", deductible: "not_found" },
});

describe("canonical Neuron object display", () => {
  it("displays every insured object with its own address and assistance", () => {
    const html = renderToStaticMarkup(<DomexNeuronObjectsPanel value={fixture()} />);
    expect(html).toContain("Stavba jedna 10"); expect(html).toContain("Stavba dvě 20"); expect(html).toContain("Domácnost tři 30");
    expect(html.match(/data-object-id=/g)).toHaveLength(3);
    expect(html).toContain("Domácí asistence"); expect(html).toContain("Asistence PLUS");
    expect(html).toContain("Rodinný dům"); expect(html).toContain("Trvale obydlená");
    expect(html).toContain("Verze parseru: 2");
  });

  it("keeps not insured distinct from not found and unreadable", () => {
    const data = fixture(); data.objects = []; data.sections = { property: "not_insured", household: "not_found", liability: "unreadable", assistance: "not_found" };
    const html = renderToStaticMarkup(<DomexNeuronObjectsPanel value={data} />);
    expect(html).toContain("Nesjednáno"); expect(html).toContain("Nenalezeno v PDF"); expect(html).toContain("Nelze přečíst z PDF");
    expect(html).not.toContain("data-object-id=");
  });

  it.each([null, 1, 2])("identifies missing, older and current parser versions: %s", version => {
    const html = renderToStaticMarkup(<DomexNeuronParserVersion version={version} />);
    expect(html.includes("neuvedena")).toBe(version == null);
    expect(html.includes("Starší zpracování")).toBe(version === 1);
  });

  it("warns about indexation across all objects without claiming manually entered sums came from a PDF", () => {
    const data = fixture(); data.parserVersion = null;
    const html = renderToStaticMarkup(<DomexNeuronObjectsPanel value={data} premiumIndexationEnabled />);
    expect(html).toContain("schválené valorizace"); expect(html).not.toContain("vycházejí z PDF");
    expect(renderToStaticMarkup(<DomexNeuronObjectsPanel value={data} premiumIndexationEnabled={false} />)).not.toContain("schválené valorizace");
  });

  it("escapes imported object content", () => {
    const data = fixture(); data.objects[0].address = '<script>alert("synthetic")</script>';
    const html = renderToStaticMarkup(<DomexNeuronObjectsPanel value={data} />);
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
});

describe("canonical Neuron object edits", () => {
  let root: Root, container: HTMLDivElement, latest: DomexNeuronData;
  function Harness({ initial }: { initial: DomexNeuronData }) {
    const [value, setValue] = useState(initial);
    useEffect(() => { latest = value; }, [value]);
    return <DomexNeuronObjectsPanel value={value} editMode onChange={setValue} />;
  }
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const button = (text: string) => [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === text)!;

  it("adds and removes objects without converting absence to not insured or claiming a new parser version", async () => {
    const data = fixture(); data.objects = []; data.parserVersion = null; data.sections.property = "not_found";
    await act(async () => root.render(<Harness initial={data} />));
    await act(async () => button("Přidat stavbu").click());
    expect(latest.objects).toHaveLength(1); expect(latest.objects[0].id).toBe("property-1");
    expect(latest.objects[0].fields.address).toBe("not_found"); expect(latest.sections.property).toBe("found");
    expect(latest.parserVersion).toBeNull(); expect(normalizeDomexNeuronData(latest)).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Odebrat stavbu 1"]')!.click());
    expect(latest.objects).toEqual([]); expect(latest.sections.property).toBe("not_found");
    expect(data.objects).toEqual([]);
  });

  it("clears exactly the edited object's field and keeps spaces while an address is being typed", async () => {
    const data = fixture(); const before = structuredClone(data);
    await act(async () => root.render(<Harness initial={data} />));
    const input = () => container.querySelector<HTMLInputElement>('[data-object-id="property-1"] [data-field="address"] input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), "");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(latest.objects[0].address).toBeNull(); expect(latest.objects[0].fields.address).toBe("not_found");
    expect(latest.objects[1].address).toBe("Stavba dvě 20");
    let draft = "";
    for (const character of "Ulice 123") {
      draft += character;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), draft);
        input().dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input().value).toBe(draft);
      expect(latest.objects[0].address).toBe(draft);
    }
    expect(latest.objects[0].address).toBe("Ulice 123"); expect(latest.objects[0].fields.address).toBe("found");
    expect(data).toEqual(before);
  });

  it.each(["not_found", "not_insured"] as const)("updates one assistance variant independently after section status %s", async status => {
    const data = fixture(); data.sections.assistance = status;
    await act(async () => root.render(<Harness initial={data} />));
    const select = container.querySelector<HTMLSelectElement>('[data-object-id="property-2"] [data-field="assistance"] select')!;
    await act(async () => { select.value = "plus"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(latest.objects[0].assistance).toBe("basic"); expect(latest.objects[1].assistance).toBe("plus");
    expect(latest.sections.assistance).toBe("found"); expect(normalizeDomexNeuronData(latest)).not.toBeNull();
  });

  it("does not silently keep objects after a section was explicitly marked not insured", async () => {
    await act(async () => root.render(<Harness initial={fixture()} />));
    const label = [...container.querySelectorAll("label")].find(node => node.textContent?.startsWith("Stav sekce: pojištění staveb"))!;
    const select = label.querySelector("select")!;
    await act(async () => { select.value = "not_insured"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(latest.sections.property).toBe("not_insured");
    expect(latest.objects.map(item => item.kind)).toEqual(["household"]);
  });
});

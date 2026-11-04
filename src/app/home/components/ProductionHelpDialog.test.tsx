// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionHelpDialog } from "./ProductionHelpDialog";

type Props = Parameters<typeof ProductionHelpDialog>[0];

describe("homepage production help", () => {
  let root: Root;
  let container: HTMLDivElement;
  let opener: HTMLButtonElement;
  let initialOverflow: string;
  const onClose = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    onClose.mockReset();
    initialOverflow = document.body.style.overflow;
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    opener = document.createElement("button");
    document.body.append(opener);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    opener.remove();
    document.body.style.overflow = initialOverflow;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render(overrides: Partial<Props> = {}) {
    await act(async () => root.render(<ProductionHelpDialog
      isOpen onClose={onClose} showTeamBox showOnlyTeamProduction={false} {...overrides}
    />));
  }

  function dialog() {
    const element = document.body.querySelector("dialog");
    expect(element).not.toBeNull();
    return element!;
  }

  function button(name: string) {
    const element = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(item =>
      item.getAttribute("aria-label") === name || item.textContent?.trim() === name,
    );
    expect(element, name).toBeTruthy();
    return element!;
  }

  function section(name: string) {
    const heading = [...dialog().querySelectorAll("h3")].find(item => item.textContent === name);
    expect(heading, name).toBeTruthy();
    return heading!.closest("section")!;
  }

  it("does not render or lock scrolling when closed", async () => {
    await render({ isOpen: false });
    expect(document.body.querySelector("dialog")).toBeNull();
    expect(container.childElementCount).toBe(0);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe(initialOverflow);
  });

  it("opens a labelled native modal in the body portal and focuses its close control", async () => {
    await render();
    const element = dialog();
    expect(element.parentElement).toBe(document.body);
    expect(container.contains(element)).toBe(false);
    expect(element.open).toBe(true);
    expect(element.getAttribute("aria-modal")).toBe("true");
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(button("Zavřít nápovědu"));

    const titleId = element.getAttribute("aria-labelledby")!;
    const descriptionId = element.getAttribute("aria-describedby")!;
    expect(titleId).toBeTruthy();
    expect(descriptionId).toBeTruthy();
    expect(titleId).not.toBe(descriptionId);
    expect(document.getElementById(titleId)?.textContent).toBe("Jak číst produkci");
    expect(document.getElementById(descriptionId)?.textContent).toContain("aktuální měsíc");
    for (const id of [titleId, descriptionId]) {
      expect([...document.querySelectorAll("[id]")].filter(item => item.id === id)).toHaveLength(1);
      expect(element.contains(document.getElementById(id))).toBe(true);
    }
  });

  it("uses distinct accessible labels for a newly mounted instance", async () => {
    await render();
    const originalIds = [dialog().getAttribute("aria-labelledby"), dialog().getAttribute("aria-describedby")];
    await act(async () => root.render(null));
    await render();
    const nextIds = [dialog().getAttribute("aria-labelledby"), dialog().getAttribute("aria-describedby")];
    expect(new Set([...originalIds, ...nextIds]).size).toBe(4);
    for (const id of nextIds) expect(document.getElementById(id!)).not.toBeNull();
  });

  it.each(["close", "unmount"] as const)("restores previous scrolling and opener focus on %s", async action => {
    document.body.style.overflow = "scroll";
    opener.focus();
    await render();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(button("Zavřít nápovědu"));
    if (action === "close") await render({ isOpen: false });
    else await act(async () => root.render(null));
    expect(document.body.querySelector("dialog")).toBeNull();
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(opener);
  });

  it.each(["Zavřít nápovědu", "Rozumím"])("requests dismissal through %s", async name => {
    await render();
    await act(async () => button(name).click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requests dismissal on native Escape cancellation", async () => {
    await render();
    const cancel = new Event("cancel", { cancelable: true });
    await act(async () => dialog().dispatchEvent(cancel));
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dismisses on the backdrop while leaving clicks inside the content alone", async () => {
    await render();
    await act(async () => section("Vlastní produkce").click());
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => dialog().click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    { variant: "solo", showTeamBox: false, showOnlyTeamProduction: false, visible: ["Vlastní produkce", "TIP produkce"] },
    { variant: "team only", showTeamBox: true, showOnlyTeamProduction: true, visible: ["Týmová produkce"] },
    { variant: "full team", showTeamBox: true, showOnlyTeamProduction: false, visible: ["Vlastní produkce", "Týmová produkce", "TIP produkce", "Celková produkce"] },
  ])("explains the relevant production cards for $variant", async ({ showTeamBox, showOnlyTeamProduction, visible }) => {
    await render({ showTeamBox, showOnlyTeamProduction });
    const productionNames = ["Vlastní produkce", "Týmová produkce", "TIP produkce", "Celková produkce"];
    const headings = [...dialog().querySelectorAll("h3")].map(item => item.textContent);
    for (const name of productionNames) expect(headings.includes(name), name).toBe(visible.includes(name));
    expect(section("Rozhoduje datum uzavření")).toBeTruthy();
    expect(section("Pojistné sjednaných smluv")).toBeTruthy();
  });

  it("preserves the date rules, immediate commission exclusions, codes and TIP fallback", async () => {
    await render();
    const dateRule = section("Rozhoduje datum uzavření").textContent;
    expect(dateRule).toContain("pouze smlouvy uzavřené v aktuálním měsíci");
    expect(dateRule).toContain("Datum vytvoření záznamu v aplikaci pro tento přehled nerozhoduje");
    const own = section("Vlastní produkce");
    expect(own.textContent).toContain("Součet okamžitých provizí");
    expect(own.textContent).toContain("Následné provize a souhrnné řádky se nezapočítávají");
    for (const code of ["A101", "B0301", "B36/B3601"]) expect(own.textContent).toContain(code);
    expect(own.textContent).toContain("polovina B36/B3601");
    expect(section("Týmová produkce").textContent).toContain("jen okamžité části meziprovize");
    const tip = section("TIP produkce").textContent;
    expect(tip).toContain("částka sčítá kladné TIP výplaty");
    expect(tip).toContain("datum uzavření zdrojové smlouvy. Pokud není známé, použije se datum výplaty");
    expect(section("Celková produkce").textContent).toContain("Počet smluv je součet vlastních a týmových smluv. TIP má vlastní počet zvlášť");
  });

  it("keeps premium units, payment frequency conversion and exclusions distinct from commission", async () => {
    await render();
    const premiums = section("Pojistné sjednaných smluv").textContent;
    expect(premiums).toContain("Součet měsíčního pojistného");
    expect(premiums).toContain("Součet ročního pojistného ostatních pojištění");
    expect(premiums).toContain("Splátky se přepočítávají podle frekvence placení");
    expect(premiums).toContain("nikoli o provize nebo upravenou provizní základnu");
    expect(premiums).toContain("Tým zahrnuje celé pojistné podřízených smluv");
    expect(premiums).toContain("Celkem je součet vlastní a týmové části");
    expect(premiums).toContain("Samostatné TIP výplaty se do pojistného nepřičítají");
  });
});

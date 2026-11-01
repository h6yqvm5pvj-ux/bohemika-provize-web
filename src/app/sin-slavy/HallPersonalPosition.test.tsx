// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HallPersonalPosition } from "./HallPersonalPosition";
import type { HallCategory, HallRow } from "./hallOfFame.types";

const onFindMe = vi.fn();
const row = (id: string, rank: number, annualPremium: number, contracts = 1): HallRow => ({
  id, rank, annualPremium, contracts, name: `Synthetic ${id}`, profileAvatar: "", leaderRatioPct: 50,
});
let container: HTMLDivElement;
let root: Root;
async function render(rows: HallRow[], category: HallCategory = "auto", currentUserId = "me") {
  await act(async () => root.render(<HallPersonalPosition rows={rows} currentUserId={currentUserId} category={category} onFindMe={onFindMe} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("personal hall position and next target", () => {
  it("uses the immediately preceding place and the current user's production, not the leader's gap", async () => {
    await render([row("leader", 1, 100000), row("next", 2, 54000), row("me", 3, 42000, 7)]);
    expect(container.querySelector('section[aria-label="Tvoje umístění"]')).not.toBeNull();
    expect(container.textContent).toContain("3. místo z 3");
    expect(container.textContent).toContain("42.000 Kč");
    expect(container.textContent).toContain("Další meta · 2. místo");
    expect(container.textContent).toContain("12.000 Kč");
    expect(container.textContent).not.toContain("58.000 Kč");
    expect(container.textContent).toContain("k dorovnání produkce");
    const metrics = [...container.querySelectorAll("strong")].map(element => element.textContent);
    expect(metrics).toContain("7");
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(onFindMe).toHaveBeenCalledOnce();
  });

  it("converts both personal production and the target to monthly life premiums", async () => {
    await render([row("next", 1, 18000), row("me", 2, 12000)], "life");
    expect(container.textContent).toContain("1.000 Kč");
    expect(container.textContent).toContain("500 Kč");
    expect(container.textContent).toContain("Měsíční pojistné");
    expect(container.textContent).toContain("měsíční pojistné");
    expect(container.textContent).not.toContain("6.000 Kč");
  });

  it("keeps a small positive difference visible instead of rounding it down to zero", async () => {
    await render([row("next", 1, 12000.5), row("me", 2, 12000)], "life");
    expect(container.textContent).toContain("1 Kč");
    expect(container.textContent).not.toContain("Stejná produkce");
  });

  it("explains equal production without promising an automatic rank improvement", async () => {
    await render([row("next", 1, 12000, 2), row("me", 2, 12000, 1)]);
    expect(container.textContent).toContain("Stejná produkce");
    expect(container.textContent).toContain("O pořadí rozhodují další kritéria.");
    expect(container.textContent).not.toContain("k dorovnání produkce");
  });

  it("gives the leader a complete state without a fictitious next rank or zero target", async () => {
    await render([row("me", 1, 24000), row("other", 2, 12000)]);
    expect(container.textContent).toContain("První příčka je tvoje");
    expect(container.textContent).toContain("Jsi na vrcholu");
    expect(container.textContent).not.toContain("Další meta");
    expect([...container.querySelectorAll("strong")].map(element => element.textContent)).not.toContain("0 Kč");
    expect(container.querySelector("button")?.textContent).toContain("Najít mě v žebříčku");
  });

  it.each([{ rows: [row("other", 1, 12000)] }, { rows: [] }])("does not invent a rank or scroll action when the user is unranked", async ({ rows }) => {
    await render(rows);
    expect(container.textContent).toContain("Zatím bez umístění");
    expect(container.textContent).toContain("Začni první smlouvou");
    expect(container.textContent).toContain("0 Kč");
    expect(container.textContent).not.toContain("0. místo");
    expect(container.textContent).not.toContain("Další meta");
    expect(container.querySelector("button")).toBeNull();
    expect(onFindMe).not.toHaveBeenCalled();
  });

  it("recalculates the card from the selected category and authorized user without keeping the old result", async () => {
    const rows = [row("next", 1, 24000), row("me", 2, 12000)];
    await render(rows, "life");
    expect(container.textContent).toContain("1.000 Kč");
    await render(rows, "auto");
    expect(container.textContent).toContain("12.000 Kč");
    expect(container.textContent).not.toContain("Měsíční pojistné");
    await render(rows, "auto", "unranked-user");
    expect(container.textContent).toContain("Zatím bez umístění");
    expect(container.textContent).not.toContain("12.000 Kč");
    expect(container.querySelector("button")).toBeNull();
  });
});

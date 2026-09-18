// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity, writeMeetingRecord } from "@/app/lib/meetingRecordPrivacy";

const mocks = vi.hoisted(() => ({ router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/lib/secureDocuments", () => ({
  SECURE_DOCUMENT_FILE_NAMES: {},
  useSecureDocumentBlob: () => ({ blob: null, url: null, loading: false, error: null }),
}));
import RecordPage from "./page";
import LifeResultsPage from "./vysledky/page";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear(); localStorage.clear();
  setMeetingRecordIdentity(null); setMeetingRecordIdentity("synthetic-advisor");
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); setMeetingRecordIdentity(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function mount(page: "form" | "results") {
  await act(async () => root.render(page === "form" ? <RecordPage /> : <LifeResultsPage />));
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}
function button(label: string, parent: ParentNode = container) {
  const result = [...parent.querySelectorAll("button")].find(node => node.textContent?.trim() === label);
  expect(result).toBeTruthy();
  return result!;
}
async function click(label: string, parent: ParentNode = container) {
  await act(async () => button(label, parent).click());
}
function section(title: string) {
  const heading = [...container.querySelectorAll("h2")].find(node => node.textContent?.startsWith(title));
  expect(heading).toBeTruthy();
  return heading!.closest("section")!;
}

describe("life meeting record client gender", () => {
  it("saves the chosen gender, restores it on return, and regenerates both genders with the existing benefits intact", async () => {
    const owner = getMeetingRecordContext()!;
    writeMeetingRecord("lifeDraft", { deathOn: true, deathAmount: "500000" }, owner);
    await mount("form");
    expect(button("Muž").getAttribute("aria-pressed")).toBe("true");
    await click("Žena");
    expect(button("Žena").getAttribute("aria-pressed")).toBe("true");
    await click("Výsledky");
    expect(mocks.router.push).toHaveBeenLastCalledWith("/pomucky/zaznam/vysledky");
    expect(readMeetingRecord("lifeDraft", owner)).toMatchObject({ clientGender: "female", deathAmount: "500000" });
    expect(readMeetingRecord("lifeResults", owner)).toMatchObject({
      clientGender: "female", selectedBenefits: [{ key: "death", amount: 500000 }],
    });
    await mount("results");
    expect(container.textContent).toContain("Klientka byla seznámena s rozsahem krytí");
    expect(container.textContent).toContain("Klientce bylo vysvětleno, proč by měla mít připojištěnou invaliditu");
    await click("Zpět na záznam");
    await mount("form");
    expect(button("Žena").getAttribute("aria-pressed")).toBe("true");
    await click("Muž");
    await click("Výsledky");
    await mount("results");
    expect(container.textContent).toContain("Klient byl seznámen s rozsahem krytí");
    expect(container.textContent).toContain("Klientovi bylo vysvětleno, proč by měl mít připojištěnou invaliditu");
    expect(container.textContent).not.toContain("Klientka");
    expect(readMeetingRecord("lifeResults", owner)).toMatchObject({ clientGender: "male" });
    expect(localStorage.length).toBe(0);
  });

  it.each([
    { gender: "female", client: "Klientka", informed: "byla seznámena", warned: "byla upozorněna", instructed: "byla poučena", requested: "vyžadovala", insured: "pojištěné", heading: "S čím byla klientka seznámena?", comparison: "smlouvě jí byla", address: "na její mailovou adresu", conclusion: "klientka vyhodnotila novou variantu jako odpovídající jejím aktuálním potřebám." },
    { gender: "male", client: "Klient", informed: "byl seznámen", warned: "byl upozorněn", instructed: "byl poučen", requested: "vyžadoval", insured: "pojištěného", heading: "S čím byl klient seznámen?", comparison: "smlouvě mu byla", address: "na jeho mailovou adresu", conclusion: "klient vyhodnotil novou variantu jako odpovídající jeho aktuálním potřebám." },
  ])("renders and copies all conditional impact wording for $gender", async (expected) => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    writeMeetingRecord("lifeResults", {
      clientGender: expected.gender,
      hasInvalidity: true, totalInvalidity: 500000, hasCriticalIllness: true, hasSeriousIllness: true,
      hasExistingContract: true, isChangeOnExistingContract: true, isRefreshOrRenovation: true, isContractTerminationDueToNewOne: true,
      selectedBenefits: [{ key: "dailyAllowance", from: "from1", progress: "with", amount: 1000 }],
    }, getMeetingRecordContext()!);
    await mount("results");
    const impacts = section("Popis dopadů"), goals = section("Další požadavky");
    const discrepancies = section("Výčet případných nesrovnalostí");
    expect(discrepancies.textContent).toContain(`Pokud byly po ocenění zdravotního stavu ${expected.gender === "female" ? "klientce" : "klientovi"} stanoveny RIZIKOVÉ PŘIRÁŽKY nebo VÝLUKY, uveď je zde.`);
    expect(discrepancies.nextElementSibling).toBe(impacts);
    expect(button("Obrázek příkladu", discrepancies).getAttribute("aria-haspopup")).toBe("dialog");
    expect(impacts.textContent).not.toContain("RIZIKOVÉ PŘIRÁŽKY");
    const text = impacts.textContent!;
    for (const phrase of [
      `${expected.client} ${expected.informed} s rozsahem krytí`,
      `${expected.client} ${expected.warned}, že požadované částky na invaliditu`,
      `${expected.client} ${expected.warned}, že se připojištění Závažná onemocnění a poranění`,
      `${expected.client} ${expected.warned}, že se připojištění Vážná onemocnění (Pro něj / Pro ni)`,
      `${expected.client} požaduje následující denní dávky:`,
      `a ${expected.informed} s tím`, `dále ${expected.informed} s tabulkou`,
      `${expected.client} ${expected.instructed} o povinnosti`,
      `nové oceňování zdravotního stavu ${expected.insured}`,
      expected.heading, expected.comparison, expected.address, expected.conclusion,
    ]) expect(text).toContain(phrase);
    if (expected.gender === "female") {
      expect(text).not.toMatch(/\b(Klient|klient|Klientovi|byl|seznámen|upozorněn|poučen|jeho|mu|pojištěného)\b/u);
    }
    const firstRow = impacts.querySelector("article")!;
    const displayed = firstRow.querySelector("p")!.textContent!;
    await click("Kopírovat", firstRow);
    expect(copy).toHaveBeenLastCalledWith(displayed);
    await click("Kopírovat vše", impacts);
    const copiedImpacts = copy.mock.calls.at(-1)![0];
    expect(copiedImpacts).toContain(displayed);
    expect(copiedImpacts).toContain(expected.heading);
    expect(copiedImpacts.split(expected.conclusion)).toHaveLength(4);
    expect(copiedImpacts).not.toContain("[[heading]]");
    const requirement = `${expected.client} ${expected.requested} vysvětlení pojmů`;
    expect(goals.textContent).toContain(requirement);
    expect(goals.textContent).toContain(`Např.: ${expected.client} má již uzavřenou smlouvu ŽP`);
    const manualRow = [...goals.querySelectorAll("article")].find(row => row.textContent?.includes("doplnit ručně"))!;
    expect(manualRow.querySelector("button")).toBeNull();
    await click("Kopírovat vše", goals);
    expect(copy.mock.calls.at(-1)![0]).toContain(requirement);
    expect(copy.mock.calls.at(-1)![0]).toContain(`Např.: ${expected.client} má již uzavřenou smlouvu ŽP`);
  });

  it("clears the selected gender together with the rest of the draft on account change", async () => {
    writeMeetingRecord("lifeDraft", { clientGender: "female" }, getMeetingRecordContext()!);
    await mount("form");
    expect(button("Žena").getAttribute("aria-pressed")).toBe("true");
    await act(async () => setMeetingRecordIdentity("another-synthetic-advisor"));
    expect(button("Muž").getAttribute("aria-pressed")).toBe("true");
    expect(readMeetingRecord("lifeDraft", getMeetingRecordContext()!)).toBeNull();
  });

  it.each([
    {
      gender: "male", intro: "Protože klient požaduje vypovězení aktuální smlouvy a sjednání nové, byl seznámen s následujícími dopady z ukončení:",
      comparison: "Klient byl seznámen s konkrétním porovnáním a rozdíly mezi nastavením jeho stávající a nové navrhované smlouvy",
      recipient: "smlouvě mu byla", address: "na jeho mailovou adresu", insured: "pojištěného",
      conclusion: "Na základě porovnání modelací klient vyhodnotil novou variantu jako odpovídající jeho aktuálním potřebám.",
    },
    {
      gender: "female", intro: "Protože klientka požaduje vypovězení aktuální smlouvy a sjednání nové, byla seznámena s následujícími dopady z ukončení:",
      comparison: "Klientka byla seznámena s konkrétním porovnáním a rozdíly mezi nastavením její stávající a nové navrhované smlouvy",
      recipient: "smlouvě jí byla", address: "na její mailovou adresu", insured: "pojištěné",
      conclusion: "Na základě porovnání modelací klientka vyhodnotila novou variantu jako odpovídající jejím aktuálním potřebám.",
    },
  ])("generates one complete, copyable termination block only when selected for $gender", async expected => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    writeMeetingRecord("lifeDraft", { clientGender: expected.gender }, getMeetingRecordContext()!);
    const terminationGroup = () => container.querySelector('[role="group"][aria-label="Výpověď stávající smlouvy z důvodu sjednání nové"]')!;
    await mount("form");
    expect(terminationGroup()).toBeTruthy();
    await click("Ano", terminationGroup());
    await click("Výsledky");
    await mount("results");
    const impacts = section("Popis dopadů");
    const rows = [...impacts.querySelectorAll("article")].filter(row => row.textContent?.includes(expected.intro));
    expect(rows).toHaveLength(1);
    const row = rows[0], text = row.querySelector("p")!.textContent!;
    expect(text.startsWith(expected.intro)).toBe(true);
    expect(text.split("\n\n")).toHaveLength(2);
    for (const phrase of [
      "opětovná úhrada počátečních nákladů na sjednání pojištění",
      "uplatnění nových čekacích dob pro nárok na pojistné plnění",
      `nové oceňování zdravotního stavu ${expected.insured}`,
      "v podobě výluk nebo rizikových přirážek za zdravotní stav",
      `vyšší rizikové pojistné s ohledem na věk ${expected.insured} a zdravotní stav`,
      "vyšší celkově pravidelně placené pojistné.",
      expected.comparison, expected.recipient, expected.address,
    ]) expect(text).toContain(phrase);
    expect(text.endsWith(expected.conclusion)).toBe(true);
    expect(row.querySelectorAll("button")).toHaveLength(1);
    await click("Kopírovat", row);
    expect(copy).toHaveBeenLastCalledWith(text);
    await click("Kopírovat vše", impacts);
    expect(copy.mock.calls.at(-1)![0].split(text)).toHaveLength(2);
    expect(impacts.textContent).not.toContain("Ukončení z důvodu sjednání nové pojistné smlouvy:");
    await mount("form");
    await click("Ne", terminationGroup());
    await click("Výsledky");
    await mount("results");
    expect(container.textContent).not.toContain(expected.intro);
    expect(container.textContent).not.toContain("opětovná úhrada počátečních nákladů");
  });
});

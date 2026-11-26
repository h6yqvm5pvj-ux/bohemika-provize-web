// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity, writeMeetingRecord } from "@/app/lib/meetingRecordPrivacy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/lib/secureDocuments", () => ({ SECURE_DOCUMENT_FILE_NAMES: {}, useSecureDocumentBlob: () => ({ blob: null, url: null, loading: false, error: null }) }));
import RecordPage from "./page";
import CarResultsPage from "./vysledky-auto/page";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  setMeetingRecordIdentity(null);
  setMeetingRecordIdentity("synthetic-advisor-a");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMeetingRecordIdentity(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(page: "form" | "car-results" = "form") {
  await act(async () => root.render(page === "form" ? <RecordPage /> : <CarResultsPage />));
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}
function button(label: string, parent: ParentNode = container) {
  const found = [...parent.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  expect(found, label).toBeTruthy();
  return found!;
}
async function click(label: string, parent: ParentNode = container) {
  await act(async () => button(label, parent).click());
}
async function chooseArea(index: number) {
  await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Oblast jednání"] > button')[index].click());
  if (index === 3) await click("Občan", container.querySelector("dialog")!);
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}

describe("shared client selection", () => {
  it.each(["male", "female"] as const)("selects distinct liability content and copies employee wording for %s", async gender => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await mount();
    await click(gender === "female" ? "Žena" : "Muž");
    const trigger = container.querySelector<HTMLButtonElement>('[data-sector="liability"]')!;
    await act(async () => { trigger.focus(); trigger.click(); });
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("Jakou odpovědnost řešíš?");
    expect(document.activeElement).toBe(button("Občan", dialog));
    await click("Zaměstnanec", dialog);
    expect(container.querySelector("dialog")).toBeNull();
    const form = container.querySelector("#record-form")!;
    expect(form.getAttribute("aria-label")).toBe("Odpovědnost zaměstnance");
    expect(form.textContent).toContain(gender === "female" ? "Klientka vyžadovala vysvětlení pojmů" : "Klient vyžadoval vysvětlení pojmů");
    expect(form.textContent).toContain(gender === "female" ? "cíle zákaznice" : "cíle zákazníka");
    expect(form.textContent).not.toContain("50 mil.");
    const limitRow = [...form.querySelectorAll("article")].find(row => row.textContent?.includes("4,5násobku"))!;
    const expected = gender === "female"
      ? "Klientka byla seznámena s doporučením sjednat pojistný limit ve výši 4,5násobku průměrného hrubého měsíčního výdělku. Byla upozorněna, že při sjednání nižšího limitu může být případná škoda kryta pouze částečně a zbývající část bude muset uhradit z vlastních prostředků."
      : "Klient byl seznámen s doporučením sjednat pojistný limit ve výši 4,5násobku průměrného hrubého měsíčního výdělku. Byl upozorněn, že při sjednání nižšího limitu může být případná škoda kryta pouze částečně a zbývající část bude muset uhradit z vlastních prostředků.";
    await click("Kopírovat", limitRow);
    expect(copy).toHaveBeenLastCalledWith(expected);
    await chooseArea(3);
    expect(container.querySelector("#record-form")?.textContent).toContain("50 mil.");
    expect(container.querySelector("#record-form")?.textContent).not.toContain("4,5násobku");
  });

  it("cancels liability selection without switching the current area and restores focus and scrolling", async () => {
    await mount();
    const trigger = container.querySelector<HTMLButtonElement>('[data-sector="liability"]')!;
    const previousOverflow = document.body.style.overflow;
    await act(async () => { trigger.focus(); trigger.click(); });
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector("#record-form")?.getAttribute("aria-label")).toBe("Životní pojištění");
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe(previousOverflow);
  });
  it("keeps one selector across all sectors and gives it precedence over an older life draft", async () => {
    writeMeetingRecord("lifeDraft", { clientGender: "male", deathOn: true, deathAmount: "500000" }, getMeetingRecordContext()!);
    await mount();
    await click("Žena");
    for (const index of [1, 2, 3, 4, 5, 0]) {
      await chooseArea(index);
      expect(container.querySelectorAll('button[aria-pressed="true"]')).toContain(button("Žena"));
      expect([...container.querySelectorAll("button")].filter(node => node.textContent === "Žena")).toHaveLength(1);
    }
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Pojistná částka při smrti / dožití (Kč)"]')?.value).toBe("500000");
    await click("Výsledky");
    expect(readMeetingRecord("lifeResults", getMeetingRecordContext()!)).toMatchObject({ clientGender: "female", selectedBenefits: [{ key: "death", amount: 500000 }] });
  });

  it.each(["male", "female"] as const)("renders and copies all simple-sector sentences for %s", async gender => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await mount();
    await click(gender === "female" ? "Žena" : "Muž");
    for (const index of [2, 3, 4, 5]) {
      await chooseArea(index);
      const form = container.querySelector("#record-form")!;
      const text = form.textContent!;
      expect(text).toContain(gender === "female" ? "Klientka vyžadovala vysvětlení pojmů" : "Klient vyžadoval vysvětlení pojmů");
      if (index === 2) {
        expect(text).toContain(gender === "female" ? "požadavkům klientky" : "požadavkům klienta");
        expect(text).toContain(gender === "female" ? "odpovídalo jejím aktuálním potřebám" : "odpovídalo jeho aktuálním potřebám");
      }
      if (index === 3) expect(text).toContain(gender === "female" ? "Klientce bylo důrazně doporučeno" : "Klientovi bylo důrazně doporučeno");
      if (index === 4) {
        expect(text).toContain(gender === "female" ? "Klientka návrhu porozuměla, měla možnost klást dotazy a rozhodla se" : "Klient návrhu porozuměl, měl možnost klást dotazy a rozhodl se");
        expect(text).toContain(gender === "female" ? "je klientkou požadovaná platnost" : "je klientem požadovaná platnost");
      }
      for (const row of [...form.querySelectorAll("article")].filter(node => !node.querySelector("article") && node.querySelector("button"))) {
        const sentence = row.querySelector("p")!.textContent!;
        // Unicode boundaries keep words such as „požadovanému“ intact.
        // Possessives can also refer to an event or policy, rather than the client.
        if (gender === "female") expect(sentence).not.toMatch(/(?<!\p{L})(Klient|Klientovi|klientovi|klienta|klientem)(?!\p{L})/u);
        else expect(sentence).not.toMatch(/(?<!\p{L})(Klientka|Klientce|klientka|klientce|klientkou|klientky)(?!\p{L})/u);
        await act(async () => row.querySelector("button")!.click());
        expect(copy).toHaveBeenLastCalledWith(sentence);
      }
    }
  });

  it("transfers gender into car results, including warnings, pronouns and copied sections", async () => {
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await mount();
    await click("Žena");
    await chooseArea(1);
    const limit = container.querySelector<HTMLSelectElement>('select[id$="-liability-limit"]')!;
    const mileage = container.querySelector<HTMLSelectElement>('select[id$="-mileage"]')!;
    await act(async () => {
      limit.value = "50 / 50 mil. Kč"; limit.dispatchEvent(new Event("change", { bubbles: true }));
      mileage.value = "10 000"; mileage.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click("Skla");
    await click("Asistence");
    await click("Výsledky");
    expect(readMeetingRecord("carResults", getMeetingRecordContext()!)).toMatchObject({ clientGender: "female", assistance: true, assistanceLevel: null });
    await mount("car-results");
    await click("Allianz", container.querySelector('[role="group"][aria-label="Sjednávaná pojišťovna"]')!);
    const impacts = container.querySelector("#dopady")!;
    expect(impacts.textContent).toContain("Klientka byla seznámena");
    expect(impacts.textContent).toContain("Klientka byla informována");
    expect(impacts.textContent).toContain("jí zvolené limity");
    expect(impacts.textContent).not.toContain("pouze základní asistenci");
    expect(impacts.textContent).toContain("Klientka si zvolila roční nájezd 10 000");
    expect(impacts.textContent).toContain("překročení jí bude pojistné dopočítáno");
    await click("Kopírovat vše", impacts);
    expect(copy.mock.calls.at(-1)![0]).toContain("Klientka byla seznámena");
    expect(copy.mock.calls.at(-1)![0]).not.toMatch(/(?<!\p{L})(Klient|Klientovi|jeho|jím|mu)(?!\p{L})/u);
    await mount();
    expect(button("Žena").getAttribute("aria-pressed")).toBe("true");
  });

  it("clears the shared choice on account changes and does not persist it in browser storage", async () => {
    await mount();
    await click("Žena");
    expect(readMeetingRecord("clientPreferences", getMeetingRecordContext()!)).toEqual({ clientGender: "female" });
    await act(async () => setMeetingRecordIdentity("synthetic-advisor-b"));
    expect(button("Muž").getAttribute("aria-pressed")).toBe("true");
    expect(readMeetingRecord("clientPreferences", getMeetingRecordContext()!)).toBeNull();
    await act(async () => setMeetingRecordIdentity(null));
    expect(container.querySelector("button")).toBeNull();
    await act(async () => setMeetingRecordIdentity("synthetic-advisor-a"));
    expect(button("Muž").getAttribute("aria-pressed")).toBe("true");
    expect(Object.keys(localStorage).some(key => key.includes("meeting-record"))).toBe(false);
    expect(Object.keys(sessionStorage).some(key => key.includes("meeting-record"))).toBe(false);
  });

  it.each(["administrator", null, 1, {}])("ignores an invalid saved client gender %j", async clientGender => {
    writeMeetingRecord("clientPreferences", { clientGender }, getMeetingRecordContext()!);
    await mount();
    expect(button("Muž").getAttribute("aria-pressed")).toBe("true");
  });
});

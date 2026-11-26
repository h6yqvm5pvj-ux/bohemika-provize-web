// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPrivateMemory } from "@/app/lib/privateMemory";
import { readContractDetailHandoff } from "@/app/lib/contractDetailHandoff";
import type { VehicleOverlapDraft, VehicleOverlapMatch } from "@/app/lib/vehicleOverlap";
import { VehicleOverlapDialog, VehicleOverlapCheckError, VehicleOverlapPreviewSummary } from "./VehicleOverlapDialog";
import { useVehicleOverlapPreview } from "./useVehicleOverlapPreview";
import { useVehicleOverlapWarning } from "./useVehicleOverlapWarning";

const mocks = vi.hoisted(() => ({ push: vi.fn(), fetch: vi.fn(), auth: { currentUser: { uid: "synthetic-a" } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/firebase", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));

const userA = { uid: "synthetic-a" } as User;
const userB = { uid: "synthetic-b" } as User;
const owner = "team@example.test";
const match: VehicleOverlapMatch = {
  ownerEmail: owner, entryId: "old-contract", productKey: "pillowAuto", contractNumber: "EXAMPLE-123",
  plate: "7Z91234", matchedBy: "plate-and-vin", policyStart: "2026-01-01", policyEnd: null, vinMismatch: false,
};

function Harness({ user }: { user: User }) {
  const { notice, check, dismiss } = useVehicleOverlapWarning(user, "");
  return <>
    <button type="button" onClick={() => void check(owner, ["new-contract"])}>Zkontrolovat uloženou smlouvu</button>
    {notice?.result && <VehicleOverlapDialog result={notice.result} uid={user.uid} impersonatedEmail="" onClose={dismiss} />}
    {notice?.failed && <VehicleOverlapCheckError onClose={dismiss} />}
  </>;
}

function DraftHarness({ draft }: { draft: VehicleOverlapDraft }) {
  const { preview } = useVehicleOverlapPreview(userA, "", draft);
  return <VehicleOverlapPreviewSummary preview={preview} />;
}

describe("vehicle overlap warning", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (user: User = userA) => act(async () => root.render(<Harness user={user} />));
  const click = (text: string) => act(async () =>
    [...container.querySelectorAll("button")].find(button => button.textContent?.includes(text))!.click()
  );
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    clearPrivateMemory();
    mocks.auth.currentUser = userA;
    mocks.fetch.mockResolvedValue({ matches: [match], truncated: false });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    clearPrivateMemory();
    vi.unstubAllGlobals();
  });

  it("displays the matching policy and opens its private detail link", async () => {
    await render();
    await click("Zkontrolovat uloženou smlouvu");
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.textContent).toContain("Pillow Auto č. EXAMPLE-123");
    expect(container.textContent).toContain("Shoduje se SPZ i VIN.");
    expect(container.textContent).toContain("vypovědět");
    const [, url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("/api/contracts/vehicle-overlaps");
    expect(init.body.toString()).toBe(new URLSearchParams({ ownerEmail: owner, entryId: "new-contract" }).toString());
    await click("Otevřít detail smlouvy");
    const path = mocks.push.mock.calls[0][0] as string;
    expect(path).toMatch(/^\/smlouvy\/doc-[\da-f-]+$/);
    const id = path.split("/").at(-1)!;
    expect(readContractDetailHandoff(id, userA.uid, "")).toEqual({ ownerEmail: owner, entryId: "old-contract" });
    expect(readContractDetailHandoff(id, userB.uid, "")).toBeNull();
    expect(readContractDetailHandoff(id, userA.uid, "another@example.test")).toBeNull();
  });

  it("asks to verify the vehicle when the VIN differs and suppresses a stale result on account change", async () => {
    mocks.fetch.mockResolvedValueOnce({ matches: [{ ...match, matchedBy: "plate", vinMismatch: true }], truncated: false });
    await render();
    await click("Zkontrolovat uloženou smlouvu");
    expect(container.textContent).toContain("VIN se liší");
    expect(container.textContent).not.toContain("vypovědět");
    let finish!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click("Zkontrolovat uloženou smlouvu");
    mocks.auth.currentUser = userB;
    await render(userB);
    await act(async () => finish({ matches: [match], truncated: false }));
    expect(container.querySelector("dialog")).toBeNull();
    expect(mocks.fetch.mock.calls[1][2].signal.aborted).toBe(true);
  });

  it("ignores the previous PDF's result when another vehicle is imported", async () => {
    vi.useFakeTimers();
    try {
      let finishPrevious!: (result: unknown) => void;
      mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve; }));
      mocks.fetch.mockResolvedValueOnce({ matches: [], truncated: false });
      const draft: VehicleOverlapDraft = { ownerEmail: owner, productKey: "cppAuto", plate: "7Z91234", vin: "",
        policyStart: "2026-12-01", policyEnd: "", contractNumber: "NEW-1" };
      await act(async () => root.render(<DraftHarness draft={draft} />));
      await act(async () => vi.advanceTimersByTimeAsync(250));
      await act(async () => root.render(<DraftHarness draft={{ ...draft, plate: "7Z95678" }} />));
      expect(mocks.fetch.mock.calls[0][2].signal.aborted).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(container.textContent).toContain("nebyla nalezena shoda");
      await act(async () => finishPrevious({ matches: [match], truncated: false }));
      expect(container.textContent).not.toContain("EXAMPLE-123");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows estimated progress and reaches 100 percent only when the lookup completes", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (result: unknown) => void;
      mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const draft: VehicleOverlapDraft = { ownerEmail: owner, productKey: "cppAuto", plate: "7Z91234", vin: "",
        policyStart: "2026-12-01", policyEnd: "", contractNumber: "NEW-1" };
      const progress = () => container.querySelector('[role="progressbar"]');
      await act(async () => root.render(<DraftHarness draft={draft} />));
      expect(progress()?.getAttribute("aria-valuenow")).toBe("0");

      await act(async () => vi.advanceTimersByTimeAsync(250));
      await act(async () => vi.advanceTimersByTimeAsync(9_750));
      const estimate = Number(progress()?.getAttribute("aria-valuenow"));
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(100);
      expect(progress()?.getAttribute("aria-valuetext")).toContain("Odhad");

      await act(async () => finish({ matches: [match], truncated: false }));
      expect(progress()?.getAttribute("aria-valuenow")).toBe("100");
      expect(container.textContent).toContain("Pillow Auto č. EXAMPLE-123");
      expect(container.querySelector("li")?.textContent).toContain("Shoda SPZ i VIN");
      await act(async () => vi.advanceTimersByTimeAsync(400));
      expect(progress()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

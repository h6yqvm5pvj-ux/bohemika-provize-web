// @vitest-environment happy-dom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKooperativaContractStatus } from "./useKooperativaContractStatus";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@/app/lib/parseKooperativaAutoPdf", () => ({ parseKooperativaAutoPdf: mocks.parse }));
const source = { fileName: "synthetic-contract.pdf", entryId: "root" };
const parsed = { contractNumber: "TEST-1", birthNumber: "9507141234", policyholderType: "natural_person" };
const download = vi.fn();
const defaults = { contextKey: "account-A|contract-A|pdf-A", enabled: true, contractNumber: "TEST-1", sourcePdf: source, downloadPdf: download };
let state: ReturnType<typeof useKooperativaContractStatus<typeof source>>;
let root: Root;
let container: HTMLDivElement;
function Harness(props: Omit<Partial<typeof defaults>, "sourcePdf"> & { sourcePdf?: typeof source | null }) {
  const result = useKooperativaContractStatus({ ...defaults, ...props });
  useLayoutEffect(() => { state = result; }, [result]);
  return <output>{result.isOpen ? result.identity?.value ?? result.error ?? "loading" : "closed"}</output>;
}
async function render(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<Harness {...props} />));
}
async function openAndWait() {
  await act(async () => state.open());
  await vi.waitFor(async () => { await act(async () => {}); expect(state.loading).toBe(false); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  download.mockResolvedValue(new Blob(["synthetic pdf"], { type: "application/pdf" }));
  mocks.parse.mockResolvedValue(parsed);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("Kooperativa contract status loading and privacy", () => {
  it("loads on request only and exposes a derived date instead of a birth number", async () => {
    await render();
    expect(state.isOpen).toBe(false); expect(download).not.toHaveBeenCalled();
    await openAndWait();
    expect(state).toMatchObject({ isOpen: true, loading: false, error: null,
      identity: { kind: "birthDate", value: "14.07.1995" } });
    expect(download).toHaveBeenCalledWith(source, expect.any(AbortSignal));
    expect(mocks.parse).toHaveBeenCalledWith(expect.objectContaining({ name: source.fileName }), { signal: expect.any(AbortSignal) });
    expect(JSON.stringify(state)).not.toContain(parsed.birthNumber);
  });

  it("retains the dialog with a safe explanation when the contract has no PDF", async () => {
    await render({ sourcePdf: null });
    await act(async () => state.open());
    expect(state).toMatchObject({ isOpen: true, loading: false, identity: null });
    expect(state.error).toContain("není uložené PDF"); expect(download).not.toHaveBeenCalled();
  });

  it("rejects a PDF that explicitly identifies another contract", async () => {
    mocks.parse.mockResolvedValue({ ...parsed, contractNumber: "OTHER" });
    await render(); await openAndWait();
    expect(state.identity).toBeNull(); expect(state.error).toContain("neodpovídá");
  });

  it("does not expose parser errors, identifiers or internal locations", async () => {
    mocks.parse.mockRejectedValue(new Error("private birth 9507141234 /internal/private-file.pdf"));
    await render(); await openAndWait();
    expect(state.identity).toBeNull(); expect(state.error).toContain("PDF smlouvy se nepodařilo načíst");
    expect(container.textContent).not.toContain("9507141234"); expect(container.textContent).not.toContain("/internal/");
  });

  it("discards an ambiguous or missing policyholder identifier", async () => {
    mocks.parse.mockResolvedValue({ contractNumber: "TEST-1" });
    await render(); await openAndWait();
    expect(state.identity).toBeNull(); expect(state.error).toContain("oddílu B Pojistník");
  });

  it("aborts a closed request and ignores a late parser result", async () => {
    const pending = deferred<typeof parsed>(); mocks.parse.mockReturnValue(pending.promise);
    await render(); await act(async () => state.open());
    const signal = download.mock.calls[0][1] as AbortSignal;
    await act(async () => state.close()); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(parsed));
    expect(state).toMatchObject({ isOpen: false, identity: null });
  });

  it.each(["another-account", "another-contract", "another-impersonation", "another-pdf"])("hides loaded identity after switching to %s and never restores it on returning", async contextKey => {
    await render(); await openAndWait(); expect(state.identity?.value).toBe("14.07.1995");
    await render({ contextKey }); expect(state.isOpen).toBe(false); expect(container.textContent).toBe("closed");
    await render(); expect(state.isOpen).toBe(false); expect(state.identity).toBeNull();
  });

  it("ignores a late response after the account changes", async () => {
    const pending = deferred<typeof parsed>(); mocks.parse.mockReturnValue(pending.promise);
    await render(); await act(async () => state.open());
    const signal = download.mock.calls[0][1] as AbortSignal;
    await render({ contextKey: "another-account" }); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(parsed)); expect(state.isOpen).toBe(false); expect(state.identity).toBeNull();
  });

  it("cannot open or restore details while access is unavailable", async () => {
    await render({ enabled: false }); await act(async () => state.open()); expect(download).not.toHaveBeenCalled();
    await render(); await act(async () => state.open()); expect(state.isOpen).toBe(true);
    await render({ enabled: false }); expect(state.isOpen).toBe(false);
    await render(); expect(state.isOpen).toBe(false);
  });
});

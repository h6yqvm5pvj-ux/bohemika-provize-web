// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_IMPERSONATION_HEADER } from "@/lib/adminImpersonationShared";
import { useClientNameLookup } from "./useClientNameLookup";

describe("client name directory loading", () => {
  let root: Root;
  let latest: ReturnType<typeof useClientNameLookup>;
  let request: ReturnType<typeof vi.fn<typeof fetch>>;
  const user = { uid: "test-user", getIdToken: vi.fn(async () => "test-token") } as unknown as User;
  const defaultProps = { user, ownerEmail: "owner@example.test", isSavingForSubordinate: false, impersonatedUserEmail: "", query: "Jan Buček" };
  function Harness(props: typeof defaultProps) {
    const result = useClientNameLookup(props);
    useEffect(() => { latest = result; });
    return null;
  }
  const payload = (names: string[], extra: Record<string, unknown> = {}) => Response.json({
    ok: true, names, ...extra,
  });
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads a large directory in one request and searches keystrokes locally", async () => {
    request.mockResolvedValue(payload([...Array.from({ length: 2500 }, (_, i) => `Klient Test${i}`), "Jan Buček"]));
    await act(async () => root.render(<Harness {...defaultProps} />));
    expect(request).toHaveBeenCalledOnce();
    expect(latest.status).toBe("ready");
    expect(latest.matches).toEqual([{ name: "Jan Buček", kind: "exact" }]);
    await act(async () => root.render(<Harness {...defaultProps} query="Bucek Jan" />));
    expect(request).toHaveBeenCalledOnce();
    expect(latest.matches).toEqual([{ name: "Jan Buček", kind: "reordered" }]);
    expect(String(request.mock.calls[0][0])).toContain("/api/contracts/client-names?");
  });

  it("does not report no match while the directory is loading", async () => {
    let resolve!: (response: Response) => void;
    request.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await act(async () => root.render(<Harness {...defaultProps} />));
    expect(latest.status).toBe("loading");
    await act(async () => resolve(payload(["Jan Buček"])));
    expect(latest.status).toBe("ready");
    expect(latest.matches[0].kind).toBe("exact");
  });

  it.each([null, [42]])("rejects an incomplete or malformed response and allows retry", async (names) => {
    request.mockResolvedValue(Response.json({ ok: true, names }));
    await act(async () => root.render(<Harness {...defaultProps} />));
    expect(latest.status).toBe("error");
    request.mockResolvedValue(payload(["Jan Buček"]));
    await act(async () => latest.retry());
    expect(latest.status).toBe("ready");
    expect(latest.matches[0].kind).toBe("exact");
  });

  it("clears the old owner's matches immediately and ignores a late response after switching", async () => {
    let resolveOld!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await act(async () => root.render(<Harness {...defaultProps} />));
    expect(latest.status).toBe("loading");
    const oldSignal = request.mock.calls[0][1]!.signal!;
    request.mockResolvedValue(payload([]));
    await act(async () => root.render(<Harness {...defaultProps} ownerEmail="other@example.test" isSavingForSubordinate />));
    expect(oldSignal.aborted).toBe(true);
    expect(latest.matches).toEqual([]);
    const lastUrl = new URL(String(request.mock.lastCall![0]), "https://bohemka.app");
    expect(lastUrl.searchParams.get("ownerEmail")).toBe("other@example.test");
    await act(async () => resolveOld(payload(["Jan Buček"])));
    expect(latest.matches).toEqual([]);
    expect(latest.status).toBe("ready");
  });

  it("pins impersonation to the viewed advisor on every request and refreshes after contract changes", async () => {
    request.mockResolvedValue(payload([]));
    await act(async () => root.render(<Harness {...defaultProps} impersonatedUserEmail="owner@example.test" />));
    expect(new Headers(request.mock.lastCall![1]!.headers).get(ADMIN_IMPERSONATION_HEADER)).toBe("owner@example.test");
    request.mockResolvedValue(payload(["Jan Buček"]));
    await act(async () => {
      window.dispatchEvent(new Event("contracts:updated"));
      window.dispatchEvent(new Event("contracts:updated"));
      window.dispatchEvent(new Event("contracts:updated"));
      await new Promise(resolve => setTimeout(resolve, 230));
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(latest.matches[0].kind).toBe("exact");
    expect(new Headers(request.mock.lastCall![1]!.headers).get(ADMIN_IMPERSONATION_HEADER)).toBe("owner@example.test");
  });

  it("shows an error rather than a completed lookup when the request fails", async () => {
    request.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    await act(async () => root.render(<Harness {...defaultProps} />));
    expect(latest.status).toBe("error");
    expect(latest.matches).toEqual([]);
  });
});

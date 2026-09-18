// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserSummary } from "./adminUsers";
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mock.fetch }));
import { useAdminUserDetail } from "./useAdminUserDetail";
const user = { uid: "admin" } as User;
const a = { email: "a@example.test" } as AdminUserSummary;
const b = { email: "b@example.test" } as AdminUserSummary;
function Harness({ selected, actor = user }: { selected: AdminUserSummary | null; actor?: User }) {
  const { detail, error, reload } = useAdminUserDetail(selected, actor);
  return <button onClick={reload}>{error || detail?.email || "loading"}</button>;
}
describe("admin detail loading", () => {
  let root: Root; let container: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
  it("aborts the previous selection and ignores its late response", async () => {
    let finishA!: (value: unknown) => void;
    mock.fetch.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; })).mockResolvedValueOnce({ user: b });
    await act(async () => root.render(<Harness selected={a} />));
    const firstSignal = mock.fetch.mock.calls[0][2].signal as AbortSignal;
    await act(async () => root.render(<Harness selected={b} />));
    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).toBe(b.email);
    await act(async () => finishA({ user: a }));
    expect(container.textContent).toBe(b.email);
    await act(async () => root.render(<Harness selected={null} />));
    expect(container.textContent).toBe("loading");
  });
  it("reloads details after replacing the list summary following an edit", async () => {
    mock.fetch.mockResolvedValue({ user: a });
    await act(async () => root.render(<Harness selected={a} />));
    await act(async () => root.render(<Harness selected={a} />));
    expect(mock.fetch).toHaveBeenCalledOnce();
    await act(async () => root.render(<Harness selected={{ ...a }} />));
    expect(mock.fetch).toHaveBeenCalledTimes(2);
  });
  it("offers retry after a detail failure", async () => {
    mock.fetch.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ user: a });
    await act(async () => root.render(<Harness selected={a} />));
    expect(container.textContent).toBe("Offline");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe(a.email);
  });
});

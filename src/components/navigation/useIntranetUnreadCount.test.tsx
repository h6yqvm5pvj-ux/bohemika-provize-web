// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyIntranetUnreadChanged, INTRANET_UNREAD_STORAGE_KEY } from "@/app/intranet/unreadEvents";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
import { useIntranetUnreadCount } from "./useIntranetUnreadCount";

let sequence = 0;
let user: User;
let email: string;
let root: Root;
let container: HTMLDivElement;
function Preview({ currentUser = user, account = email, enabled = true }: { currentUser?: User | null; account?: string; enabled?: boolean }) {
  const count = useIntranetUnreadCount(currentUser, account, enabled);
  return <output>{count ?? "unknown"}</output>;
}
const render = async (props: Parameters<typeof Preview>[0] = {}) => {
  await act(async () => root.render(<Preview {...props} />));
};
const publish = async (count: number) => {
  mocks.fetch.mockResolvedValue({ ok: true, unreadCount: count });
  await act(async () => notifyIntranetUnreadChanged(email));
};

beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  email = `advisor${++sequence}@example.test`;
  user = { uid: `user-${sequence}`, email } as User;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  mocks.fetch.mockResolvedValue({ ok: true, unreadCount: 4 });
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks();
});

describe("intranet unread count", () => {
  it("refreshes after reading, marking unread, and another tab's changes", async () => {
    await render(); expect(container.textContent).toBe("4");
    await publish(3); expect(container.textContent).toBe("3");
    await publish(4); expect(container.textContent).toBe("4");
    mocks.fetch.mockResolvedValue({ ok: true, unreadCount: 0 });
    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: INTRANET_UNREAD_STORAGE_KEY, newValue: JSON.stringify({ email }),
    })));
    expect(container.textContent).toBe("0");
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    await act(async () => notifyIntranetUnreadChanged("other@example.test"));
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it("reuses a fresh count after navigation and does not poll hidden tabs", async () => {
    await render();
    await act(async () => root.render(null)); await render();
    expect(container.textContent).toBe("4"); expect(mocks.fetch).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => vi.advanceTimersByTime(120_000));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    mocks.fetch.mockResolvedValue({ ok: true, unreadCount: 5 });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.textContent).toBe("5"); expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("discards stale requests after a read event and after switching accounts", async () => {
    let finishOld!: (value: object) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    await render();
    const oldSignal = mocks.fetch.mock.calls[0][2].signal as AbortSignal;
    await publish(2); expect(container.textContent).toBe("2"); expect(oldSignal.aborted).toBe(true);
    await act(async () => finishOld({ ok: true, unreadCount: 9 }));
    expect(container.textContent).toBe("2");

    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    await render({ account: "impersonated@example.test" });
    expect(container.textContent).toBe("unknown");
    mocks.fetch.mockResolvedValue({ ok: true, unreadCount: 7 });
    await render({ account: "next@example.test" });
    await act(async () => finishOld({ ok: true, unreadCount: 40 }));
    expect(container.textContent).toBe("7");
    await render({ currentUser: null }); expect(container.textContent).toBe("unknown");
  });

  it("keeps the last count on failure and ignores invalid server counts", async () => {
    await render();
    mocks.fetch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => notifyIntranetUnreadChanged(email));
    expect(container.textContent).toBe("4");
    await publish(-1); expect(container.textContent).toBe("4");
    await publish(0); expect(container.textContent).toBe("0");
  });

  it("does not request counts when navigation is disabled or no user is signed in", async () => {
    await render({ enabled: false }); await render({ currentUser: null });
    expect(container.textContent).toBe("unknown"); expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("still updates the current tab when storage is blocked", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await publish(3); expect(container.textContent).toBe("3");
  });
});

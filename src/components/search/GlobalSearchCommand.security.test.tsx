// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_DIRECTORY_CHANGED_EVENT, type DirectoryContact } from "@/app/lib/contactDirectory";

const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.api }));

import { GlobalSearchCommand } from "./GlobalSearchCommand";

const userA = { uid: "search-user-a" } as User;
const userB = { uid: "search-user-b" } as User;
const contact = (id: string, person: string): DirectoryContact => ({
  id, person, institutionKey: "allianz", emails: [{ value: "synthetic@example.test" }],
});
const privateA = contact("private-a", "Support Private A");
const allowedB = contact("allowed-b", "Support Allowed B");

describe("global contact search account boundaries", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (user: User) => { await act(async () => root.render(<GlobalSearchCommand user={user} />)); };
  const open = async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Globální vyhledávání"]')!.click());
  };
  const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(80); }); };
  const query = async () => {
    const input = container.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "support");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tick();
  };
  const directoryCalls = () => mocks.api.mock.calls.filter(([, path]) => path === "/api/contacts");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.api.mockReset();
    mocks.push.mockReset();
    mocks.api.mockImplementation(async (user: User, path: string) => path === "/api/contacts"
      ? { ok: true, contacts: user.uid === userA.uid ? [privateA] : [allowedB] }
      : { ok: true, users: [], contracts: [], posts: [] });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the previous account's contacts and query before account B searches", async () => {
    await render(userA); await open(); await query();
    expect(container.textContent).toContain(privateA.person);
    await render(userB);
    expect(container.textContent).not.toContain(privateA.person);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await open();
    expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("");
    await query();
    expect(container.textContent).toContain(allowedB.person);
    expect(container.textContent).not.toContain(privateA.person);
    expect(directoryCalls().at(-1)?.[0]).toBe(userB);
  });

  it("ignores account A's delayed response after account B already has results", async () => {
    let finishA!: (payload: unknown) => void;
    mocks.api.mockImplementation(async (user: User, path: string) => {
      if (path !== "/api/contacts") return { ok: true, users: [], contracts: [], posts: [] };
      if (user.uid === userA.uid) return new Promise(resolve => { finishA = resolve; });
      return { ok: true, contacts: [allowedB] };
    });
    await render(userA); await open(); await query();
    await render(userB); await open(); await query();
    expect(container.textContent).toContain(allowedB.person);
    await act(async () => finishA({ ok: true, contacts: [privateA] }));
    expect(container.textContent).toContain(allowedB.person);
    expect(container.textContent).not.toContain(privateA.person);
  });

  it("refetches contacts after reopening even when the same query has cached other results", async () => {
    let loads = 0;
    mocks.api.mockImplementation(async (_user: User, path: string) => path === "/api/contacts"
      ? { ok: true, contacts: ++loads === 1 ? [privateA] : [] }
      : { ok: true, users: [], contracts: [], posts: [] });
    await render(userA); await open(); await query();
    expect(container.textContent).toContain(privateA.person);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zavřít"]')!.click());
    await open(); await tick();
    expect(directoryCalls()).toHaveLength(2);
    expect(container.textContent).not.toContain(privateA.person);
  });

  it("invalidates already displayed contacts and cached query results when the directory changes", async () => {
    let loads = 0;
    mocks.api.mockImplementation(async (_user: User, path: string) => path === "/api/contacts"
      ? { ok: true, contacts: ++loads === 1 ? [privateA] : [] }
      : { ok: true, users: [], contracts: [], posts: [] });
    await render(userA); await open(); await query();
    expect(container.textContent).toContain(privateA.person);
    await act(async () => window.dispatchEvent(new Event(CONTACT_DIRECTORY_CHANGED_EVENT)));
    expect(container.textContent).not.toContain(privateA.person);
    await tick();
    expect(directoryCalls()).toHaveLength(2);
    expect(container.textContent).not.toContain(privateA.person);
  });
});

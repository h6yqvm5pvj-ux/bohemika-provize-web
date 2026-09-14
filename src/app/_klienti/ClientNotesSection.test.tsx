// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientNote } from "./clientNotes";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), query: "" }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mocks.query) }));

import { ClientNotesSection } from "./ClientNotesSection";

const user = { uid: "user-one", email: "advisor@example.test" } as User;
const note: ClientNote = {
  id: "note-1", kind: "call", text: "Čekáme na podklady.", authorEmail: user.email!,
  createdAtMs: Date.parse("2026-09-01T10:00:00Z"), updatedAtMs: Date.parse("2026-09-01T10:00:00Z"),
  revision: 1, reminderEnabled: false, reminderAtMs: null, reminderSentAtMs: null,
};
let container: HTMLDivElement;
let root: Root;
const page = (notes: ClientNote[] = []) => ({ ok: true, notes, nextCursor: null, focusedNote: null });
const render = async () => { await act(async () => root.render(<ClientNotesSection user={user} slug="test-client" clientName="Testovací klient" />)); };
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === text)!;
const click = async (element: Element) => { expect(element).toBeTruthy(); await act(async () => (element as HTMLElement).click()); };
const enter = async (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};
const submit = async () => { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); };

beforeEach(() => {
  vi.resetAllMocks(); mocks.query = "";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.fetch.mockResolvedValue(page());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("client history UI", () => {
  it("records a meeting and an optional reminder in the same save", async () => {
    await render();
    expect(container.textContent).toContain("Zatím žádné zápisy");
    await click(button("Přidat zápis"));
    expect(document.activeElement).toBe(container.querySelector("textarea"));
    await enter(container.querySelector("select")!, "meeting");
    await enter(container.querySelector("textarea")!, "Domluvena kontrola nabídky.");
    await click(container.querySelector('input[type="checkbox"]')!);
    const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await enter(container.querySelector('input[type="date"]')!, date);
    mocks.fetch.mockResolvedValueOnce({ ok: true, note: { ...note, kind: "meeting", text: "Domluvena kontrola nabídky.", reminderEnabled: true, reminderAtMs: Date.parse(`${date}T07:45:00Z`) } });
    await submit();
    const options = mocks.fetch.mock.calls.at(-1)![2];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toMatchObject({ kind: "meeting", text: "Domluvena kontrola nabídky.", reminderEnabled: true, reminderAtMs: Date.parse(`${date}T07:45:00Z`), expectedRevision: 0 });
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("Zápis a připomínka byly uloženy.");
    expect(container.querySelector("article")?.textContent).toContain("Schůzka");
  });

  it("edits an existing note and turns off its reminder", async () => {
    mocks.fetch.mockResolvedValueOnce(page([{ ...note, reminderEnabled: true, reminderAtMs: Date.now() + 86_400_000 }]));
    await render();
    await click(container.querySelector('button[aria-label="Upravit zápis"]')!);
    await click(container.querySelector('input[type="checkbox"]')!);
    await enter(container.querySelector("textarea")!, "Podklady dorazily.");
    mocks.fetch.mockResolvedValueOnce({ ok: true, note: { ...note, text: "Podklady dorazily.", revision: 2 } });
    await submit();
    const options = mocks.fetch.mock.calls.at(-1)![2];
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toMatchObject({ noteId: note.id, expectedRevision: 1, reminderEnabled: false, reminderAtMs: null });
    expect(container.querySelector("article")?.textContent).toContain("Podklady dorazily.");
  });

  it("preserves the draft on save failure so the user can retry", async () => {
    await render(); await click(button("Přidat zápis"));
    await enter(container.querySelector("textarea")!, "Důležitý zápis.");
    mocks.fetch.mockRejectedValueOnce(new Error("Uložení se nezdařilo."));
    await submit();
    expect(container.querySelector("textarea")?.value).toBe("Důležitý zápis.");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Uložení se nezdařilo.");
    const firstId = JSON.parse(mocks.fetch.mock.calls.at(-1)![2].body).noteId;
    mocks.fetch.mockResolvedValueOnce({ ok: true, note });
    await submit();
    expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![2].body).noteId).toBe(firstId);
  });

  it("requires an explicit delete confirmation", async () => {
    mocks.fetch.mockResolvedValueOnce(page([note]));
    await render();
    await click(container.querySelector('button[aria-label="Smazat zápis"]')!);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await click(button("Zrušit"));
    expect(container.querySelector("article")).not.toBeNull();
    await click(container.querySelector('button[aria-label="Smazat zápis"]')!);
    mocks.fetch.mockResolvedValueOnce({ ok: true });
    await click(button("Smazat"));
    expect(mocks.fetch.mock.calls.at(-1)![2].method).toBe("DELETE");
    expect(container.querySelector("article")).toBeNull();
    expect(container.textContent).toContain("Zápis byl smazán včetně případné připomínky.");
  });

  it("opens an older linked note and highlights/focuses it even beyond the first page", async () => {
    mocks.query = "noteId=old-note";
    const focused = { ...note, id: "old-note", text: "Starší telefonát", createdAtMs: 1 };
    mocks.fetch.mockResolvedValueOnce({ ...page(Array.from({ length: 5 }, (_, index) => ({ ...note, id: `new-${index}` }))), focusedNote: focused });
    await render();
    expect(mocks.fetch.mock.calls[0][1]).toContain("?noteId=old-note");
    expect(container.querySelectorAll("article")).toHaveLength(6);
    expect(document.activeElement?.textContent).toContain("Starší telefonát");
    expect(document.activeElement?.textContent).toContain("Otevřeno z notifikace");
  });

  it("reports a deleted notification target without displaying another note as its target", async () => {
    mocks.query = "noteId=deleted-note";
    mocks.fetch.mockResolvedValueOnce(page([note]));
    await render();
    expect(container.textContent).toContain("Zápis z notifikace už není dostupný");
    expect(container.textContent).not.toContain("Otevřeno z notifikace");
  });

  it("loads older history without duplicating an existing note", async () => {
    mocks.fetch.mockResolvedValueOnce({ ...page(Array.from({ length: 4 }, (_, index) => ({ ...note, id: `note-${index}` }))), nextCursor: "note-3" });
    await render();
    expect(container.querySelectorAll("article")).toHaveLength(3);
    await click(button("Zobrazit historii"));
    mocks.fetch.mockResolvedValueOnce(page([{ ...note, id: "note-3" }, { ...note, id: "older" }]));
    await click(button("Načíst starší zápisy"));
    expect(mocks.fetch.mock.calls.at(-1)![1]).toContain("?before=note-3");
    expect(container.querySelectorAll("article")).toHaveLength(5);
  });

  it("aborts requests when leaving the client card", async () => {
    mocks.fetch.mockImplementationOnce(() => new Promise(() => undefined));
    await render();
    const signal = mocks.fetch.mock.calls[0][2].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
  });
});

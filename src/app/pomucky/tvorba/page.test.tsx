// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openVault: vi.fn(), disposeVault: vi.fn(), impersonation: null as { email: string } | null, exportPdf: vi.fn(), download: vi.fn(), readDraft: vi.fn(), writeDraft: vi.fn(), auth: { currentUser: null as { uid: string; email: string } | null }, onAuth: (user: { uid: string; email: string } | null) => { void user; } }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/image", () => ({ default: () => <span /> }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: (_: unknown, callback: (user: { uid: string; email: string } | null) => void) => { mocks.onAuth = callback; callback(mocks.auth.currentUser); return () => {}; } }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ effectiveUserEmail: (email: string) => email, useEffectiveUserEmail: (email?: string) => mocks.impersonation?.email || email || null, useAdminImpersonationState: () => mocks.impersonation }));
vi.mock("@/app/lib/adminImpersonation", () => ({ resolveUserProfilePatchRequest: () => ({ url: "/profile", headers: {} }) }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("./documentPdf", () => ({ createDocumentPdf: mocks.exportPdf, downloadPdfUrl: mocks.download }));
vi.mock("./documentDraft", () => ({ openDocumentDraftVault: mocks.openVault }));

import TvorbaPage from "./page";
let container: HTMLDivElement;
let root: Root;
const button = (name: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
const click = async (name: string) => { await act(async () => button(name).click()); };
const editor = () => container.querySelector<HTMLElement>("[data-editor-frame]")!;

beforeEach(async () => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.readDraft.mockResolvedValue(null);
  mocks.writeDraft.mockResolvedValue(undefined);
  mocks.auth.currentUser = { uid: "test-author", email: "author@example.cz" };
  mocks.impersonation = null;
  mocks.openVault.mockImplementation(async (user: { uid: string }) => ({
    read: () => mocks.readDraft(user.uid), write: (draft: unknown) => mocks.writeDraft(user.uid, draft), dispose: mocks.disposeVault,
  }));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { callback(0); return 1; });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  mocks.exportPdf.mockResolvedValue(new Blob(["test-pdf"], { type: "application/pdf" }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<TvorbaPage />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("document pages", () => {
  it("unmounts private document content on sign-out and during impersonation", async () => {
    editor().innerHTML = "<p>Soukromé informace</p>";
    await act(async () => { mocks.auth.currentUser = null; mocks.onAuth(null); });
    expect(container.querySelector("[data-editor-frame]")).toBeNull();
    expect(container.textContent).not.toContain("Soukromé informace");
    mocks.openVault.mockClear();
    await act(async () => {
      mocks.impersonation = { email: "victim@example.cz" };
      mocks.auth.currentUser = { uid: "admin-uid", email: "admin@example.cz" }; mocks.onAuth(mocks.auth.currentUser);
    });
    expect(container.textContent).toContain("Ukonči režim zastoupení");
    expect(mocks.openVault).not.toHaveBeenCalled();
  });

  it("does not overwrite a saved draft after an unlock or read failure", async () => {
    await act(async () => root.unmount());
    mocks.writeDraft.mockClear();
    mocks.openVault.mockRejectedValueOnce(new Error("Ověření autora selhalo"));
    root = createRoot(container);
    await act(async () => root.render(<TvorbaPage />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Ověření autora selhalo");
    expect(mocks.writeDraft).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLElement>("[inert]")?.style.visibility).toBe("hidden");
    await click("Zkusit načíst znovu");
    expect(container.querySelector("[inert]")).toBeNull();
  });
  it("saves current DOM edits and page settings, then restores the full draft after remount", async () => {
    editor().innerHTML = "<h2>Uložený nadpis</h2><p><strong>Formátovaný text</strong></p>";
    await click("Přidat stranu");
    editor().innerHTML = "<p>Druhá rozepsaná strana</p>";
    await click("Uložit koncept");
    const saved = mocks.writeDraft.mock.calls.at(-1)![1];
    expect(saved.pages.map((page: { html: string }) => page.html)).toEqual(["<h2>Uložený nadpis</h2><p><strong>Formátovaný text</strong></p>", "<p>Druhá rozepsaná strana</p>"]);
    expect(saved).not.toHaveProperty("password");
    await act(async () => root.unmount());
    mocks.readDraft.mockResolvedValue(saved);
    root = createRoot(container);
    await act(async () => root.render(<TvorbaPage />));
    expect(editor().textContent).toBe("Druhá rozepsaná strana");
    await click("Strana 1");
    expect(editor().querySelector("strong")?.textContent).toBe("Formátovaný text");
    expect(container.textContent).toContain("Navazuješ na uložený dokument");
  });

  it("keeps editing available after a storage failure and retries saving", async () => {
    mocks.writeDraft.mockRejectedValueOnce(new Error("Quota exceeded"));
    await act(async () => { editor().innerHTML = "<p>Obsah nesmí zmizet</p>"; });
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(container.textContent).toContain("Koncept se nepodařilo uložit");
    expect(editor().textContent).toBe("Obsah nesmí zmizet");
    await click("Zkusit uložit znovu");
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(container.querySelector('[data-draft-status="saved"]')).not.toBeNull();
  });

  it("keeps drafts separate when the effective user changes", async () => {
    const stored = new Map();
    mocks.readDraft.mockImplementation(async owner => stored.get(owner) || null);
    mocks.writeDraft.mockImplementation(async (owner, value) => { stored.set(owner, value); });
    const signIn = async (email: string) => {
      await act(async () => { mocks.auth.currentUser = { uid: email, email }; mocks.onAuth(mocks.auth.currentUser); });
    };
    await signIn("first@example.cz");
    editor().innerHTML = "<p>Soukromý koncept prvního uživatele</p>";
    await click("Uložit koncept");
    await signIn("second@example.cz");
    expect(editor().textContent).not.toContain("Soukromý koncept");
    editor().innerHTML = "<p>Dokument druhého uživatele</p>";
    await click("Uložit koncept");
    await signIn("first@example.cz");
    expect(editor().textContent).toBe("Soukromý koncept prvního uživatele");
    expect(stored.get("second@example.cz").pages[0].html).toBe("<p>Dokument druhého uživatele</p>");
  });

  it("requires the new-document action and can restore the previous pages", async () => {
    editor().innerHTML = "<p>Původní dokument</p>";
    await click("Nový dokument");
    await click("Zrušit");
    expect(editor().textContent).toBe("Původní dokument");
    await click("Nový dokument");
    await click("Vytvořit prázdný");
    expect(editor().textContent).toBe("");
    await click("Vrátit předchozí dokument");
    expect(editor().textContent).toBe("Původní dokument");
  });
  it("preserves edited HTML through adding, duplicating, reordering, deleting and restoring pages", async () => {
    editor().innerHTML = "<h2>První</h2><p><strong>Tučný text</strong></p>";
    await click("Přidat stranu");
    expect(editor().textContent).toBe("");
    editor().innerHTML = "<p>Druhá</p>";
    await click("Duplikovat");
    expect(editor().textContent).toBe("Druhá");
    editor().innerHTML = "<p>Třetí</p>";
    await click("Posunout stranu doleva");
    expect(editor().getAttribute("aria-label")).toBe("Obsah strany 2");
    await click("Smazat aktuální stranu");
    expect(editor().textContent).toBe("Druhá");
    editor().innerHTML = "<p>Upravená druhá</p>";
    await click("Vrátit zpět");
    expect(editor().textContent).toBe("Třetí");
    await click("Strana 1");
    expect(editor().innerHTML).toBe("<h2>První</h2><p><strong>Tučný text</strong></p>");
    await click("Strana 3");
    expect(editor().textContent).toBe("Upravená druhá");
  });

  it("exports current unsaved edits together with other pages and exposes a reusable download", async () => {
    editor().innerHTML = "<p>První verze</p>";
    await click("Přidat stranu");
    editor().innerHTML = "<p>Druhá strana</p>";
    await click("Strana 1");
    editor().innerHTML = "<p>Poslední změna před exportem</p>";
    await click("Stáhnout PDF");
    expect(mocks.exportPdf).toHaveBeenCalledTimes(1);
    expect(mocks.exportPdf.mock.calls[0][0].pages.map((page: { html: string }) => page.html)).toEqual(["<p>Poslední změna před exportem</p>", "<p>Druhá strana</p>"]);
    expect(mocks.download).toHaveBeenCalledWith("blob:pdf-test", "Nový dokument.pdf");
    expect(container.querySelector('a[download]')?.getAttribute("href")).toBe("blob:pdf-test");
    expect(container.textContent).toContain("PDF je připravené");
  });

  it("allows retry after an export error without losing document content", async () => {
    editor().innerHTML = "<p>Rozpracovaný dokument</p>";
    mocks.exportPdf.mockRejectedValueOnce(new Error("Text na straně 1 přesahuje formát A4."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await click("Stáhnout PDF");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("přesahuje");
    expect(editor().textContent).toBe("Rozpracovaný dokument");
    expect(button("Stáhnout PDF").disabled).toBe(false);
    await click("Stáhnout PDF");
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("exports the current contact data and lets the advisor remove the QR from the document", async () => {
    const enter = async (label: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await click("Moje vizitka");
    await enter("Jméno a příjmení", "Petra Nováková");
    await enter("Mobil", "+420 777 123 456");
    await enter("E-mail", "nova@example.cz");
    await click("Zavřít nastavení PDF");
    expect(container.querySelector("[data-contact-qr]")).not.toBeNull();
    await click("Stáhnout PDF");
    expect(mocks.exportPdf.mock.calls[0][0].contact.payload).toContain("FN:Petra Nováková");
    expect(mocks.exportPdf.mock.calls[0][0].contact.payload).toContain("nova@example.cz");
    await click("Moje vizitka");
    await act(async () => container.querySelector<HTMLInputElement>('[role="dialog"] input[type="checkbox"]')!.click());
    await click("Zavřít nastavení PDF");
    expect(container.querySelector("[data-contact-qr]")).toBeNull();
    await click("Stáhnout PDF");
    expect(mocks.exportPdf.mock.calls[1][0].contact).toBeNull();
  });
});

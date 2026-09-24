// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => { void prefetch; return <a {...props}>{children}</a>; } }));
vi.mock("next/image", () => ({ default: () => <span aria-hidden="true" /> }));
vi.mock("@/components/ProfileAvatar", () => ({ ProfileAvatar: () => <span>Avatar</span> }));
vi.mock("@/app/_klienti/clientFeature", () => ({ CLIENT_CARDS_ENABLED: true }));
vi.mock("@/app/_provizni-vypisy/statementFeature", () => ({ COMMISSION_STATEMENTS_ENABLED: true }));

import { AppNavigation } from "./AppNavigation";

type Props = ComponentProps<typeof AppNavigation>;
const labels: Props["navLabels"] = {
  home: "Domů", intranet: "Intranet", calc: "Přidat smlouvu", clients: "Klienti",
  contracts: "Smlouvy", cashflow: "Provizní kalendář", statements: "Provizní výpisy",
  team: "Můj tým", hall: "Síň slávy", tools: "Pomůcky", tips: "Tipy", settings: "Nastavení", admin: "Admin",
};
const storageKey = "bohemka.sidebar.collapsed";
let root: Root;
let container: HTMLDivElement;
let props: Props;
const render = async (patch: Partial<Props> = {}) => {
  props = { ...props, ...patch };
  await act(async () => root.render(<AppNavigation {...props} />));
};
const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => (element as HTMLElement).click());
};
const sidebar = () => container.querySelector("aside")!;
const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-controls="desktop-navigation"]')!;
const resetPreference = async (value: string | null) => {
  if (value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, value);
  await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: storageKey, newValue: value })));
};

beforeEach(async () => {
  vi.restoreAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  props = {
    active: "contracts", navLabels: labels, logoutLabel: "Odhlásit se", hasUser: true,
    userEmail: "advisor@example.test", userAvatar: "", hasTeam: true, hasTipsters: true,
    isAdminRequestsUser: false, canAccessAdminArea: false, isTipsterAccount: false,
    isProfilePending: false, timelineSetupGateActive: false, mobileMenuOpen: false,
    shellFontClass: "", onToggleMobileMenu: vi.fn(), onCloseMobileMenu: vi.fn(), onLogout: vi.fn(),
    children: <article>Obsah stránky</article>,
  };
  await resetPreference(null);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("collapsible application navigation", () => {
  it("shows the unread count in expanded, collapsed and mobile navigation with an accessible label", async () => {
    await render({ intranetUnreadCount: 7, active: "intranet" });
    const link = () => sidebar().querySelector('a[href="/intranet"]')!;
    expect(link().textContent).toBe("Intranet7");
    expect(link().getAttribute("aria-label")).toBe("Intranet – nepřečtené příspěvky: 7");
    await click(toggle());
    expect(link().textContent).toBe("Intranet7");
    expect(link().getAttribute("aria-current")).toBe("page");
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    await render({ mobileMenuOpen: true });
    expect(container.querySelector('#mobile-navigation a[href="/intranet"]')?.textContent).toBe("Intranet7");
  });

  it("caps the visible badge at 99+ and removes it when all posts are read", async () => {
    await render({ intranetUnreadCount: 123 });
    const link = () => sidebar().querySelector('a[href="/intranet"]')!;
    expect(link().textContent).toBe("Intranet99+");
    expect(link().getAttribute("aria-label")).toContain("123");
    for (const intranetUnreadCount of [0, null, -2, NaN]) {
      await render({ intranetUnreadCount });
      expect(link().textContent).toBe("Intranet");
      expect(link().getAttribute("aria-label")).toBe("Intranet");
    }
    await render({ hasUser: false, intranetUnreadCount: 5 });
    expect(link().textContent).toBe("Intranet");
  });

  it("collapses, preserves the active accessible link, and restores the preference after a remount", async () => {
    await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await click(toggle());
    expect(sidebar().getAttribute("data-collapsed")).toBe("true");
    expect(localStorage.getItem(storageKey)).toBe("1");
    expect(sidebar().querySelector('a[aria-current="page"]')?.getAttribute("aria-label")).toBe("Smlouvy");
    await act(async () => root.render(null));
    await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    await click(toggle());
    expect(localStorage.getItem(storageKey)).toBe("0");
    expect(container.textContent).toContain("Obsah stránky");
  });

  it("restores and synchronizes the saved device preference, including clearing it", async () => {
    await resetPreference("1"); await render();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    await resetPreference("0");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await resetPreference("1"); await resetPreference(null);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("still toggles and navigates when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await render();
    const initial = toggle().getAttribute("aria-expanded");
    await click(toggle());
    expect(toggle().getAttribute("aria-expanded")).not.toBe(initial);
    await act(async () => root.render(null)); await render();
    expect(toggle().getAttribute("aria-expanded")).not.toBe(initial);
    expect(sidebar().querySelector('a[href="/smlouvy"]')).not.toBeNull();
  });

  it("keeps role visibility, profile loading, and setup restrictions in both modes", async () => {
    await render({ hasTipsters: false }); await click(toggle());
    expect(sidebar().querySelector('a[href="/admin/zadosti"]')).toBeNull();
    expect(sidebar().querySelector('a[href="/tipy"]')).toBeNull();
    expect(sidebar().querySelector('a[href="/sin-slavy"]')).not.toBeNull();
    await render({ canAccessAdminArea: true });
    expect(sidebar().querySelector('a[href="/admin/zadosti"]')).not.toBeNull();
    await render({ timelineSetupGateActive: true });
    expect(sidebar().querySelector('a[href="/smlouvy"]')).toBeNull();
    expect(sidebar().querySelector('a[href="/nastaveni"]')).not.toBeNull();
    await render({ timelineSetupGateActive: false, isTipsterAccount: true });
    expect([...sidebar().querySelectorAll('nav a')].map(a => a.getAttribute("href"))).toEqual(["/", "/tipy", "/cashflow"]);
    await render({ isProfilePending: true });
    expect(sidebar().querySelectorAll("nav a").length).toBe(0);
  });

  it("opens clients for advisers, retains the statements gate and logout action", async () => {
    await render(); await click(toggle());
    await click(sidebar().querySelector('a[href="/klienti"]'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await click(sidebar().querySelector('a[href="/provizni-vypisy"]'));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Sekce je v přípravě");
    await click(sidebar().querySelector('button[aria-label="Odhlásit se"]'));
    expect(props.onLogout).toHaveBeenCalledOnce();
  });

  it("opens statements for the selected Hajek account in desktop and mobile navigation", async () => {
    await render({ userEmail: "jindra.hajek@bohemika.eu" });
    await click(sidebar().querySelector('a[href="/provizni-vypisy"]'));
    expect(container.querySelector('[aria-labelledby="preparation-section-dialog-title"]')).toBeNull();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    await render({ mobileMenuOpen: true });
    await click(container.querySelector('#mobile-navigation a[href="/provizni-vypisy"]'));
    expect(props.onCloseMobileMenu).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-labelledby="preparation-section-dialog-title"]')).toBeNull();
  });

  it("retains the statements gate for the other Hajek account", async () => {
    await render({ userEmail: "jindrich.hajek@bohemika.eu" });
    await click(sidebar().querySelector('a[href="/provizni-vypisy"]'));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Sekce je v přípravě");
  });

  it("shows keyboard tooltips and dismisses them on Escape or scrolling", async () => {
    await render(); await click(toggle());
    const link = sidebar().querySelector<HTMLAnchorElement>('a[href="/smlouvy"]')!;
    await act(async () => link.focus());
    expect([...document.body.querySelectorAll('span[aria-hidden="true"]')].some(e => e.textContent === "Smlouvy")).toBe(true);
    await act(async () => link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect([...document.body.querySelectorAll('span[aria-hidden="true"]')].some(e => e.textContent === "Smlouvy")).toBe(false);
    await act(async () => { link.blur(); link.focus(); });
    await act(async () => window.dispatchEvent(new Event("scroll")));
    expect([...document.body.querySelectorAll('span[aria-hidden="true"]')].some(e => e.textContent === "Smlouvy")).toBe(false);
  });

  it("keeps the mobile menu full and traps keyboard focus, then restores it on close", async () => {
    await render(); await click(toggle());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const previousOverflow = document.body.style.overflow;
    await render({ mobileMenuOpen: true, onCloseMobileMenu: () => { void render({ mobileMenuOpen: false }); } });
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Provizní kalendář");
    expect(dialog.hasAttribute("data-collapsed")).toBe(false);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Zavřít menu");
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement?.textContent).toContain("Odhlásit se");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Otevřít menu");
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("renders embedded content without navigation", async () => {
    await render({ embedded: true, children: "Embedded view" as ReactNode });
    expect(container.querySelector("aside")).toBeNull();
    expect(container.textContent).toBe("Embedded view");
  });
});

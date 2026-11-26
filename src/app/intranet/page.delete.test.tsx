// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import IntranetPage from "./page";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  user: { email: "owner@example.test" },
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, onChange: (user: typeof mocks.user) => void) => {
    onChange(mocks.user);
    return () => {};
  },
}));
vi.mock("@/app/firebase", () => ({ auth: {} }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: mocks.fetch }));
vi.mock("@/app/lib/useAdminImpersonation", () => ({ useEffectiveUserEmail: (email?: string) => email ?? "" }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/ProfileAvatar", () => ({ ProfileAvatar: () => null }));
vi.mock("@/components/PdfDocumentPreview", () => ({ PdfDocumentPreview: () => null }));
vi.mock("@/lib/fonts", () => ({ systemSansFont: { className: "" } }));

const fixture = {
  section: "obecne",
  sectionLabel: "Obecné",
  text: "Testovací text příspěvku.",
  attachments: [],
  comments: [],
};
const own = { ...fixture, id: "own", title: "Vlastní příspěvek", author: { email: mocks.user.email, name: "Autor" } };
const other = { ...fixture, id: "other", title: "Cizí příspěvek", author: { email: "other@example.test", name: "Kolega" } };

it("retains the feed and allows retry when deleting a post fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("confirm", () => true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const errorMessage = "Nepodařilo se smazat příspěvek.";
  let removed = false;
  const remove = vi.fn().mockRejectedValueOnce(new Error(errorMessage)).mockImplementationOnce(async () => {
    removed = true;
    return { ok: true };
  });
  mocks.fetch.mockImplementation((_user, url, options) => {
    if (options?.method === "DELETE") return remove(url);
    return Promise.resolve({ ok: true, posts: removed ? [other] : [own, other] });
  });

  try {
    await act(async () => root.render(<IntranetPage />));
    const deleteButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Smazat příspěvek"]')!;
    expect(container.querySelectorAll('button[aria-label="Smazat příspěvek"]')).toHaveLength(1);

    await act(async () => deleteButton().click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(errorMessage);
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(deleteButton().disabled).toBe(false);

    await act(async () => deleteButton().click());
    expect(remove.mock.calls).toEqual([["/api/intranet/wall/own"], ["/api/intranet/wall/own"]]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("article")?.getAttribute("data-post-id")).toBe("other");
    expect(container.querySelectorAll("article")).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: "advisor-a", email: "a@example.test" } as User | null },
  beforeAuth: vi.fn(), onAuth: vi.fn(), impersonation: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ beforeAuthStateChanged: mocks.beforeAuth, onAuthStateChanged: mocks.onAuth }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_EVENT: "admin-impersonation:changed",
  ADMIN_IMPERSONATION_STORAGE_KEY: "admin_impersonation_v1",
  readAdminImpersonationState: mocks.impersonation,
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../plan-produkce/SplitTitle", () => ({ default: ({ text }: { text: string }) => <span>{text}</span> }));
vi.mock("@/app/lib/secureDocuments", () => ({ useSecureDocumentBlob: () => ({ blob: null, url: null, loading: false, error: null }) }));
vi.mock("@/app/lib/userProfileCache", () => ({ getUserProfileCached: vi.fn().mockResolvedValue({ ok: true, profile: {} }) }));

import ContractTerminationPage from "./page";
import { ContractTerminationPrivacyCleanup } from "@/components/ContractTerminationPrivacyCleanup";
import { clearServerSession } from "@/app/lib/authSession";
import { getContractTerminationContext, setContractTerminationIdentity } from "@/app/lib/contractTerminationPrivacy";
import { normalizeContractTerminationPrefill, storeContractTerminationPrefill } from "./contractTerminationPrefill";

let root: Root;
let container: HTMLDivElement;
let beforeAuth: (user: User | null) => void;
let onAuth: (user: User | null) => void;
const payload = normalizeContractTerminationPrefill({
  sourcePath: "/smlouvy/synthetic", contractNumber: "SYNTHETIC-001", policyholderName: "Synthetic Client",
  personalId: "SYNTHETIC-ID", address: "Synthetic address", insurer: "Allianz", insuranceType: "nonLife", reason: "periodEnd",
})!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  mocks.auth.currentUser = { uid: "advisor-a", email: "a@example.test" } as User;
  mocks.impersonation.mockReturnValue(null);
  mocks.beforeAuth.mockImplementation((_auth, listener) => { beforeAuth = listener; return vi.fn(); });
  mocks.onAuth.mockImplementation((_auth, listener) => {
    onAuth = listener;
    listener(mocks.auth.currentUser);
    return vi.fn();
  });
  sessionStorage.clear();
  localStorage.clear();
  setContractTerminationIdentity(null);
  setContractTerminationIdentity("advisor-a");
  window.history.replaceState(null, "", "/pomucky/vypoved-smlouvy");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  setContractTerminationIdentity(null);
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function preparePrefill() {
  const key = storeContractTerminationPrefill(payload, getContractTerminationContext()!);
  expect(key).toBeTruthy();
  window.history.replaceState(null, "", `/pomucky/vypoved-smlouvy?prefill=${key}&embedded=1`);
}
async function mount() {
  await act(async () => root.render(<><ContractTerminationPrivacyCleanup /><ContractTerminationPage /></>));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
function field(key: string) {
  return container.querySelector<HTMLInputElement>(`[data-letter-field="${key}"]`);
}
function expectNoPrivateFields() {
  expect(container.textContent).not.toContain(payload.policyholderName);
  expect(container.textContent).not.toContain(payload.contractNumber);
  expect([...container.querySelectorAll("input")].some((input) => [payload.policyholderName, payload.personalId].includes(input.value))).toBe(false);
}

describe("termination form privacy across browser and auth events", () => {
  it("fills the actual letter from memory and removes the one-time URL key", async () => {
    preparePrefill();
    await mount();
    expect(field("policyholderName")?.value).toBe(payload.policyholderName);
    expect(field("personalId")?.value).toBe(payload.personalId);
    expect(window.location.search).not.toContain("prefill=");
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes loaded client details as soon as logout starts, even before an offline response", async () => {
    preparePrefill();
    await mount();
    expect(field("policyholderName")?.value).toBe(payload.policyholderName);
    const response = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValue(response.promise);
    let logout: Promise<void>;
    await act(async () => { logout = clearServerSession(); });
    expectNoPrivateFields();
    await act(async () => {
      response.reject(new Error("Synthetic offline error"));
      await expect(logout!).rejects.toThrow("Synthetic offline error");
    });
    expectNoPrivateFields();
  });

  it.each(["advisor-b", null])("clears the form on Firebase identity change to %s", async (uid) => {
    preparePrefill();
    await mount();
    const next = uid ? { uid, email: "b@example.test" } as User : null;
    await act(async () => { beforeAuth(next); });
    expectNoPrivateFields();
    await act(async () => { mocks.auth.currentUser = next; onAuth(next); });
    expectNoPrivateFields();
  });

  it("clears the form when the administrator changes impersonation", async () => {
    preparePrefill();
    await mount();
    await act(async () => {
      mocks.impersonation.mockReturnValue({ email: "represented@example.test" });
      window.dispatchEvent(new Event("admin-impersonation:changed"));
    });
    expectNoPrivateFields();
  });

  it("preserves the filled form for an ordinary auth callback of the same user", async () => {
    preparePrefill();
    await mount();
    await act(async () => { onAuth(mocks.auth.currentUser); });
    expect(field("policyholderName")?.value).toBe(payload.policyholderName);
  });

  it("clears before a history snapshot and reloads a restored page before revealing a form", async () => {
    preparePrefill();
    await mount();
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expectNoPrivateFields();
    await act(async () => {
      onAuth(mocks.auth.currentUser);
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(reload).toHaveBeenCalledOnce();
    expectNoPrivateFields();
  });

  it("removes old copies at startup and on writes from an old embedded page without reading them", async () => {
    const key = "bohemika:contract-termination-prefill:legacy";
    sessionStorage.setItem(key, "synthetic private data");
    localStorage.setItem("unrelated-preference", "keep");
    await mount();
    expect(sessionStorage.getItem(key)).toBeNull();
    sessionStorage.setItem(key, "new legacy copy");
    await act(async () => { window.dispatchEvent(Object.assign(new Event("storage"), { key })); });
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem("unrelated-preference")).toBe("keep");
    expectNoPrivateFields();
  });
});

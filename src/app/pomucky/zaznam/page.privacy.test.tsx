// @vitest-environment happy-dom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  beforeAuth: vi.fn(), onAuth: vi.fn(), impersonation: vi.fn(), push: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ beforeAuthStateChanged: mocks.beforeAuth, onAuthStateChanged: mocks.onAuth }));
vi.mock("@/app/firebase-auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/adminImpersonation", () => ({
  ADMIN_IMPERSONATION_EVENT: "admin-impersonation:changed",
  ADMIN_IMPERSONATION_STORAGE_KEY: "admin_impersonation_v1",
  readAdminImpersonationState: mocks.impersonation,
}));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/app/lib/secureDocuments", () => ({
  SECURE_DOCUMENT_FILE_NAMES: {},
  useSecureDocumentBlob: () => ({ blob: null, url: null, loading: false, error: null }),
}));

import RecordPage from "./page";
import LifeResultsPage from "./vysledky/page";
import CarResultsPage from "./vysledky-auto/page";
import { MeetingRecordPrivacyCleanup } from "@/components/MeetingRecordPrivacyCleanup";
import { clearServerSession } from "@/app/lib/authSession";
import { getMeetingRecordContext, readMeetingRecord, setMeetingRecordIdentity, writeMeetingRecord } from "@/app/lib/meetingRecordPrivacy";

let root: Root;
let container: HTMLDivElement;
let beforeAuth: (user: User | null) => void;
let onAuth: (user: User | null) => void;
const pages = ["form", "life-results", "car-results"] as const;
type Page = typeof pages[number];
const lifeText = "Klientovi bylo vysvětleno, proč by měl mít připojištěnou invaliditu";
const carText = "Klient si přeje využít slevu na neoriginální sklo.";
const hasInput = () => [...container.querySelectorAll("input")].some((input) => input.value === "987654");

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request")));
  mocks.auth.currentUser = { uid: "advisor-a", email: "a@example.test" } as User;
  mocks.impersonation.mockReturnValue(null);
  mocks.beforeAuth.mockImplementation((_auth, listener) => { beforeAuth = listener; return vi.fn(); });
  mocks.onAuth.mockImplementation((_auth, listener) => { onAuth = listener; listener(mocks.auth.currentUser); return vi.fn(); });
  sessionStorage.clear(); localStorage.clear();
  setMeetingRecordIdentity(null); setMeetingRecordIdentity("advisor-a");
  const owner = getMeetingRecordContext()!;
  writeMeetingRecord("lifeDraft", { deathOn: true, deathAmount: "987654" }, owner);
  writeMeetingRecord("lifeResults", { hasInvalidity: false, totalInvalidity: 0, selectedBenefits: [] }, owner);
  writeMeetingRecord("carResults", { hasLiability: true, liabilityLimit: "50 / 50 mil. Kč", discountUniqaNonOemGlass: true }, owner);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  setMeetingRecordIdentity(null); container.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function mount(page: Page) {
  await act(async () => root.render(<><MeetingRecordPrivacyCleanup />{
    page === "form" ? <RecordPage /> : page === "life-results" ? <LifeResultsPage /> : <CarResultsPage />
  }</>));
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
}
function expectInput(page: Page) {
  if (page === "form") expect(hasInput()).toBe(true);
  else expect(container.textContent).toContain(page === "life-results" ? lifeText : carText);
}
function expectNoInput() {
  expect(hasInput()).toBe(false);
  expect(container.textContent).not.toContain(lifeText);
  expect(container.textContent).not.toContain(carText);
}
async function clickButton(text: string) {
  const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}

describe("meeting form and result privacy", () => {
  it.each(pages)("clears displayed %s and stored inputs before a pending logout completes", async (page) => {
    await mount(page); expectInput(page);
    const response = Promise.withResolvers<Response>();
    vi.mocked(fetch).mockReturnValue(response.promise);
    let logout: Promise<void>;
    await act(async () => { logout = clearServerSession(); });
    expectNoInput(); expect(sessionStorage.length).toBe(0);
    await act(async () => {
      response.reject(new Error("Synthetic offline error"));
      await expect(logout!).rejects.toThrow("Synthetic offline error");
    });
    expectNoInput();
  });

  it.each(pages)("resets %s on direct account changes and never restores A's inputs to B", async (page) => {
    await mount(page); expectInput(page);
    const next = { uid: "advisor-b", email: "b@example.test" } as User;
    await act(async () => { beforeAuth(next); });
    expectNoInput();
    await act(async () => { mocks.auth.currentUser = next; onAuth(next); });
    expectNoInput(); expect(sessionStorage.length).toBe(0);
    await mount(page); expectNoInput();
  });

  it.each(pages)("hides %s before a history snapshot and requires reload on restoration", async (page) => {
    await mount(page); expectInput(page);
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expectNoInput();
    await act(async () => {
      onAuth(mocks.auth.currentUser);
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expectNoInput(); expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps a draft on an ordinary auth callback and resets it on impersonation change", async () => {
    await mount("form"); expectInput("form");
    await act(async () => { onAuth(mocks.auth.currentUser); });
    expectInput("form");
    await act(async () => {
      mocks.impersonation.mockReturnValue({ email: "represented@example.test" });
      window.dispatchEvent(new Event("admin-impersonation:changed"));
    });
    expectNoInput(); expect(sessionStorage.length).toBe(0);
  });

  it("writes actual form outputs for the current account and keeps the life draft for returning from results", async () => {
    await mount("form");
    await clickButton("Výsledky");
    const owner = getMeetingRecordContext()!;
    expect(mocks.push).toHaveBeenLastCalledWith("/pomucky/zaznam/vysledky");
    expect(readMeetingRecord("lifeDraft", owner)).toMatchObject({ deathAmount: "987654" });
    expect(readMeetingRecord("lifeResults", owner)).toMatchObject({ selectedBenefits: expect.arrayContaining([expect.objectContaining({ key: "death", amount: 987654 })]) });
    await mount("life-results");
    await mount("form"); expectInput("form");
    await clickButton("Vozidla");
    await clickButton("Výsledky");
    expect(mocks.push).toHaveBeenLastCalledWith("/pomucky/zaznam/vysledky-auto");
    expect(readMeetingRecord("carResults", owner)).toMatchObject({ hasLiability: true, discountUniqaNonOemGlass: false });
    expect(localStorage.length).toBe(0);
  });

  it("deletes unowned legacy inputs on startup and storage events without adopting them", async () => {
    setMeetingRecordIdentity(null);
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of ["lifeRecordFormDraft", "lifeRecordResultInput", "carRecord.resultsInput"]) storage.setItem(key, "legacy input");
      storage.setItem("unrelated-preference", "keep");
    }
    await mount("car-results"); expectNoInput();
    for (const storage of [sessionStorage, localStorage]) expect(storage.length).toBe(1);
    localStorage.setItem("carRecord.resultsInput", "new old-page write");
    await act(async () => { window.dispatchEvent(Object.assign(new Event("storage"), { key: "carRecord.resultsInput" })); });
    expect(localStorage.getItem("carRecord.resultsInput")).toBeNull();
  });
});

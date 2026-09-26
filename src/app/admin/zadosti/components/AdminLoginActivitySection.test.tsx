// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LoginActivity, LoginActivityResponse } from "@/lib/loginActivity";
const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/app/firebase", () => ({ auth: { currentUser: { uid: "admin" } } }));
vi.mock("@/app/lib/authenticatedApi", () => ({ fetchAuthedJsonOrThrow: state.fetch }));
import { AdminLoginActivitySection } from "./AdminLoginActivitySection";
const event: LoginActivity = { id: "one", occurredAtMs: Date.UTC(2026, 8, 26, 9), email: "test@example.test", identityVerified: true, outcome: "success", stage: "session", source: "web", country: "HU", city: "Budapest", ipLabel: "198.51.100.xxx", device: "Chrome", reason: "", locationObservedAtMs: Date.UTC(2026, 8, 26, 9), environment: "production" };
const data = (events = [event], nextCursor: string | null = null): LoginActivityResponse => ({ ok: true, events, nextCursor, fromMs: 1, checkedAtMs: Date.now(), retentionDays: 90, trackingStartedAtMs: 1 });
let root: Root, container: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.stubGlobal("React", React); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); state.fetch.mockResolvedValue(data()); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = async () => act(async () => root.render(<AdminLoginActivitySection />));
it("marks foreign activity and lets the admin filter unknown locations independently", async () => {
  state.fetch.mockResolvedValue(data([event, { ...event, id: "unknown", country: "", email: "unknown@example.test" }])); await render();
  expect(container.textContent).toContain("Maďarsko · zahraničí");
  const select = container.querySelector<HTMLSelectElement>('[aria-label="Původ přihlášení"]')!;
  await act(async () => { select.value = "unknown"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector("tbody")?.textContent).toContain("unknown@example.test"); expect(container.querySelector("tbody")?.textContent).not.toContain("Maďarsko");
});
it("shows load errors without claiming there were no login attempts", async () => {
  state.fetch.mockRejectedValue(new Error("Historie není dostupná")); await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Historie není dostupná");
  expect(container.textContent).not.toContain("žádný záznam neodpovídá");
});
it("loads older history and deduplicates records across pages", async () => {
  state.fetch.mockResolvedValueOnce(data([event], "next")).mockResolvedValueOnce(data([event, { ...event, id: "two", email: "older@example.test" }])); await render();
  const button = [...container.querySelectorAll("button")].find(b => b.textContent === "Načíst starší historii")!;
  await act(async () => button.click()); expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(state.fetch.mock.calls[1][1]).toContain("cursor=next");
});
it("labels browser-reported failures and unverified account ownership", async () => {
  state.fetch.mockResolvedValue(data([{ ...event, outcome: "reported_failure", source: "client_report", identityVerified: false }])); await render();
  const table = container.querySelector("tbody")!.textContent!; expect(table).toContain("Nahlášený neúspěch"); expect(table).toContain("vlastnictví neověřeno");
});

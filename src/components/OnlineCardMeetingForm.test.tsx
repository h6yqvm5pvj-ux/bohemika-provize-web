// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineCardMeetingForm } from "./OnlineCardMeetingForm";

let root: Root;
let container: HTMLDivElement;
const submit = vi.fn();
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  submit.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function send() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }

describe("one-step meeting form", () => {
  it("submits a name and phone without email, topic or message", async () => {
    await act(async () => root.render(<OnlineCardMeetingForm slug="advisor" onSubmitted={submit} />));
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(container.querySelector("textarea")?.required).toBe(false);
    await fill("fullName", "Jan Novák"); await fill("phone", "+420 777 000 111"); await send();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ fullName: "Jan Novák", preferredContact: "phone", phone: "+420 777 000 111", email: "", message: "", topics: [] });
    expect(submit).toHaveBeenCalledOnce();
  });
  it("sends only the selected email and preserves the product inquiry context", async () => {
    await act(async () => root.render(<OnlineCardMeetingForm slug="advisor" initialSelectedTopics={["life-accident"]} initialMessage="Kontrola smlouvy" onSubmitted={submit} />));
    await fill("fullName", "Jan Novák"); await fill("phone", "unfinished");
    await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"][value="email"]')!.click());
    expect(container.querySelector('input[type="tel"]')).toBeNull();
    await fill("email", "Jan@Example.test"); await send();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ preferredContact: "email", phone: "", email: "jan@example.test", message: "Kontrola smlouvy", topics: ["Životní a úrazové pojištění"] });
    expect(submit).toHaveBeenCalledOnce();
  });
  it("focuses an invalid phone and preserves the form after a delivery failure", async () => {
    await act(async () => root.render(<OnlineCardMeetingForm slug="advisor" onSubmitted={submit} />));
    await fill("fullName", "Jan Novák"); await fill("phone", "abcdef"); await send();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector('input[type="tel"]'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("telefonní číslo");
    await fill("phone", "+420777000111");
    fetchMock.mockRejectedValueOnce(new Error("Connection failed")); await send();
    expect(container.querySelector<HTMLInputElement>('[name="phone"]')?.value).toBe("+420777000111");
    expect(submit).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});

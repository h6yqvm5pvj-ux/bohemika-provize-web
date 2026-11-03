// @vitest-environment happy-dom
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { buildInteractiveStatementHtml } from "./statementPreview";

const setupPreview = (href: string, initialStyle = "display:none") => {
  document.body.innerHTML = `<a id="toggle"><strong>Rozbalit sekci</strong></a><div id="section" style="${initialStyle}">Syntetické položky</div>`;
  const link = document.getElementById("toggle")!;
  link.setAttribute("href", href);
  const preview = buildInteractiveStatementHtml("<html><head></head><body></body></html>");
  const script = [...preview.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1];
  const listeners: Array<EventListener> = [];
  const previewDocument = {
    getElementById: (id: string) => document.getElementById(id),
    addEventListener: (type: string, listener: EventListener) => {
      document.addEventListener(type, listener);
      listeners.push(listener);
    },
  };
  runInContext(script, createContext({ window: { getComputedStyle: window.getComputedStyle.bind(window) }, document: previewDocument }));
  cleanups.push(() => listeners.forEach(listener => document.removeEventListener("click", listener)));
  return { link, section: document.getElementById("section")! };
};

const cleanups: Array<() => void> = [];
const parentNonceScript = (nonce: string) => {
  const script = document.createElement("script");
  // happy-dom does not reflect the browser's nonce property onto the attribute.
  script.setAttribute("nonce", nonce);
  script.nonce = nonce;
  document.head.prepend(script);
  cleanups.push(() => script.remove());
  return script;
};
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  document.body.innerHTML = "";
});

describe("interactive statement sections", () => {
  it("authorizes only the fixed toggle script with the current document nonce", () => {
    parentNonceScript("synthetic-parent-document-nonce");
    const html = buildInteractiveStatementHtml('<html><head></head><body><script>untrustedFunction()</script><a onclick="untrustedHandler()">Imported content</a></body></html>');
    const preview = new DOMParser().parseFromString(html, "text/html");
    const scripts = [...preview.querySelectorAll("script")];
    expect(scripts).toHaveLength(2);
    expect(scripts[0].hasAttribute("nonce")).toBe(false);
    expect(scripts[1].getAttribute("nonce")).toBe("synthetic-parent-document-nonce");
    expect(scripts[1].textContent).toContain("window.toggleLayer");
    expect(preview.querySelector("a")?.hasAttribute("nonce")).toBe(false);
  });

  it("uses the existing hash fallback when the parent has no nonce", () => {
    const html = buildInteractiveStatementHtml("<html><body></body></html>");
    const preview = new DOMParser().parseFromString(html, "text/html");
    expect(preview.querySelector("script")?.hasAttribute("nonce")).toBe(false);
  });

  it("does not read an imported document nonce or interpolate invalid nonce markup", () => {
    parentNonceScript('invalid\" onload=\"untrustedFunction()');
    const html = buildInteractiveStatementHtml('<html><body><script nonce="imported-nonce">untrustedFunction()</script></body></html>');
    const preview = new DOMParser().parseFromString(html, "text/html");
    const trusted = [...preview.querySelectorAll("script")].at(-1)!;
    expect(trusted.hasAttribute("nonce")).toBe(false);
    expect(trusted.hasAttribute("onload")).toBe(false);
  });

  it.each([
    "javascript:toggleLayer('section');",
    'javascript:toggleLayer("section");',
  ])("toggles the section through the trusted delegated handler for %s", href => {
    const { link, section } = setupPreview(href);
    const click = () => link.querySelector("strong")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(section.style.display).toBe("none");
    expect(click()).toBe(false); // The javascript: URL must never execute.
    expect(section.style.display).toBe("block");
    expect(click()).toBe(false);
    expect(section.style.display).toBe("none");
  });

  it("collapses an initially visible section", () => {
    const { link, section } = setupPreview("javascript:toggleLayer('section');", "");
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(section.style.display).toBe("none");
  });

  it("does not evaluate additional JavaScript in a recognized link", () => {
    const { link, section } = setupPreview("javascript:toggleLayer('section'); untrustedFunction();");
    expect(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).not.toThrow();
    expect(section.style.display).toBe("block");
  });

  it("leaves unrelated links and absent sections unchanged", () => {
    const { link, section } = setupPreview("#section");
    expect(link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    expect(section.style.display).toBe("none");
    link.setAttribute("href", "javascript:toggleLayer('missing');");
    expect(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).not.toThrow();
    expect(section.style.display).toBe("none");
  });
});

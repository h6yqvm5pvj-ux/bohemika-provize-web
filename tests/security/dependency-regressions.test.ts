import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

async function runModule(window: Window, source: string): Promise<void> {
  const script = window.document.createElement("script");
  script.type = "module";
  script.textContent = source;
  window.document.body.appendChild(script);
  await window.happyDOM.waitUntilComplete();
}

describe("Happy DOM cookie domain isolation (GHSA-5fpq-26gf-qwcr)", () => {
  it.each(["example.test", ".example.test"])("rejects forged Domain=%s from an unrelated hostname", async (domain) => {
    const window = new Window({ url: "https://notexample.test/" });
    try {
      window.document.cookie = `session=forged; Domain=${domain}; Path=/; Secure`;
      expect(window.document.cookie).toBe("");
      window.happyDOM.setURL("https://example.test/");
      expect(window.document.cookie).toBe("");
    } finally {
      await window.happyDOM.close();
    }
  });

  it.each(["example.test", ".example.test"])("shares legitimate Domain=%s cookies only across DNS label boundaries", async (domain) => {
    const window = new Window({ url: "https://app.example.test/" });
    try {
      window.document.cookie = `shared=allowed; Domain=${domain}; Path=/; Secure`;
      expect(window.document.cookie).toBe("shared=allowed");
      window.happyDOM.setURL("https://example.test/");
      expect(window.document.cookie).toBe("shared=allowed");
      window.happyDOM.setURL("https://other.example.test/");
      expect(window.document.cookie).toBe("shared=allowed");
      window.happyDOM.setURL("https://notexample.test/");
      expect(window.document.cookie).toBe("");
    } finally {
      await window.happyDOM.close();
    }
  });

  it("keeps host-only cookies on their original hostname", async () => {
    const window = new Window({ url: "https://app.example.test/" });
    try {
      window.document.cookie = "private=allowed; Path=/; Secure";
      expect(window.document.cookie).toBe("private=allowed");
      window.happyDOM.setURL("https://other.example.test/");
      expect(window.document.cookie).toBe("");
      window.happyDOM.setURL("https://nested.app.example.test/");
      expect(window.document.cookie).toBe("");
    } finally {
      await window.happyDOM.close();
    }
  });
});

describe("Happy DOM module aliases (GHSA-834v-8h66-3h79)", () => {
  it.each(["configuration", "nastavení"])("evaluates a legitimate JSON import with alias %s", async (alias) => {
    const window = new Window({
      url: "https://app.example.test/",
      settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
    });
    try {
      const dataURL = `data:application/json,${encodeURIComponent(JSON.stringify({ label: "allowed" }))}`;
      await runModule(window, `import { default as ${alias} } from '${dataURL}' with { type: 'json' };
        document.body.dataset.result = ${alias}.label;`);
      expect(window.document.body.dataset.result).toBe("allowed");
    } finally {
      await window.happyDOM.close();
    }
  });

  it.each([
    "injected = document.body.dataset.aliasInjected = 1337",
    "injected = (document.body.dataset.aliasInjected = 1337)",
  ])("does not evaluate an expression in an import alias: %s", async (alias) => {
    const window = new Window({
      url: "https://app.example.test/",
      settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
    });
    try {
      // The JSON import avoids circular ESM assignments that would mask the vulnerable initializer.
      // Only an in-memory DOM marker is touched, including when run against the vulnerable package.
      await runModule(window, `import { missing as ${alias} } from 'data:application/json,%7B%7D' with { type: 'json' };`);
      expect(window.document.body.dataset.aliasInjected).toBeUndefined();
    } finally {
      await window.happyDOM.close();
    }
  });
});

import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_FIT_SCRIPT } from "./lib/previewScripts";
import { buildInteractiveStatementHtml } from "./lib/statementPreview";

vi.mock("@/lib/server/activeAppSession", () => ({ verifyActiveAppSession: vi.fn() }));
import { verifyActiveAppSession } from "./lib/server/activeAppSession";
import { proxy } from "./proxy";

const response = (path: string) => proxy(new NextRequest(`https://bohemka.app${path}`));
const hash = (script: string) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(verifyActiveAppSession).mockResolvedValue({ ok: false, reason: "invalid" });
});
afterEach(() => vi.unstubAllEnvs());

describe("preview security policy", () => {
  const imported = 'window.untrustedStatementScript = true;';
  const html = buildInteractiveStatementHtml(`<html><head></head><body><script>${imported}</script></body></html>`);
  const trusted = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1];

  it.each(["/cashflow", "/smlouvy/example"])("authorizes the exact injected toggle script on %s", async path => {
    const policy = (await response(path)).headers.get("Content-Security-Policy")!;
    const scriptPolicy = policy.split("; ").find(item => item.startsWith("script-src "))!;
    expect(scriptPolicy).toContain(hash(trusted));
    expect(scriptPolicy).not.toContain(hash(imported));
    expect(scriptPolicy).not.toContain(hash(trusted + imported));
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(scriptPolicy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("script-src-attr 'none'");
  });

  it("allows only the PDF fitting script on the comparison page", async () => {
    const policy = (await response("/pomucky/srovnavac-trvalych-nasledku")).headers.get("Content-Security-Policy")!;
    expect(policy).toContain(hash(SCENARIO_FIT_SCRIPT));
    expect(policy).not.toContain(hash(trusted));
  });

  it.each(["/login", "/cashflow-other", "/smlouvy", "/smlouvy/example/other", "/pomucky/srovnavac-trvalych-nasledku-other"])("does not allow preview scripts on %s", async path => {
    const policy = (await response(path)).headers.get("Content-Security-Policy")!;
    expect(policy).not.toContain("'sha256-");
  });

  const embeddedReport = "/muj-tym/tydenni-report?source=weekly-report&embed=mailbox";
  it("allows the mailbox report only in same-origin frames and still requires login", async () => {
    const result = await response(embeddedReport);
    expect(result.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    expect(result.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location")!).searchParams.get("next")).toBe(embeddedReport);
  });

  it.each(["/muj-tym/tydenni-report", "/muj-tym/tydenni-report?embed=mailbox", "/muj-tym/tydenni-report?source=weekly-report", "/muj-tym/tydenni-report/other?source=weekly-report&embed=mailbox"])("keeps framing disabled for %s", async path => {
    const result = await response(path);
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });
});

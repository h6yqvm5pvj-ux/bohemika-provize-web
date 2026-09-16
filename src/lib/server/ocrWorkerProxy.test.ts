import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/activeAppSession", () => ({ verifyActiveAppSession: vi.fn() }));
import { proxy } from "@/proxy";
import { OCR_WORKER_CSP } from "@/lib/ocrWorkerPolicy";

afterEach(() => vi.unstubAllEnvs());
describe("OCR worker content security policy", () => {
  it.each(["0", "1"])("permits local WebAssembly in production with strict CSP %s", async (strict) => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("CSP_STRICT_ENFORCE", strict);
    const response = await proxy(new NextRequest("https://bohemka.app/ocr/worker.min.js?v=7.0.0-ocr2"));
    expect(response.headers.get("Content-Security-Policy")).toBe(OCR_WORKER_CSP);
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(OCR_WORKER_CSP).not.toContain("'unsafe-eval'");
    const page = await proxy(new NextRequest("https://bohemka.app/login"));
    expect(page.headers.get("Content-Security-Policy")).not.toContain("wasm-unsafe-eval");
    expect(page.headers.get("Content-Security-Policy")).not.toContain("'unsafe-eval'");
  });
});

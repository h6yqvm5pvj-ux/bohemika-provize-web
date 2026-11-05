import { beforeEach, vi } from "vitest";

// Next enforces this boundary at build time; tests execute server modules directly.
vi.mock("next/dist/compiled/server-only", () => ({}));

// Synthetic keys only; test runs never need production encryption credentials.
beforeEach(() => {
  vi.stubEnv("BUSINESS_DATA_INDEX_KEY", Buffer.alloc(32, 83).toString("base64"));
  vi.stubEnv("BUSINESS_DATA_ENCRYPTION_REQUIRED", "false");
});

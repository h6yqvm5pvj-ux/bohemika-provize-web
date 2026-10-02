import { beforeEach, vi } from "vitest";

// Synthetic keys only; test runs never need production encryption credentials.
beforeEach(() => {
  vi.stubEnv("BUSINESS_DATA_INDEX_KEY", Buffer.alloc(32, 83).toString("base64"));
  vi.stubEnv("BUSINESS_DATA_ENCRYPTION_REQUIRED", "false");
});

import { beforeEach, afterEach, vi } from "vitest";

// Synthetic test key only. Never load deployment secrets in unit tests.
beforeEach(() => {
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY", Buffer.alloc(32, 71).toString("base64"));
  vi.stubEnv("MAILBOX_ENCRYPTION_KEY_ID", "private-test");
  vi.stubEnv("MAILBOX_ENCRYPTION_PREVIOUS_KEYS", "");
  vi.stubEnv("PRIVATE_DATA_ENCRYPTION_REQUIRED", "false");
});
afterEach(() => vi.unstubAllEnvs());

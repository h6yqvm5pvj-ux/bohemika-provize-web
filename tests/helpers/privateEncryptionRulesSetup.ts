import { beforeAll, afterAll } from "vitest";

// Scope only our synthetic keys. Do not clear other suites' Auth emulator
// configuration with vi.unstubAllEnvs(). No deployment secrets are loaded.
const values = {
  MAILBOX_ENCRYPTION_KEY: Buffer.alloc(32, 71).toString("base64"),
  MAILBOX_ENCRYPTION_KEY_ID: "private-test",
  MAILBOX_ENCRYPTION_PREVIOUS_KEYS: "",
  PRIVATE_DATA_ENCRYPTION_REQUIRED: "false",
};
const original = new Map<string, string | undefined>();
beforeAll(() => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local demo emulator required");
  for (const [key, value] of Object.entries(values)) { original.set(key, process.env[key]); process.env[key] = value; }
});
afterAll(() => {
  for (const [key, value] of original) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

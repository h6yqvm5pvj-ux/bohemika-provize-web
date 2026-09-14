import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ contracts: vi.fn(), clients: vi.fn() }));
vi.mock("@/lib/server/contractNoteReminders", () => ({ runContractNoteReminders: mocks.contracts }));
vi.mock("@/lib/server/clientNoteReminders", () => ({ runClientNoteReminders: mocks.clients }));
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mocks.contracts.mockResolvedValue({ ok: true, checked: 3 });
  mocks.clients.mockResolvedValue({ ok: true, checked: 2 });
});
afterEach(() => vi.unstubAllEnvs());
const request = (secret = "test-cron-secret") => new NextRequest("https://bohemka.app/api/cron/contract-note-reminders", { headers: { authorization: `Bearer ${secret}` } });

describe("scheduled note reminders", () => {
  it("protects both contract and client reminders with the cron secret", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.contracts).not.toHaveBeenCalled();
    expect(mocks.clients).not.toHaveBeenCalled();
  });
  it("runs client reminders on the existing daily schedule", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, checked: 3, clientNotes: { ok: true, checked: 2 } });
  });
  it.each(["contracts", "clients"] as const)("still runs the other reminders when %s fails", async failed => {
    mocks[failed].mockRejectedValue(new Error("unavailable"));
    expect((await GET(request())).status).toBe(500);
    expect(mocks.contracts).toHaveBeenCalledTimes(1);
    expect(mocks.clients).toHaveBeenCalledTimes(1);
  });
});

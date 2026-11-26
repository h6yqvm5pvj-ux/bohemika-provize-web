import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ contracts: vi.fn(), clients: vi.fn(), lifeCommissions: vi.fn() }));
vi.mock("@/lib/server/contractNoteReminders", () => ({ runContractNoteReminders: mocks.contracts }));
vi.mock("@/lib/server/clientNoteReminders", () => ({ runClientNoteReminders: mocks.clients }));
vi.mock("@/lib/server/lifeCommissionReminders", () => ({ runLifeCommissionReminders: mocks.lifeCommissions }));
import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "test-cron-secret");
  mocks.contracts.mockResolvedValue({ ok: true, checked: 3 });
  mocks.clients.mockResolvedValue({ ok: true, checked: 2 });
  mocks.lifeCommissions.mockResolvedValue({ skippedDay: true, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());
const request = (secret = "test-cron-secret") => new NextRequest("https://bohemka.app/api/cron/contract-note-reminders", { headers: { authorization: `Bearer ${secret}` } });

describe("scheduled note reminders", () => {
  it("protects both contract and client reminders with the cron secret", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.contracts).not.toHaveBeenCalled();
    expect(mocks.clients).not.toHaveBeenCalled();
    expect(mocks.lifeCommissions).not.toHaveBeenCalled();
  });
  it("runs client and life commission reminders on the existing daily schedule", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ ok: true, checked: 3, clientNotes: { ok: true, checked: 2 }, lifeCommissions: { skippedDay: true, failed: 0 } });
  });
  it.each(["contracts", "clients", "lifeCommissions"] as const)("still runs the other reminders when %s fails", async failed => {
    mocks[failed].mockRejectedValue(new Error("unavailable"));
    expect((await GET(request())).status).toBe(500);
    expect(mocks.contracts).toHaveBeenCalledTimes(1);
    expect(mocks.clients).toHaveBeenCalledTimes(1);
    expect(mocks.lifeCommissions).toHaveBeenCalledTimes(1);
  });
  it("requires a configured cron secret for commission messages even outside production", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect((await GET(new NextRequest("https://bohemka.app/api/cron/contract-note-reminders"))).status).toBe(200);
    expect(mocks.lifeCommissions).not.toHaveBeenCalled();
  });
});

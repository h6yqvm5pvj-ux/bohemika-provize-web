import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ jobs: new Map<string, Record<string, unknown>>(), send: vi.fn(), setFails: false, deleteFails: false }));
vi.mock("./firebaseAuthEmail", () => ({ sendAuthEmailMessage: state.send }));
vi.mock("./firebaseAdmin", () => ({ adminDb: { collection: () => ({
  doc: (id: string) => ({
    set: async (value: Record<string, unknown>) => { if (state.setFails) throw new Error("store failed"); state.jobs.set(id, value); },
    get: async () => ({ data: () => state.jobs.get(id) }),
    delete: async () => { if (state.deleteFails) throw new Error("delete failed"); state.jobs.delete(id); },
  }),
}) } }));
import { deliverPasswordChanged, queuePasswordChanged, renderPasswordChangeCode, renderPasswordChanged } from "./passwordChangeEmail";
beforeEach(() => { vi.resetAllMocks(); state.jobs.clear(); state.setFails = false; state.deleteFails = false; state.send.mockResolvedValue(undefined); });
describe("password security email delivery", () => {
  it("renders Czech plain text and HTML with a code but no tracking resources", () => {
    const mail = renderPasswordChangeCode("123456"); expect(mail.text).toContain("123456"); expect(mail.html).toContain("123456");
    expect(mail.text).toContain("10 minut"); expect(mail.html).not.toMatch(/<img|<script|<iframe|url\(/i);
    expect(() => renderPasswordChangeCode('<img>')).toThrow();
    expect(renderPasswordChanged().text).toContain("Pokud jsi tuto změnu neprovedl/a");
  });
  it("removes a successfully accepted notification from the queue", async () => {
    const result = await queuePasswordChanged("advisor@example.test"); expect(result.sent).toBe(true); expect(state.jobs.size).toBe(0);
    expect(state.send).toHaveBeenCalledWith("advisor@example.test", expect.objectContaining({ subject: "Vaše heslo v BohemkaApp bylo změněno" }), `password-changed-${result.jobId}`);
  });
  it("retains failed deliveries and retries with the same idempotency key", async () => {
    state.send.mockRejectedValueOnce(new Error("provider failure"));
    const result = await queuePasswordChanged("advisor@example.test"); expect(result.sent).toBe(false); expect(state.jobs.size).toBe(1);
    expect(Object.keys([...state.jobs.values()][0]).sort()).toEqual(["createdAtMs", "email"]);
    expect(await deliverPasswordChanged(result.jobId)).toBe(true);
    expect(state.send.mock.calls[0][2]).toBe(state.send.mock.calls[1][2]); expect(state.jobs.size).toBe(0);
  });
  it("still attempts delivery when the durable queue cannot be written", async () => {
    state.setFails = true; await expect(queuePasswordChanged("advisor@example.test")).resolves.toMatchObject({ sent: true }); expect(state.send).toHaveBeenCalledOnce();
  });
  it("does not invent a notice when its job does not exist", async () => {
    expect(await deliverPasswordChanged("missing")).toBe(false); expect(state.send).not.toHaveBeenCalled();
  });
});

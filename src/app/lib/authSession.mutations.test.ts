import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./privateMemory", () => ({ clearPrivateMemory: vi.fn(), purgePrivateBrowserCaches: vi.fn() }));
vi.mock("./clientCardPrivacy", () => ({ clearLegacyClientCards: vi.fn() }));
vi.mock("./contractTerminationPrivacy", () => ({ clearContractTerminationPrefills: vi.fn() }));
vi.mock("./meetingRecordPrivacy", () => ({ clearMeetingRecords: vi.fn() }));

import { clearServerSession, createServerSessionFromToken, SERVER_SESSION_REQUEST_TIMEOUT_MS } from "./authSession";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe("server session cookie mutations", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("waits for an earlier guest logout so its late response cannot erase a new login cookie", async () => {
    const oldLogout = deferred<Response>();
    let cookie: string | null = "old-session";
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "DELETE") {
        const response = await oldLogout.promise;
        cookie = null;
        return response;
      }
      cookie = "new-session";
      return Response.json({ ok: true });
    });

    const logout = clearServerSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const login = createServerSessionFromToken("synthetic-token", { rememberThisDevice: true });
    await Promise.resolve();
    const requestsBeforeLogout = fetchMock.mock.calls.length;
    oldLogout.resolve(Response.json({ ok: true }));
    await Promise.all([logout, login]);

    expect(requestsBeforeLogout).toBe(1);
    expect(cookie).toBe("new-session");
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["DELETE", "POST"]);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer synthetic-token");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ rememberThisDevice: true });
  });

  it("finishes a pending login before logout so a late login response cannot restore its cookie", async () => {
    const pendingLogin = deferred<Response>();
    let cookie: string | null = null;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const response = await pendingLogin.promise;
        cookie = "new-session";
        return response;
      }
      cookie = null;
      return Response.json({ ok: true });
    });

    const login = createServerSessionFromToken("synthetic-token");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const logout = clearServerSession();
    await Promise.resolve();
    const requestsBeforeLogin = fetchMock.mock.calls.length;
    pendingLogin.resolve(Response.json({ ok: true }));
    await Promise.all([login, logout]);

    expect(requestsBeforeLogin).toBe(1);
    expect(cookie).toBeNull();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "DELETE"]);
  });

  it("allows a new session attempt after a failed mutation", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: false }, { status: 503 }));
    await expect(clearServerSession()).rejects.toThrow("Odhlášení se nepodařilo dokončit");
    await expect(createServerSessionFromToken("synthetic-token")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled login request before the following logout clears its cookie", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const failure = expect(createServerSessionFromToken("synthetic-token")).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(0);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(SERVER_SESSION_REQUEST_TIMEOUT_MS);
    await failure;
    expect(signal?.aborted).toBe(true);
    await expect(clearServerSession()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "DELETE"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not send a login that timed out while an earlier logout was pending", async () => {
    vi.useFakeTimers();
    const oldLogout = deferred<Response>();
    // Also model a transport that ignores abort until it eventually responds.
    fetchMock.mockReturnValueOnce(oldLogout.promise);
    const logout = clearServerSession();
    await vi.advanceTimersByTimeAsync(0);
    const failure = expect(createServerSessionFromToken("synthetic-token")).rejects.toMatchObject({ code: "auth/timeout" });
    await vi.advanceTimersByTimeAsync(SERVER_SESSION_REQUEST_TIMEOUT_MS);
    oldLogout.resolve(Response.json({ ok: true }));
    await logout;
    await failure;
    expect(fetchMock).toHaveBeenCalledOnce();
    await expect(createServerSessionFromToken("fresh-synthetic-token")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(["DELETE", "POST"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearServerSession } from "./authSession";
import {
  clearMeetingRecords, getMeetingRecordContext, readMeetingRecord,
  setMeetingRecordIdentity, suspendMeetingRecordSession, writeMeetingRecord,
  type MeetingRecordKind,
} from "./meetingRecordPrivacy";

const kinds: MeetingRecordKind[] = ["lifeDraft", "lifeResults", "carResults"];
const legacy = ["lifeRecordFormDraft", "lifeRecordResultInput", "carRecord.resultsInput"];
const payload = { syntheticInput: "only-for-advisor-a" };
const key = (kind: MeetingRecordKind) => `bohemika:meeting-record:${kind}`;
const owner = () => getMeetingRecordContext()!;

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear(); localStorage.clear();
  setMeetingRecordIdentity(null);
  setMeetingRecordIdentity("advisor-a");
});
afterEach(() => {
  setMeetingRecordIdentity(null);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("account-bound meeting records", () => {
  it("preserves all three inputs for navigation and a reload of the same account, without localStorage", () => {
    for (const kind of kinds) {
      expect(writeMeetingRecord(kind, payload, owner())).toBe(true);
      expect(readMeetingRecord(kind, owner())).toEqual(payload);
    }
    expect(localStorage.length).toBe(0);
    const previous = owner();
    suspendMeetingRecordSession();
    expect(readMeetingRecord("lifeDraft", previous)).toBeNull();
    setMeetingRecordIdentity("advisor-a");
    for (const kind of kinds) expect(readMeetingRecord(kind, owner())).toEqual(payload);
    expect(writeMeetingRecord("lifeDraft", payload, previous)).toBe(false);
  });

  it.each(["advisor-b", null])("clears records on identity change to %s and prevents reuse after signing in again", (uid) => {
    const previous = owner();
    for (const kind of kinds) writeMeetingRecord(kind, payload, previous);
    setMeetingRecordIdentity(uid);
    expect(sessionStorage.length).toBe(0);
    setMeetingRecordIdentity("advisor-a");
    for (const kind of kinds) {
      expect(readMeetingRecord(kind, owner())).toBeNull();
      expect(writeMeetingRecord(kind, payload, previous)).toBe(false);
    }
  });

  it("does not adopt another user's data when Firebase first resolves after a reload", () => {
    writeMeetingRecord("carResults", payload, owner());
    suspendMeetingRecordSession();
    setMeetingRecordIdentity("advisor-b");
    expect(readMeetingRecord("carResults", owner())).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("preserves ordinary auth notifications but clears on impersonation changes", () => {
    const previous = owner();
    writeMeetingRecord("lifeDraft", payload, previous);
    setMeetingRecordIdentity("advisor-a");
    expect(owner()).toBe(previous);
    expect(readMeetingRecord("lifeDraft", owner())).toEqual(payload);
    setMeetingRecordIdentity("advisor-a", "represented@example.test");
    expect(readMeetingRecord("lifeDraft", owner())).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it.each(kinds)("expires %s after 20 minutes and removes its stored copy", (kind) => {
    writeMeetingRecord(kind, payload, owner());
    vi.advanceTimersByTime(20 * 60_000 - 1);
    expect(readMeetingRecord(kind, owner())).toEqual(payload);
    vi.advanceTimersByTime(1);
    expect(readMeetingRecord(kind, owner())).toBeNull();
    expect(sessionStorage.getItem(key(kind))).toBeNull();
  });

  it.each(["broken", "wrong-owner", "future", "no-date", "invalid-payload"])("rejects %s stored data", (kind) => {
    const entry = { uid: "advisor-a", impersonatedEmail: "", savedAt: Date.now(), payload: {} as unknown };
    if (kind === "wrong-owner") entry.uid = "advisor-b";
    if (kind === "future") entry.savedAt += 1;
    if (kind === "no-date") entry.savedAt = NaN;
    if (kind === "invalid-payload") entry.payload = "not an object";
    sessionStorage.setItem(key("lifeDraft"), kind === "broken" ? "{" : JSON.stringify(entry));
    expect(readMeetingRecord("lifeDraft", owner())).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it.each(["success", "offline", "server-error"])("cleans legacy data and invalidates delayed writes before logout (%s)", async (outcome) => {
    const previous = owner();
    for (const kind of kinds) writeMeetingRecord(kind, payload, previous);
    for (const storage of [localStorage, sessionStorage]) {
      for (const oldKey of legacy) storage.setItem(oldKey, "unknown owner's input");
      storage.setItem("unrelated-preference", "keep");
    }
    vi.stubGlobal("fetch", vi.fn(async () => {
      for (const storage of [localStorage, sessionStorage]) {
        expect(storage.length).toBe(1);
        expect(storage.getItem("unrelated-preference")).toBe("keep");
      }
      expect(writeMeetingRecord("lifeDraft", payload, previous)).toBe(false);
      if (outcome === "offline") throw new Error("Synthetic offline error");
      return new Response("{}", { status: outcome === "server-error" ? 503 : 200 });
    }));
    if (outcome === "success") await clearServerSession();
    else await expect(clearServerSession()).rejects.toThrow();
    for (const kind of kinds) expect(readMeetingRecord(kind, owner())).toBeNull();
    expect(writeMeetingRecord("lifeDraft", payload, owner())).toBe(true);
  });

  it("supports navigation and logout with storage disabled", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new Error("Storage blocked"); });
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("Storage blocked"); });
    const previous = owner();
    expect(writeMeetingRecord("lifeDraft", payload, previous)).toBe(true);
    expect(readMeetingRecord("lifeDraft", previous)).toEqual(payload);
    clearMeetingRecords();
    expect(readMeetingRecord("lifeDraft", owner())).toBeNull();
    expect(writeMeetingRecord("lifeDraft", payload, previous)).toBe(false);
  });
});

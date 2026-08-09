import { afterEach, describe, expect, it, vi } from "vitest";

import {
  contractMatchKey,
  fetchSystemContractMatchBatch,
} from "./statementContractMatching";
import type { MatchedSystemContract } from "./statementTypes";

const contract = (id: string): MatchedSystemContract => ({
  id,
  adviserEmail: "advisor@example.com",
  contractNumber: "1234/AB",
});

const firebaseUser = (getIdToken = vi.fn().mockResolvedValue("token")) =>
  ({ getIdToken }) as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("statement contract matching API", () => {
  it("builds normalized contract match keys", () => {
    expect(contractMatchKey("team", " 12 34 / ab ")).toBe("team:1234/AB");
    expect(contractMatchKey("my", "")).toBeNull();
  });

  it("sends a bulk lookup and associates results with normalized keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({
        ok: true,
        results: [
          { key: "my:1234/AB", contracts: [contract("matched")] },
          { key: "team:999", contracts: [] },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const matches = await fetchSystemContractMatchBatch(
      firebaseUser(),
      [
        { scope: "my", contractNumber: "12 34 / ab" },
        { scope: "team", contractNumber: "999" },
      ],
      (contracts) => contracts
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contracts/find",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      })
    );
    expect(matches.get("my:1234/AB")).toEqual({
      status: "matched",
      contracts: [contract("matched")],
    });
    expect(matches.get("team:999")).toEqual({ status: "not_found", contracts: [] });
  });

  it("refreshes the Firebase token once after an unauthorized lookup", async () => {
    const getIdToken = vi
      .fn()
      .mockResolvedValueOnce("stale-token")
      .mockResolvedValueOnce("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false, json: vi.fn() })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({
          ok: true,
          results: [{ key: "my:1234/AB", contracts: [contract("matched")] }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const matches = await fetchSystemContractMatchBatch(
      firebaseUser(getIdToken),
      [{ scope: "my", contractNumber: "1234/AB" }],
      (contracts) => contracts
    );

    expect(getIdToken).toHaveBeenNthCalledWith(1);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
      })
    );
    expect(matches.get("my:1234/AB")?.status).toBe("matched");
  });
});

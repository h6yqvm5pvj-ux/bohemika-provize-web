import { describe, expect, it } from "vitest";
import { Firestore, type Transaction } from "firebase-admin/firestore";
import type { google } from "@google-cloud/firestore/build/protos/firestore_v1_proto_api";
import firestoreSchema from "@google-cloud/firestore/build/protos/v1.json";
import { Root } from "protobufjs";
import { CASHFLOW_SHADOW_VERSION } from "@/app/cashflow/shadowProtocol";
import { serializeCashflowSnapshot } from "@/app/cashflow/cashflowSnapshotWire";
import { cleanupExpiredCashflowCandidates, publishCashflowCandidate, readCashflowCandidate, type CashflowCandidateContext } from "./cashflowCandidateStore";
import { CASHFLOW_CACHE_STATE_PATH } from "./cashflowCacheState";

const nowMs = new Date(2026, 8, 12, 12).getTime();
const context: CashflowCandidateContext = {
  email: "advisor@example.test", uid: "advisor-uid", version: CASHFLOW_SHADOW_VERSION,
  asOfMs: nowMs, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  options: { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
    showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "" },
};
// No methods: any accidental database access makes these safety tests fail.
const db = {} as Firestore;
const candidate = {
  revision: { epoch: "00000000-0000-0000-0000-000000000000", revision: 0 },
  inputHash: "0".repeat(64),
  payload: serializeCashflowSnapshot({ items: [], months: [] }),
};

describe("diagnostic candidate validation before database access", () => {
  it.each([
    ["email missing", { email: "" }],
    ["identity not canonical", { email: "Advisor@example.test" }],
    ["UID missing", { uid: "" }],
    ["unsupported version", { version: "old-version" }],
    ["old instant", { asOfMs: nowMs - 300_001 }],
    ["future instant", { asOfMs: nowMs + 300_001 }],
    ["unsupported runtime time zone", { timeZone: "Unknown/Zone" }],
    ["invalid options", { options: { ...context.options, scopeFilter: "everyone" } }],
  ])("rejects %s", async (_name, patch) => {
    const invalid = { ...context, ...patch } as CashflowCandidateContext;
    await expect(readCashflowCandidate(db, { context: invalid, nowMs })).resolves.toBeNull();
    await expect(publishCashflowCandidate(db, { ...candidate, context: invalid, nowMs })).resolves.toBe(false);
  });

  it("rejects previous-day context even within five minutes", async () => {
    const midnight = new Date(2026, 8, 13).getTime();
    await expect(readCashflowCandidate(db, { context: { ...context, asOfMs: midnight - 1 }, nowMs: midnight + 1 })).resolves.toBeNull();
  });

  it("rejects unvalidated wire values", async () => {
    await expect(publishCashflowCandidate(db, {
      ...candidate, context, nowMs, payload: { ...candidate.payload, items: [{}] } as typeof candidate.payload,
    })).resolves.toBe(false);
  });

  it("rejects malformed input fingerprints", async () => {
    await expect(publishCashflowCandidate(db, { ...candidate, context, nowMs, inputHash: "not-a-hash" })).resolves.toBe(false);
  });

  it.each([0, -1, 201, 1.5, Number.POSITIVE_INFINITY])("rejects unbounded cleanup limit %s", async limit => {
    await expect(cleanupExpiredCashflowCandidates(db, { nowMs, limit })).rejects.toThrow("bounds");
  });

  it("keeps complete protobuf commit packets below 4 MiB for a larger snapshot", async () => {
    // Use the actual SDK's document serialization and protobuf envelope while
    // replacing its network boundary. Counting raw Buffer bytes missed the bug.
    const localDb = new Firestore({ projectId: "demo-cashflow-packet-test" });
    const commitType = Root.fromJSON(firestoreSchema).lookupType("google.firestore.v1.CommitRequest");
    const packets: Uint8Array[] = [];
    const payload = serializeCashflowSnapshot({ items: Array.from({ length: 400 }, (_, index) => ({
      id: `synthetic-${index}`, date: new Date(nowMs), amount: index + 0.25,
      productKey: "unknown" as const, ownerEmail: null, entryId: null,
      note: "ř🙂".repeat(2_000),
    })), months: [] });
    const tx = {
      get: async (ref: { path: string }) => ({ data: () => ref.path === CASHFLOW_CACHE_STATE_PATH
        ? { ...candidate.revision, activeCount: 0 } : undefined }),
      set: () => undefined,
    } as unknown as Transaction;
    const publishingDb = new Proxy(localDb, {
      get(target, property) {
        if (property === "runTransaction") return async (work: (transaction: Transaction) => Promise<unknown>) => work(tx);
        if (property === "batch") return () => {
          const batch = target.batch();
          batch.commit = async () => {
            // This is the request assembled by the installed SDK's _commit().
            const operations = (batch as unknown as { _ops: { op: () => google.firestore.v1.IWrite }[] })._ops;
            packets.push(commitType.encode({
              database: "projects/demo-cashflow-packet-test/databases/(default)",
              writes: operations.map(operation => operation.op()),
            }).finish());
            return [];
          };
          return batch;
        };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBeGreaterThan(4 * 1024 * 1024);
      expect(await publishCashflowCandidate(publishingDb, { ...candidate, payload, context, nowMs })).toBe(true);
      expect(packets.length).toBeGreaterThan(1);
      for (const packet of packets) expect(packet.byteLength).toBeLessThan(4 * 1024 * 1024);
      const writes = packets.flatMap(packet => (commitType.decode(packet) as unknown as google.firestore.v1.ICommitRequest).writes ?? []);
      expect(writes.length).toBeGreaterThan(8);
      const previousEightChunkPacket = commitType.encode({
        database: "projects/demo-cashflow-packet-test/databases/(default)", writes: writes.slice(0, 8),
      }).finish();
      expect(previousEightChunkPacket.byteLength).toBeGreaterThan(4 * 1024 * 1024);
      const totalPayloadBytes = writes.reduce((sum, write) => sum + (write.update?.fields?.bytes.bytesValue?.length ?? 0), 0);
      expect(totalPayloadBytes).toBe(Buffer.byteLength(JSON.stringify(payload), "utf8"));
    } finally { await localDb.terminate(); }
  });
});

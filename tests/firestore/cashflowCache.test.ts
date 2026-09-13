import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, setLogLevel } from "firebase/firestore";
import { CASHFLOW_SHADOW_VERSION } from "../../src/app/cashflow/shadowProtocol";
import { serializeCashflowSnapshot } from "../../src/app/cashflow/cashflowSnapshotWire";
import {
  CASHFLOW_CACHE_STATE_PATH, beginCashflowMutation, captureCashflowRevision,
  completeCashflowMutation, failCashflowMutation, initializeCashflowCacheState,
  recoverFailedCashflowMutation, type CashflowRevision,
} from "../../src/lib/server/cashflowCacheState";
import {
  CASHFLOW_CANDIDATE_CHUNK_BYTES, CASHFLOW_CANDIDATE_CHUNK_COLLECTION,
  CASHFLOW_CANDIDATE_COLLECTION, publishCashflowCandidate, readCashflowCandidate,
  cleanupExpiredCashflowCandidates,
  type CashflowCandidateContext,
} from "../../src/lib/server/cashflowCandidateStore";

let app: App;
let db: Firestore;
let environment: RulesTestEnvironment;
const nowMs = new Date(2026, 8, 12, 12).getTime();
const context: CashflowCandidateContext = {
  email: "advisor@example.test", uid: "advisor-uid", version: CASHFLOW_SHADOW_VERSION,
  asOfMs: nowMs, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  options: { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
    showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "" },
};
const payload = serializeCashflowSnapshot({ items: [{
  id: "synthetic-1", date: new Date(nowMs), amount: 123.45,
  productKey: "unknown", ownerEmail: context.email, entryId: "entry-1",
}], months: [] });
const inputHash = "a".repeat(64);
const publish = (revision: CashflowRevision) => publishCashflowCandidate(db, { context, revision, inputHash, payload, nowMs });
const read = () => readCashflowCandidate(db, { context, nowMs });
const state = async () => (await db.doc(CASHFLOW_CACHE_STATE_PATH).get()).data()!;

beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Only the local demo Firestore emulator is allowed.");
  app = initializeApp({ projectId: "demo-bohemika-rules" }, "cashflow-cache-tests");
  db = getFirestore(app);
  setLogLevel("silent");
  environment = await initializeTestEnvironment({
    projectId: "demo-bohemika-rules",
    firestore: { host: "127.0.0.1", port: 8180,
      rules: readFileSync(resolve(process.env.FIRESTORE_RULES_TEST_FILE || "firestore.rules"), "utf8") },
  });
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    db.recursiveDelete(db.collection("_cashflowCache")),
    db.recursiveDelete(db.collection(CASHFLOW_CANDIDATE_COLLECTION)),
    db.recursiveDelete(db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION)),
  ]);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await environment?.cleanup();
  await db?.terminate();
  if (app) await deleteApp(app);
});

describe("durable cashflow mutation barrier with real Firestore transactions", () => {
  it("cannot certify missing state, initializes without replacing its epoch", async () => {
    expect(await captureCashflowRevision(db)).toBeNull();
    const first = await initializeCashflowCacheState(db);
    expect(await initializeCashflowCacheState(db)).toEqual(first);
    expect(await captureCashflowRevision(db)).toEqual(first);
  });

  it("serializes concurrent starts and waits for every writer", async () => {
    const tokens = await Promise.all(Array.from({ length: 4 }, () => beginCashflowMutation(db, "synthetic-import")));
    expect(new Set(tokens.map(token => token.epoch)).size).toBe(1);
    expect(await state()).toMatchObject({ activeCount: 4, revision: 4 });
    expect(await captureCashflowRevision(db)).toBeNull();
    await Promise.all(tokens.slice(0, 3).map(token => completeCashflowMutation(db, token)));
    expect(await captureCashflowRevision(db)).toBeNull();
    await completeCashflowMutation(db, tokens[3]);
    expect(await captureCashflowRevision(db)).toEqual({ epoch: tokens[0].epoch, revision: 8 });
  });

  it("duplicate completion cannot remove another writer's barrier", async () => {
    const first = await beginCashflowMutation(db, "first");
    const second = await beginCashflowMutation(db, "second");
    await Promise.all([completeCashflowMutation(db, first), completeCashflowMutation(db, first)]);
    expect(await state()).toMatchObject({ activeCount: 1, revision: 3 });
    expect(await captureCashflowRevision(db)).toBeNull();
    await completeCashflowMutation(db, second);
    expect(await state()).toMatchObject({ activeCount: 0, revision: 4 });
  });

  it("retains a failed import indefinitely and does not silently complete it", async () => {
    const token = await beginCashflowMutation(db, "partial-import");
    await failCashflowMutation(db, token);
    await failCashflowMutation(db, token);
    await db.doc(`${CASHFLOW_CACHE_STATE_PATH}/mutations/${token.id}`).update({ startedAtMs: 0, updatedAtMs: 0 });
    expect(await state()).toMatchObject({ activeCount: 1, revision: 2 });
    expect(await captureCashflowRevision(db)).toBeNull();
    await expect(completeCashflowMutation(db, token)).rejects.toMatchObject({ code: "invalid_mutation" });
  });

  it("recovery requires a failed operation and an unchanged explicitly inspected revision", async () => {
    const token = await beginCashflowMutation(db, "interrupted");
    await expect(recoverFailedCashflowMutation(db, token, { epoch: token.epoch, revision: 1 })).rejects.toMatchObject({ code: "invalid_mutation" });
    await failCashflowMutation(db, token);
    await expect(recoverFailedCashflowMutation(db, token, { epoch: token.epoch, revision: 1 })).rejects.toMatchObject({ code: "revision_changed" });
    await recoverFailedCashflowMutation(db, token, { epoch: token.epoch, revision: 2 });
    expect(await captureCashflowRevision(db)).toEqual({ epoch: token.epoch, revision: 3 });
  });

  it("operational marking of a stopped writer requires the inspected revision", async () => {
    const token = await beginCashflowMutation(db, "stopped-writer");
    await expect(failCashflowMutation(db, token, { epoch: token.epoch, revision: 0 })).rejects.toMatchObject({ code: "revision_changed" });
    expect(await state()).toMatchObject({ activeCount: 1, revision: 1 });
    await failCashflowMutation(db, token, { epoch: token.epoch, revision: 1 });
    expect(await state()).toMatchObject({ activeCount: 1, revision: 2 });
    expect((await db.doc(`${CASHFLOW_CACHE_STATE_PATH}/mutations/${token.id}`).get()).data()?.status).toBe("failed");
  });

  it("rejects unknown tokens without decrementing active writers", async () => {
    const token = await beginCashflowMutation(db, "existing");
    await expect(completeCashflowMutation(db, { ...token, id: "00000000-0000-0000-0000-000000000000" })).rejects.toMatchObject({ code: "invalid_mutation" });
    expect(await state()).toMatchObject({ activeCount: 1, revision: 1 });
  });

  it("deleting and recreating state cannot make an old revision current again", async () => {
    const old = await initializeCashflowCacheState(db);
    await db.doc(CASHFLOW_CACHE_STATE_PATH).delete();
    const current = await initializeCashflowCacheState(db);
    expect(current.epoch).not.toBe(old.epoch);
    expect(await publish(old)).toBe(false);
  });

  it("does not recreate a missing control document over orphaned durable operations", async () => {
    await beginCashflowMutation(db, "writer-that-may-resume");
    await db.doc(CASHFLOW_CACHE_STATE_PATH).delete();
    await expect(initializeCashflowCacheState(db)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(beginCashflowMutation(db, "new-writer")).rejects.toMatchObject({ code: "invalid_state" });
    expect(await captureCashflowRevision(db)).toBeNull();
  });
});

describe("immutable diagnostic candidate publication and reads", () => {
  it("roundtrips a complete candidate only for its authenticated exact context", async () => {
    const revision = await initializeCashflowCacheState(db);
    expect(await publish(revision)).toBe(true);
    expect(await read()).toEqual({ revision, inputHash, payload });
    for (const changed of [
      { uid: "recreated-user" }, { email: "other@example.test" }, { asOfMs: nowMs + 1 },
      { options: { ...context.options, scopeFilter: "team" as const } },
      { options: { ...context.options, intelligentPredictionEnabled: true } },
      { options: { ...context.options, contractNumberQuery: "another-contract" } },
    ]) {
      expect(await readCashflowCandidate(db, { context: { ...context, ...changed }, nowMs })).toBeNull();
    }
  });

  it("rejects candidates while a write is active and after its revision completes", async () => {
    const revision = await initializeCashflowCacheState(db);
    await publish(revision);
    const token = await beginCashflowMutation(db, "edit");
    expect(await read()).toBeNull();
    expect(await publish(revision)).toBe(false);
    await completeCashflowMutation(db, token);
    expect(await read()).toBeNull();
    const current = (await captureCashflowRevision(db))!;
    expect(await publish(current)).toBe(true);
    expect((await read())?.revision).toEqual(current);
    expect(await publish(revision)).toBe(false);
    expect((await read())?.revision).toEqual(current);
  });

  it("roundtrips more than 4 MiB across bounded commit packets and streamed reads", async () => {
    const revision = await initializeCashflowCacheState(db);
    const large = serializeCashflowSnapshot({ items: Array.from({ length: 400 }, (_, i) => ({
      id: `synthetic-${i}`, date: new Date(nowMs), amount: i + 0.25,
      productKey: "unknown" as const, ownerEmail: null, entryId: null,
      note: "ř🙂".repeat(2_000),
    })), months: [] });
    expect(await publishCashflowCandidate(db, { context, revision, inputHash, payload: large, nowMs })).toBe(true);
    const chunks = await db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION).get();
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeGreaterThan(4 * 1024 * 1024);
    expect(chunks.size).toBeGreaterThan(8);
    expect(chunks.docs.every(part => part.data().bytes.length <= CASHFLOW_CANDIDATE_CHUNK_BYTES)).toBe(true);
    expect((await read())?.payload).toEqual(large);
  });

  it.each(["missing", "corrupt", "wrong-index"])("rejects %s chunks", async defect => {
    await publish(await initializeCashflowCacheState(db));
    const chunk = (await db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION).get()).docs[0];
    if (defect === "missing") await chunk.ref.delete();
    else if (defect === "wrong-index") await chunk.ref.update({ index: 1 });
    else {
      const bytes = Buffer.from(chunk.data().bytes);
      bytes[0] = bytes[0] ^ 1;
      await chunk.ref.update({ bytes });
    }
    expect(await read()).toBeNull();
  });

  it("rejects expiration exactly at the deadline and malformed manifests", async () => {
    await publish(await initializeCashflowCacheState(db));
    expect(await readCashflowCandidate(db, { context, nowMs: nowMs + 300_000 })).toBeNull();
    const pointer = (await db.collection(CASHFLOW_CANDIDATE_COLLECTION).get()).docs[0];
    await pointer.ref.update({ chunks: Number.MAX_SAFE_INTEGER });
    expect(await read()).toBeNull();
  });

  it("does not publish when a mutation starts after chunk commit", async () => {
    const revision = await initializeCashflowCacheState(db);
    // Do not intercept the SDK's own transaction batches, only the store's chunks.
    const publishingDb = new Proxy(db, {
      get(target, property) {
        if (property === "batch") return () => {
          const batch = target.batch();
          const commit = batch.commit.bind(batch);
          batch.commit = async () => {
            const result = await commit();
            await beginCashflowMutation(db, "arrived-after-chunks");
            return result;
          };
          return batch;
        };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(await publishCashflowCandidate(publishingDb, { context, revision, inputHash, payload, nowMs })).toBe(false);
    expect((await db.collection(CASHFLOW_CANDIDATE_COLLECTION).get()).empty).toBe(true);
    expect(await read()).toBeNull();
    expect(await cleanupExpiredCashflowCandidates(db, { nowMs: nowMs + 300_000 })).toEqual({ candidates: 0, chunks: 1 });
  });

  it("cleans expired generations in bounded batches while preserving a renewed pointer", async () => {
    const revision = await initializeCashflowCacheState(db);
    await publish(revision);
    await publish(revision);
    await publishCashflowCandidate(db, { context, revision, inputHash, payload, nowMs: nowMs + 100_000 });
    expect(await cleanupExpiredCashflowCandidates(db, { nowMs: nowMs + 300_000, limit: 1 })).toEqual({ candidates: 0, chunks: 1 });
    expect((await db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION).get()).size).toBe(2);
    expect(await readCashflowCandidate(db, { context, nowMs: nowMs + 300_000 })).not.toBeNull();
    expect(await cleanupExpiredCashflowCandidates(db, { nowMs: nowMs + 300_000 })).toEqual({ candidates: 0, chunks: 1 });
    expect(await cleanupExpiredCashflowCandidates(db, { nowMs: nowMs + 400_000 })).toEqual({ candidates: 1, chunks: 1 });
  });

  it("detects writes completed between reading chunks and the final reader check", async () => {
    await publish(await initializeCashflowCacheState(db));
    const original = db.getAll.bind(db);
    vi.spyOn(db, "getAll").mockImplementationOnce(async (...refs) => {
      const snapshots = await original(...refs);
      const token = await beginCashflowMutation(db, "changed-during-read");
      await completeCashflowMutation(db, token);
      return snapshots;
    });
    expect(await read()).toBeNull();
  });

  it("detects pointer replacement between reading chunks and the final reader check", async () => {
    const revision = await initializeCashflowCacheState(db);
    await publish(revision);
    const original = db.getAll.bind(db);
    vi.spyOn(db, "getAll").mockImplementationOnce(async (...refs) => {
      const snapshots = await original(...refs);
      await publish(revision);
      return snapshots;
    });
    expect(await read()).toBeNull();
    expect(await read()).not.toBeNull();
  });

  it.each([{}, { admin: true }, { adminRole: "owner" }])("clients cannot access internal records even with privileged claims %j", async claims => {
    await publish(await initializeCashflowCacheState(db));
    const client = environment.authenticatedContext(context.uid, { email: context.email, ...claims }).firestore();
    const paths = [CASHFLOW_CACHE_STATE_PATH,
      (await db.collection(CASHFLOW_CANDIDATE_COLLECTION).get()).docs[0].ref.path,
      (await db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION).get()).docs[0].ref.path];
    for (const path of paths) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { compromised: true }));
    }
  });
});

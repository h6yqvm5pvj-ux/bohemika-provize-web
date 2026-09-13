import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { CashflowViewOptions } from "@/app/cashflow/buildCashflowView";
import {
  CASHFLOW_SNAPSHOT_MAX_BYTES, parseCashflowSnapshot, type CashflowSnapshotWire,
} from "@/app/cashflow/cashflowSnapshotWire";
import {
  CASHFLOW_SHADOW_VERSION, cashflowCanonicalJson, isCashflowShadowContextCurrent,
  parseCashflowShadowRequest,
} from "@/app/cashflow/shadowProtocol";
import { isCashflowRevisionCurrent, type CashflowRevision } from "./cashflowCacheState";

export const CASHFLOW_CANDIDATE_COLLECTION = "_cashflowCandidates";
export const CASHFLOW_CANDIDATE_CHUNK_COLLECTION = "_cashflowCandidateChunks";
export const CASHFLOW_CANDIDATE_CHUNK_BYTES = 512 * 1024;
export const CASHFLOW_CANDIDATE_TTL_MS = 5 * 60_000;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_CHUNKS = Math.ceil(CASHFLOW_SNAPSHOT_MAX_BYTES / CASHFLOW_CANDIDATE_CHUNK_BYTES);
const CHUNKS_PER_COMMIT = 7;

export type CashflowCandidateContext = {
  email: string;
  uid: string;
  timeZone: string;
  asOfMs: number;
  options: CashflowViewOptions;
  version: string;
};
export type CashflowCandidate = {
  revision: CashflowRevision;
  inputHash: string;
  payload: CashflowSnapshotWire;
};
type Manifest = {
  schema: 1;
  context: CashflowCandidateContext;
  generation: string;
  revision: CashflowRevision;
  inputHash: string;
  digest: string;
  bytes: number;
  chunks: number;
  createdAtMs: number;
  expiresAtMs: number;
};

const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function contextJson(context: CashflowCandidateContext): string | null {
  if (!context || typeof context.email !== "string" || !context.email || context.email.length > 320 ||
    context.email !== context.email.trim().toLowerCase() ||
    typeof context.uid !== "string" || !context.uid || context.uid.length > 128 ||
    context.version !== CASHFLOW_SHADOW_VERSION) return null;
  const parsed = parseCashflowShadowRequest({
    ...context, inputHash: "0".repeat(64), itemsHash: "0".repeat(64), monthsHash: "0".repeat(64),
  });
  if (!parsed) return null;
  // Only the supported context fields determine identity. No client identities
  // are derived here: the caller must supply the authenticated UID and email.
  return cashflowCanonicalJson({
    email: context.email, uid: context.uid, version: context.version,
    timeZone: parsed.timeZone, asOfMs: parsed.asOfMs, options: parsed.options,
  });
}

function currentContext(context: CashflowCandidateContext, nowMs: number): boolean {
  return context.timeZone === Intl.DateTimeFormat().resolvedOptions().timeZone &&
    isCashflowShadowContextCurrent(context.asOfMs, nowMs);
}

function parseManifest(value: unknown, context: string, nowMs: number): Manifest | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Manifest;
  if (m.schema !== 1 || contextJson(m.context) !== context ||
    typeof m.generation !== "string" || !UUID.test(m.generation) ||
    !m.revision || typeof m.revision.epoch !== "string" || !UUID.test(m.revision.epoch) ||
    !Number.isSafeInteger(m.revision.revision) || m.revision.revision < 0 ||
    typeof m.inputHash !== "string" || !HASH.test(m.inputHash) ||
    typeof m.digest !== "string" || !HASH.test(m.digest) ||
    !Number.isSafeInteger(m.bytes) || m.bytes < 1 || m.bytes > CASHFLOW_SNAPSHOT_MAX_BYTES ||
    !Number.isSafeInteger(m.chunks) || m.chunks < 1 || m.chunks > MAX_CHUNKS ||
    m.chunks !== Math.ceil(m.bytes / CASHFLOW_CANDIDATE_CHUNK_BYTES) ||
    !Number.isSafeInteger(m.createdAtMs) || m.createdAtMs > nowMs ||
    !Number.isSafeInteger(m.expiresAtMs) || m.expiresAtMs <= nowMs ||
    m.expiresAtMs <= m.createdAtMs || m.expiresAtMs - m.createdAtMs > CASHFLOW_CANDIDATE_TTL_MS) return null;
  return m;
}

function chunkRef(db: Firestore, generation: string, index: number) {
  return db.collection(CASHFLOW_CANDIDATE_CHUNK_COLLECTION).doc(`${generation}_${String(index).padStart(4, "0")}`);
}

/**
 * Stores diagnostic candidates only. A successful client comparison never
 * authorizes using these amounts on the display path. Immutable chunks are
 * written first; the only visible pointer is published in the revision fence.
 */
export async function publishCashflowCandidate(db: Firestore, {
  context, revision, inputHash, payload, nowMs,
}: CashflowCandidate & { context: CashflowCandidateContext; nowMs?: number }): Promise<boolean> {
  const now = () => nowMs ?? Date.now();
  const canonicalContext = contextJson(context);
  if (!canonicalContext || !currentContext(context, now()) || !HASH.test(inputHash) ||
    !parseCashflowSnapshot(payload)) return false;
  const bytes = Buffer.from(cashflowCanonicalJson(payload), "utf8");
  if (bytes.length > CASHFLOW_SNAPSHOT_MAX_BYTES) return false;
  if (!await db.runTransaction(tx => isCashflowRevisionCurrent(db, tx, revision))) return false;
  const generation = randomUUID();
  const createdAtMs = now();
  const expiresAtMs = createdAtMs + CASHFLOW_CANDIDATE_TTL_MS;
  const chunks = Math.ceil(bytes.length / CASHFLOW_CANDIDATE_CHUNK_BYTES);
  const manifest: Manifest = {
    schema: 1, context: JSON.parse(canonicalContext) as CashflowCandidateContext,
    generation, revision, inputHash, digest: digest(bytes), bytes: bytes.length,
    chunks, createdAtMs, expiresAtMs,
  };
  // At most 3.5 MiB of payload leaves room for document metadata and the protobuf
  // envelope below the 4 MiB transport limit. Eight full chunks alone fill it.
  for (let first = 0; first < chunks; first += CHUNKS_PER_COMMIT) {
    const batch = db.batch();
    for (let index = first; index < Math.min(first + CHUNKS_PER_COMMIT, chunks); index++) {
      batch.create(chunkRef(db, generation, index), {
        generation, index,
        bytes: bytes.subarray(index * CASHFLOW_CANDIDATE_CHUNK_BYTES, (index + 1) * CASHFLOW_CANDIDATE_CHUNK_BYTES),
        expiresAt: new Date(expiresAtMs),
      });
    }
    await batch.commit();
  }
  const pointer = db.collection(CASHFLOW_CANDIDATE_COLLECTION).doc(digest(canonicalContext));
  return db.runTransaction(async tx => {
    const previous = await tx.get(pointer);
    if (!await isCashflowRevisionCurrent(db, tx, revision) ||
      !currentContext(context, now()) || now() >= expiresAtMs) return false;
    // A slower worker may not replace a more recently generated candidate.
    const existing = parseManifest(previous.data(), canonicalContext, now());
    if (existing && existing.createdAtMs > createdAtMs) return false;
    tx.set(pointer, { ...manifest, expiresAt: new Date(expiresAtMs) });
    return true;
  });
}

/** A miss is deliberately the only result for stale, partial, or malformed data. */
export async function readCashflowCandidate(db: Firestore, {
  context, nowMs,
}: { context: CashflowCandidateContext; nowMs?: number }): Promise<CashflowCandidate | null> {
  const now = () => nowMs ?? Date.now();
  const canonicalContext = contextJson(context);
  if (!canonicalContext || !currentContext(context, now())) return null;
  const pointer = db.collection(CASHFLOW_CANDIDATE_COLLECTION).doc(digest(canonicalContext));
  const initial = await pointer.get();
  const manifest = parseManifest(initial.data(), canonicalContext, now());
  if (!manifest) return null;
  if (!await db.runTransaction(tx => isCashflowRevisionCurrent(db, tx, manifest.revision))) return null;
  const parts = await db.getAll(...Array.from({ length: manifest.chunks }, (_, index) => chunkRef(db, manifest.generation, index)));
  const buffers: Buffer[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index].data();
    const expectedLength = Math.min(CASHFLOW_CANDIDATE_CHUNK_BYTES, manifest.bytes - index * CASHFLOW_CANDIDATE_CHUNK_BYTES);
    if (!part || part.generation !== manifest.generation || part.index !== index ||
      !Buffer.isBuffer(part.bytes) || part.bytes.length !== expectedLength) return null;
    buffers.push(part.bytes);
  }
  const bytes = Buffer.concat(buffers);
  if (bytes.length !== manifest.bytes || digest(bytes) !== manifest.digest) return null;
  let payload: CashflowSnapshotWire;
  try {
    payload = JSON.parse(bytes.toString("utf8")) as CashflowSnapshotWire;
    if (!parseCashflowSnapshot(payload)) return null;
  } catch { return null; }
  const valid = await db.runTransaction(async tx => {
    const latest = await tx.get(pointer);
    if (!await isCashflowRevisionCurrent(db, tx, manifest.revision) ||
      !currentContext(context, now())) return false;
    const current = parseManifest(latest.data(), canonicalContext, now());
    return current !== null && cashflowCanonicalJson(current) === cashflowCanonicalJson(manifest);
  });
  return valid ? { revision: manifest.revision, inputHash: manifest.inputHash, payload } : null;
}

/**
 * Bounded operational cleanup, including chunks orphaned by failed publication.
 * expiresAt is not assumed to have a configured Firestore TTL policy. Querying
 * and deleting in one transaction protects a renewed pointer from an old scan.
 */
export async function cleanupExpiredCashflowCandidates(db: Firestore, {
  nowMs = Date.now(), limit = 100,
}: { nowMs?: number; limit?: number } = {}): Promise<{ candidates: number; chunks: number }> {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0 || !Number.isFinite(new Date(nowMs).getTime()) ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid cashflow cleanup bounds.");
  const remove = (collection: string) => db.runTransaction(async tx => {
    // Projection avoids reading up to 100 MiB of expired payloads just to delete them.
    const expired = await tx.get(db.collection(collection)
      .where("expiresAt", "<=", new Date(nowMs)).select("expiresAt").limit(limit));
    for (const document of expired.docs) tx.delete(document.ref);
    return expired.size;
  });
  const candidates = await remove(CASHFLOW_CANDIDATE_COLLECTION);
  const chunks = await remove(CASHFLOW_CANDIDATE_CHUNK_COLLECTION);
  return { candidates, chunks };
}

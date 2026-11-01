import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { retryable } from 'google-gax/build/src/normalCalls/retries';
import { markCashflowMutationIncomplete, withCashflowMutation } from '@/lib/server/cashflowMutationTracking';

// Regression tests inject ambiguous commits without credentials or live data.
const mocks = vi.hoisted(() => ({
  guard: vi.fn(), access: vi.fn(), get: vi.fn(), upload: vi.fn(), remove: vi.fn(),
  read: vi.fn(), commit: vi.fn(), update: vi.fn(), fill: vi.fn(),
  beginMutation: vi.fn(), completeMutation: vi.fn(), failMutation: vi.fn(),
}));
const db = vi.hoisted(() => ({
  batch: () => ({ update: mocks.update, commit: mocks.commit }),
  collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mocks.get, get firestore() { return db; } }) }) }) }),
}));
vi.mock('@/lib/server/firebaseAdmin', () => ({ adminDb: db }));
vi.mock('@/lib/server/clientCardEmailImport', () => ({ fillClientCardEmailFromUploadedPdf: mocks.fill }));
vi.mock('@/lib/server/clientCardCompanyIdImport', () => ({ fillClientCardCompanyIdFromUploadedPdf: mocks.fill }));
vi.mock('@/lib/server/contractHistory', () => ({ withContractHistory: (_writer: unknown, _ref: unknown, _before: unknown, patch: unknown) => patch }));
vi.mock('@/lib/server/cashflowCacheState', () => ({
  beginCashflowMutation: mocks.beginMutation,
  completeCashflowMutation: mocks.completeMutation,
  failCashflowMutation: mocks.failMutation,
}));
vi.mock('@/app/api/contracts/_lib/contractsApi', () => ({ requireContractsEntryGuard: mocks.guard, hasContractAccess: mocks.access, CONTRACT_CREATE_OWNER_OVERRIDE_ACTOR_EMAIL: 'override@example.test' }));
vi.mock('@/lib/server/contractPdfStorage', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  uploadContractPdfAttachment: mocks.upload,
  deleteContractPdfAttachment: mocks.remove,
  createContractPdfAttachmentReadStream: mocks.read,
}));
import { POST, GET } from '@/app/api/contracts/attachment/route';

const owner = 'owner@example.test';
const attachment = (path: string) => ({
  kind: 'contractPdf', bucketName: 'synthetic-test.invalid', storagePath: path,
  originalName: path, contentType: 'application/pdf', sizeBytes: 32,
  sha256: 'a'.repeat(64), uploadedAtMs: 1, uploadedBy: owner,
});
const request = (firstOnly = false) => {
  const form = new FormData();
  form.set('file', new File(['%PDF-synthetic'], 'fixture.pdf', { type: 'application/pdf' }));
  form.set('ownerEmail', owner); form.set('entryId', 'synthetic-entry');
  if (firstOnly) form.set('onlyIfMissing', '1');
  return new NextRequest('http://localhost/api/contracts/attachment', { method: 'POST', body: form });
};
const getRequest = () => new NextRequest(`http://localhost/api/contracts/attachment?ownerEmail=${owner}&entryId=synthetic-entry`);
let persisted: { productKey: string; contractPdfAttachment?: ReturnType<typeof attachment> };
let objects: Set<string>;
let pending: typeof persisted;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CASHFLOW_CACHE_TRACK_WRITES', '1');
  mocks.beginMutation.mockResolvedValue({ id: 'synthetic-mutation' });
  persisted = { productKey: 'synthetic-product' };
  objects = new Set();
  mocks.guard.mockResolvedValue({ ok: true, ctx: { email: owner, uid: 'synthetic-user', accountType: 'advisor', actorEmail: owner, contractAccessEmails: [], isImpersonating: false }, withRateLimit: (response: NextResponse) => response });
  mocks.access.mockReturnValue(true);
  mocks.get.mockImplementation(async () => {
    const snapshot = structuredClone(persisted);
    return { exists: true, data: () => snapshot, updateTime: 'snapshot-v1' };
  });
  mocks.upload.mockImplementation(async () => {
    objects.add('new.pdf');
    return attachment('new.pdf');
  });
  mocks.update.mockImplementation((_ref, patch) => { pending = { ...persisted, ...patch }; });
  mocks.remove.mockImplementation(async file => { objects.delete(file.storagePath); });
  mocks.read.mockImplementation(async file => {
    if (!objects.has(file.storagePath)) throw Object.assign(new Error('No such object'), { code: 404 });
    return { stream: Readable.from([Buffer.from('%PDF-synthetic')]), sizeBytes: 14 };
  });
  mocks.commit.mockImplementation(async () => { persisted = pending; });
});
afterEach(() => vi.unstubAllEnvs());

describe('contract PDF durability after ambiguous upload commits', () => {
  it.each([false, true])('confirms an applied write after its acknowledgement times out; firstOnly=%s', async firstOnly => {
    if (!firstOnly) { persisted.contractPdfAttachment = attachment('old.pdf'); objects.add('old.pdf'); }
    mocks.commit.mockImplementation(async () => {
      persisted = pending; // The server accepted the atomic write.
      throw Object.assign(new Error('Synthetic lost commit acknowledgement'), { code: 4 });
    });
    expect((await POST(request(firstOnly))).status).toBe(200);
    expect(persisted.contractPdfAttachment?.storagePath).toBe('new.pdf');
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.completeMutation).toHaveBeenCalledOnce();
    expect(mocks.failMutation).not.toHaveBeenCalled();
    expect((await GET(getRequest())).status).toBe(200);
    if (!firstOnly) expect(objects.has('old.pdf')).toBe(true); // Superseded encrypted bytes remain available for verified cleanup.
  });

  it('recognizes a committed upload after an SDK retry fails the original precondition', async () => {
    let attempts = 0;
    // Use the same installed Google GAX retry algorithm as the Firestore SDK.
    // First transport call applies the write but loses its response; the retry
    // legitimately rejects the now-outdated lastUpdateTime precondition.
    const transport = (_request: unknown, _metadata: unknown, _options: unknown, callback: (error: Error) => void) => {
      attempts++;
      if (attempts === 1) {
        persisted = pending;
        callback(Object.assign(new Error('Synthetic transport response lost'), { code: 14 }));
      } else {
        callback(Object.assign(new Error('Synthetic retry fails original lastUpdateTime'), { code: 9 }));
      }
      return { cancel() {} };
    };
    const retry = retryable(transport as never, {
      retryCodes: [10, 8, 14], // Installed Firestore WriteBatch.commit retry codes.
      backoffSettings: { initialRetryDelayMillis: 1, retryDelayMultiplier: 1, maxRetryDelayMillis: 1,
        initialRpcTimeoutMillis: 1000, rpcTimeoutMultiplier: 1, maxRpcTimeoutMillis: 1000, totalTimeoutMillis: 1000 },
    } as never, { metadataBuilder: () => ({}) }, 'commit');
    mocks.commit.mockImplementation(() => new Promise((_resolve, reject) => retry({}, error => reject(error))));
    expect((await POST(request(true))).status).toBe(200);
    expect(attempts).toBe(2);
    expect(mocks.completeMutation).toHaveBeenCalledOnce();
    expect(mocks.failMutation).not.toHaveBeenCalled();
    expect(persisted.contractPdfAttachment?.storagePath).toBe('new.pdf');
    expect(objects.has('new.pdf')).toBe(true);
    expect((await GET(getRequest())).status).toBe(200);
  });

  it('keeps both files when a rejected write is not confirmed by authorized readback', async () => {
    persisted.contractPdfAttachment = attachment('old.pdf'); objects.add('old.pdf');
    mocks.commit.mockRejectedValue(Object.assign(new Error('Synthetic precondition conflict before commit'), { code: 9 }));
    expect((await POST(request())).status).toBe(409);
    expect(mocks.failMutation).toHaveBeenCalledOnce();
    expect(mocks.completeMutation).not.toHaveBeenCalled();
    expect(persisted.contractPdfAttachment?.storagePath).toBe('old.pdf');
    expect(objects.has('old.pdf')).toBe(true);
    expect(objects.has('new.pdf')).toBe(true);
    expect((await GET(getRequest())).status).toBe(200);
  });

  it('does not clear a previous mutation failure when this upload is recovered', async () => {
    mocks.commit.mockImplementation(async () => {
      persisted = pending;
      throw Object.assign(new Error('Synthetic lost acknowledgement'), { code: 4 });
    });
    const response = await withCashflowMutation('synthetic-parent', async () => {
      markCashflowMutationIncomplete();
      return POST(request(true));
    });
    expect(response.status).toBe(200);
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.failMutation).toHaveBeenCalledOnce();
    expect(mocks.completeMutation).not.toHaveBeenCalled();
  });

  it('normal replacement updates the link while retaining the previous encrypted PDF', async () => {
    persisted.contractPdfAttachment = attachment('old.pdf'); objects.add('old.pdf');
    expect((await POST(request())).status).toBe(200);
    expect(persisted.contractPdfAttachment?.storagePath).toBe('new.pdf');
    expect(objects.has('new.pdf')).toBe(true);
    expect(objects.has('old.pdf')).toBe(true);
    expect((await GET(getRequest())).status).toBe(200);
  });

  it.each(['another-path', 'another-bucket', 'another-sha'])('does not confirm another attachment with %s', async difference => {
    mocks.commit.mockImplementation(async () => {
      const other = attachment(difference === 'another-path' ? 'other.pdf' : 'new.pdf');
      if (difference === 'another-bucket') other.bucketName = 'another-test.invalid';
      if (difference === 'another-sha') other.sha256 = 'b'.repeat(64);
      persisted.contractPdfAttachment = other;
      throw Object.assign(new Error('Synthetic concurrent upload'), { code: 9 });
    });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.fill).not.toHaveBeenCalled();
  });

  it('returns the currently verified metadata after recovering a lost acknowledgement', async () => {
    mocks.commit.mockImplementation(async () => {
      persisted = { ...pending, contractPdfAttachment: { ...pending.contractPdfAttachment!, uploadedAtMs: 99 } };
      throw Object.assign(new Error('Synthetic confirmation lost'), { code: 4 });
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attachment: { uploadedAtMs: 99 } });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('keeps a prepared PDF when the source has moved before verification', async () => {
    let reads = 0;
    mocks.get.mockImplementation(async () => ++reads === 1
      ? { exists: true, data: () => structuredClone(persisted), updateTime: 'snapshot-v1' }
      : { exists: false });
    mocks.commit.mockRejectedValue(Object.assign(new Error('Synthetic transferred source'), { code: 5 }));
    expect((await POST(request())).status).toBe(409);
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.fill).not.toHaveBeenCalled();
  });

  it('rechecks record authorization before returning recovered metadata', async () => {
    mocks.access.mockReturnValueOnce(true).mockReturnValue(false);
    mocks.commit.mockImplementation(async () => {
      persisted = pending;
      throw Object.assign(new Error('Synthetic confirmation lost'), { code: 4 });
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('attachment');
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.fill).not.toHaveBeenCalled();
  });

  it('preserves an applied write when the verification read also fails', async () => {
    mocks.get.mockImplementationOnce(async () => ({ exists: true, data: () => structuredClone(persisted), updateTime: 'snapshot-v1' }))
      .mockRejectedValueOnce(new Error('Private internal read failure'));
    mocks.commit.mockImplementation(async () => {
      persisted = pending;
      throw Object.assign(new Error('Private lost transport response'), { code: 4 });
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('Private');
    expect(persisted.contractPdfAttachment?.storagePath).toBe('new.pdf');
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('does not remove the encrypted file when preparing the metadata batch fails', async () => {
    mocks.update.mockImplementation(() => { throw new Error('Synthetic batch preparation failure'); });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(objects.has('new.pdf')).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

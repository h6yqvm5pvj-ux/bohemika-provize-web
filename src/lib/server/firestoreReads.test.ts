import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { getAllBatched } from "./firestoreReads";

describe("batched Firestore reads", () => {
  it("preserves positions of missing and duplicate documents across batches", async () => {
    const refs = Array.from({ length: 405 }, (_, i) => ({ path: `totals/user-${i}` })) as DocumentReference[];
    refs[404] = refs[0];
    const getAll = vi.fn(async (...batch: DocumentReference[]) => batch.map(ref => ({
      id: ref.path, exists: ref !== refs[199], data: () => ref === refs[199] ? undefined : { owner: ref.path },
    })));
    const snapshots = await getAllBatched({ getAll } as unknown as Firestore, refs);
    expect(snapshots.map(doc => doc.id)).toEqual(refs.map(ref => ref.path));
    expect(snapshots[199].exists).toBe(false);
    expect(snapshots[200].data()).toEqual({ owner: refs[200].path });
    expect(getAll).toHaveBeenCalledTimes(3);
    expect(getAll.mock.calls.map(args => args.length)).toEqual([200, 200, 5]);
  });

  it("does not issue an invalid empty getAll call", async () => {
    const getAll = vi.fn();
    expect(await getAllBatched({ getAll } as unknown as Firestore, [])).toEqual([]);
    expect(getAll).not.toHaveBeenCalled();
  });

  it("fails the entire load when a later batch fails instead of caching partial totals", async () => {
    const refs = Array.from({ length: 401 }, (_, i) => ({ path: `totals/user-${i}` })) as DocumentReference[];
    const getAll = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("unavailable"));
    await expect(getAllBatched({ getAll } as unknown as Firestore, refs)).rejects.toThrow("unavailable");
    expect(getAll).toHaveBeenCalledTimes(2);
  });
});

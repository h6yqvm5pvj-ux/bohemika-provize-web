type ReadResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Read at most one group ahead; consume snapshots in the original order.
 * Observe every rejection immediately and drain a speculative read before the
 * caller falls back, so it cannot modify the fallback's collection later.
 */
export async function* orderedCashflowReads<I, T>(
  groups: readonly I[],
  read: (group: I) => Promise<T>,
  readAhead: boolean
): AsyncGenerator<ReadResult<T>> {
  const pending: Promise<ReadResult<T>>[] = [];
  let index = 0;
  const fill = () => {
    const width = readAhead ? 2 : 1;
    while (index < groups.length && pending.length < width) {
      const group = groups[index++]!;
      pending.push(Promise.resolve().then(() => read(group)).then(
        value => ({ ok: true as const, value }),
        error => ({ ok: false as const, error })
      ));
    }
  };
  try {
    fill();
    while (pending.length > 0) {
      const result = await pending.shift()!;
      yield result;
      if (!result.ok) return;
      // The caller has finished consuming this group's continuations. Later
      // groups cannot affect its merged page boundary or deduplication order.
      fill();
    }
  } finally {
    await Promise.all(pending);
  }
}

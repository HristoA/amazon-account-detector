/**
 * Per-key in-flight registry: join duplicate work for the same key.
 * Does not supersede — a second call while in flight returns the same promise.
 */
export class CheckCoordinator<T> {
  private readonly inflight = new Map<string, Promise<T>>();

  isInFlight(key: string): boolean {
    return this.inflight.has(key);
  }

  inFlightKeys(): string[] {
    return [...this.inflight.keys()];
  }

  run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    const promise = fn().finally(() => {
      if (this.inflight.get(key) === promise) {
        this.inflight.delete(key);
      }
    });
    this.inflight.set(key, promise);
    return promise;
  }
}

/** Run async tasks with a fixed concurrency limit. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]!, index);
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runNext(),
  );
  await Promise.all(runners);
  return results;
}

/**
 * Like {@link mapPool}, but one worker rejection does not abort the rest.
 * Failed items yield `undefined` in the results array.
 */
export async function mapPoolBestEffort<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onError?: (error: unknown, item: T, index: number) => void | Promise<void>,
): Promise<Array<R | undefined>> {
  return mapPool(items, concurrency, async (item, index) => {
    try {
      return await worker(item, index);
    } catch (error) {
      await onError?.(error, item, index);
      return undefined;
    }
  });
}

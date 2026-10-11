export interface InFlightCheck<T> {
  promise: Promise<T>;
  generation: number;
  tabId?: number;
}

/**
 * Per-key in-flight registry: join duplicate work, ignore stale completions.
 */
export class CheckCoordinator<T> {
  private readonly inflight = new Map<string, InFlightCheck<T>>();
  private generation = 0;

  isInFlight(key: string): boolean {
    return this.inflight.has(key);
  }

  inFlightKeys(): string[] {
    return [...this.inflight.keys()];
  }

  getGeneration(key: string): number | undefined {
    return this.inflight.get(key)?.generation;
  }

  setTabId(key: string, tabId: number): void {
    const entry = this.inflight.get(key);
    if (entry) {
      entry.tabId = tabId;
    }
  }

  getTabId(key: string): number | undefined {
    return this.inflight.get(key)?.tabId;
  }

  /**
   * Run `fn` for `key`, or join an existing in-flight promise for the same key.
   * `isCurrent` is true only for the latest generation of that key.
   */
  run(
    key: string,
    fn: (ctx: {
      generation: number;
      isCurrent: () => boolean;
      setTabId: (tabId: number) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing.promise;
    }

    const generation = ++this.generation;
    const isCurrent = () => this.inflight.get(key)?.generation === generation;

    // Register before invoking fn so sync isCurrent() calls see this run.
    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    this.inflight.set(key, { promise, generation });

    void fn({
      generation,
      isCurrent,
      setTabId: (tabId) => this.setTabId(key, tabId),
    }).then(
      (value) => {
        clearIfCurrent();
        resolvePromise(value);
      },
      (error: unknown) => {
        clearIfCurrent();
        rejectPromise(error);
      },
    );

    const clearIfCurrent = () => {
      const current = this.inflight.get(key);
      if (current?.generation === generation) {
        this.inflight.delete(key);
      }
    };

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

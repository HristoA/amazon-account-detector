/**
 * Single in-flight "All marketplaces" batch: join duplicate callers and expose
 * a lock so individual CHECK_AUTH requests no-op until the batch finishes.
 */
export class AllRefreshBatch {
  private promise: Promise<void> | null = null;
  private _inFlight = false;

  get inFlight(): boolean {
    return this._inFlight;
  }

  /** Join an in-flight batch, or start a new one. */
  run(fn: () => Promise<void>): Promise<void> {
    if (this.promise) {
      return this.promise;
    }
    this._inFlight = true;
    const promise = (async () => {
      try {
        await fn();
      } finally {
        // Clear before joiners resume so the post-batch broadcast sees unlocked.
        this._inFlight = false;
      }
    })().finally(() => {
      if (this.promise === promise) {
        this.promise = null;
      }
    });
    this.promise = promise;
    return promise;
  }
}

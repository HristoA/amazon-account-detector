import { describe, expect, it, vi } from 'vitest';
import { AllRefreshBatch } from './all-refresh';

describe('AllRefreshBatch', () => {
  it('joins a second run onto the in-flight batch', async () => {
    const batch = new AllRefreshBatch();
    let releases!: () => void;
    const gate = new Promise<void>((resolve) => {
      releases = resolve;
    });
    const worker = vi.fn(async () => {
      await gate;
    });

    const first = batch.run(worker);
    expect(batch.inFlight).toBe(true);

    const second = batch.run(worker);
    expect(worker).toHaveBeenCalledTimes(1);

    releases();
    await Promise.all([first, second]);
    expect(batch.inFlight).toBe(false);
  });

  it('starts a new batch after the previous one finishes', async () => {
    const batch = new AllRefreshBatch();
    const worker = vi.fn(async () => {});

    await batch.run(worker);
    await batch.run(worker);

    expect(worker).toHaveBeenCalledTimes(2);
    expect(batch.inFlight).toBe(false);
  });

  it('clears inFlight after the batch rejects', async () => {
    const batch = new AllRefreshBatch();
    const failing = batch.run(async () => {
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');
    expect(batch.inFlight).toBe(false);

    const worker = vi.fn(async () => {});
    await batch.run(worker);
    expect(worker).toHaveBeenCalledTimes(1);
  });

  it('clears inFlight before the joined promise settles', async () => {
    const batch = new AllRefreshBatch();
    let sawInFlightInside = false;

    await batch.run(async () => {
      sawInFlightInside = batch.inFlight;
    });

    expect(sawInFlightInside).toBe(true);
    expect(batch.inFlight).toBe(false);
  });
});

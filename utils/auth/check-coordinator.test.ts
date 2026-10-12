import { describe, expect, it, vi } from 'vitest';
import {
  CheckCoordinator,
  mapPool,
  mapPoolBestEffort,
} from './check-coordinator';

describe('CheckCoordinator', () => {
  it('joins concurrent runs for the same key', async () => {
    const coordinator = new CheckCoordinator<string>();
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });

    const [a, b] = await Promise.all([
      coordinator.run('amazon.com', fn),
      coordinator.run('amazon.com', fn),
    ]);

    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows a new run after the previous one finishes', async () => {
    const coordinator = new CheckCoordinator<number>();
    const first = vi.fn(async () => 1);
    const second = vi.fn(async () => 2);

    expect(await coordinator.run('m', first)).toBe(1);
    expect(await coordinator.run('m', second)).toBe(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(coordinator.isInFlight('m')).toBe(false);
  });

  it('clears in-flight state when the run rejects', async () => {
    const coordinator = new CheckCoordinator<number>();
    await expect(
      coordinator.run('m', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(coordinator.isInFlight('m')).toBe(false);

    expect(await coordinator.run('m', async () => 1)).toBe(1);
  });
});

describe('mapPool', () => {
  it('limits concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await mapPool(items, 2, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return n * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});

describe('mapPoolBestEffort', () => {
  it('continues after a worker throws and reports the error', async () => {
    const onError = vi.fn();
    const results = await mapPoolBestEffort(
      ['a', 'b', 'c'],
      2,
      async (id) => {
        if (id === 'b') throw new Error('boom');
        return id.toUpperCase();
      },
      onError,
    );

    expect(results).toEqual(['A', undefined, 'C']);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[1]).toBe('b');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CheckCoordinator, mapPool } from './check-coordinator';

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

  it('marks only the latest generation as current after a new run starts', async () => {
    const coordinator = new CheckCoordinator<number>();
    let firstIsCurrent: (() => boolean) | undefined;

    const first = coordinator.run('m', async ({ isCurrent }) => {
      firstIsCurrent = isCurrent;
      await new Promise((r) => setTimeout(r, 30));
      return 1;
    });

    // Wait a tick so first is registered, then it still holds the slot so
    // second joins — to test stale generation, finish first then start second.
    await first;
    expect(firstIsCurrent?.()).toBe(false);

    let secondGen = 0;
    await coordinator.run('m', async ({ generation, isCurrent }) => {
      secondGen = generation;
      expect(isCurrent()).toBe(true);
      return 2;
    });
    expect(secondGen).toBeGreaterThan(0);
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

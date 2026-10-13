import { describe, expect, it } from 'vitest';
import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('allows up to the limit to run concurrently', async () => {
    const gate = new Semaphore(1);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await gate.run(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(20);
        concurrent--;
      });
    };

    await Promise.all([task(), task(), task()]);
    expect(maxConcurrent).toBe(1);
  });

  it('allows the configured limit concurrently', async () => {
    const gate = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await gate.run(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(20);
        concurrent--;
      });
    };

    await Promise.all([task(), task(), task(), task()]);
    expect(maxConcurrent).toBe(2);
  });

  it('releases the slot even when the task throws', async () => {
    const gate = new Semaphore(1);

    await expect(
      gate.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    let ran = false;
    await gate.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { delay } from '@metamask/kernel-utils';
import { describe, it, expect } from 'vitest';

import { Mutex } from './mutex.ts';

describe('Mutex', () => {
  it('should run a callback and return its result', async () => {
    const mutex = new Mutex();
    const result = await mutex.runExclusive(async () => {
      await delay(10);
      return 'test';
    });
    expect(result).toBe('test');
  });

  it('should execute tasks sequentially', async () => {
    const mutex = new Mutex();
    const executionOrder: string[] = [];

    const task1 = mutex.runExclusive(async () => {
      executionOrder.push('start1');
      await delay(20);
      executionOrder.push('end1');
    });

    const task2 = mutex.runExclusive(async () => {
      executionOrder.push('start2');
      await delay(10);
      executionOrder.push('end2');
    });

    await Promise.all([task1, task2]);

    expect(executionOrder).toStrictEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('should release the lock even if the callback throws an error', async () => {
    const mutex = new Mutex();
    const results: string[] = [];

    await expect(
      mutex.runExclusive(async () => {
        results.push('task1 started');
        throw new Error('test error');
      }),
    ).rejects.toThrow('test error');

    await mutex.runExclusive(async () => {
      results.push('task2 started');
    });

    expect(results).toStrictEqual(['task1 started', 'task2 started']);
  });

  it('should handle multiple concurrent requests', async () => {
    const mutex = new Mutex();
    let counter = 0;
    const promises: Promise<void>[] = [];

    /* eslint-disable require-atomic-updates */
    const createExclusiveTask = () => async () => {
      const current = counter;
      await delay(Math.random() * 10);
      counter = current + 1;
    };
    /* eslint-enable require-atomic-updates */

    for (let i = 0; i < 5; i++) {
      promises.push(mutex.runExclusive(createExclusiveTask()));
    }

    await Promise.all(promises);
    expect(counter).toBe(5);
  });

  it('acquire and release should work correctly', async () => {
    const mutex = new Mutex();
    const events: string[] = [];

    await mutex.acquire();
    events.push('lock acquired');

    const concurrentPromise = (async () => {
      events.push('trying to acquire lock');
      await mutex.acquire();
      events.push('lock acquired again');
      mutex.release();
    })();

    await delay(10);
    events.push('releasing lock');
    mutex.release();

    await concurrentPromise;
    expect(events).toStrictEqual([
      'lock acquired',
      'trying to acquire lock',
      'releasing lock',
      'lock acquired again',
    ]);
  });
});

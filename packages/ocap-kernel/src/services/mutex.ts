import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';

/**
 * A mutual exclusion lock.
 *
 * This class provides a way to ensure that only one piece of code can execute
 * at a time. This is useful for protecting shared resources from race
 * conditions.
 *
 * @todo Could be extended to support an abort signal or timeout when acquiring
 * the lock for resilience if needed.
 */
export class Mutex {
  // Whether the lock is currently held.
  #locked = false;

  // List of waiters waiting for the lock.
  readonly #waiters: PromiseKit<void>[] = [];

  /**
   * Acquires the lock, runs the callback, and releases the lock.
   * This is the safest way to use the mutex.
   *
   * @param callback - The function to execute exclusively.
   * @returns A promise that resolves with the return value of the callback.
   */
  async runExclusive<Type>(callback: () => Promise<Type>): Promise<Type> {
    await this.acquire();
    try {
      return await callback();
    } finally {
      this.release();
    }
  }

  /**
   * Acquires the lock. If the lock is already held, it will wait until it is
   * released.
   */
  async acquire(): Promise<void> {
    if (!this.#locked) {
      this.#locked = true;
      return;
    }
    const waiter = makePromiseKit<void>();
    this.#waiters.push(waiter);
    await waiter.promise;
  }

  /**
   * Releases the lock, allowing the next waiting operation to proceed.
   *
   * @throws If the mutex is not locked.
   */
  release(): void {
    if (!this.#locked) {
      throw new Error('Cannot release an unlocked mutex.');
    }
    if (this.#waiters.length > 0) {
      const next = this.#waiters.shift();
      next?.resolve();
    } else {
      this.#locked = false;
    }
  }
}

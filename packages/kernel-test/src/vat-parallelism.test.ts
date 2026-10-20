import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { Kernel, KRef } from '@metamask/ocap-kernel';
import { beforeEach, describe, expect, it } from 'vitest';

import { getBundleSpec, makeKernel, makeTestLogger } from './utils.ts';

const VAT_COUNT = 4;
const SPIN_ITERATIONS = 12_000_000;
const SLEEP_MS = 300;

const vatNames = Array.from({ length: VAT_COUNT }, (_, i) => `vat${i}`);

const testSubcluster = {
  bootstrap: 'vat0',
  forceReset: true,
  vats: Object.fromEntries(
    vatNames.map((name) => [
      name,
      {
        bundleSpec: getBundleSpec('parallelism-vat'),
        globals: ['setTimeout' as const],
      },
    ]),
  ),
};

// Each vat runs in its own worker thread, but the run loop delivers one item at
// a time. So work that holds a delivery open runs one vat after another, and
// work a vat waits on outside a delivery overlaps.
describe('vat parallelism', () => {
  let kernel: Kernel;
  let roots: KRef[];

  /**
   * Send one message to each of the given vats at once, and time how long it
   * takes for all of them to answer.
   *
   * @param targets - The root krefs to send to.
   * @param method - The method to call on each.
   * @param arg - Its argument.
   * @returns The elapsed time in milliseconds.
   */
  const timeAll = async (
    targets: KRef[],
    method: 'spin' | 'sleep',
    arg: number,
  ): Promise<number> => {
    const start = performance.now();
    await Promise.all(
      targets.map(async (target) => kernel.queueMessage(target, method, [arg])),
    );
    return performance.now() - start;
  };

  // Launching the workers takes seconds.
  beforeEach(async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernel = await makeKernel(kernelDatabase, true, makeTestLogger().logger);
    const { vatRootKrefs } = await kernel.launchSubcluster(testSubcluster);
    roots = vatNames.map((name) => vatRootKrefs[name] as KRef);
    await waitUntilQuiescent();
    // Warm each worker's JIT so the first timed run isn't the slow one.
    await timeAll(roots, 'spin', SPIN_ITERATIONS);
  }, 60_000);

  it('runs k vats computing one after another, in about k times as long', async () => {
    let each = 0;
    for (const root of roots) {
      each += await timeAll([root], 'spin', SPIN_ITERATIONS);
    }
    const all = await timeAll(roots, 'spin', SPIN_ITERATIONS);

    expect(
      all / each,
      `each vat alone ${each.toFixed(0)} ms in total, ${VAT_COUNT} at once ${all.toFixed(0)} ms`,
    ).toBeGreaterThan(0.75);
  });

  it('runs k vats waiting at once, in about the time of one', async () => {
    const one = await timeAll(roots.slice(0, 1), 'sleep', SLEEP_MS);
    const all = await timeAll(roots, 'sleep', SLEEP_MS);

    expect(
      all / one,
      `one vat ${one.toFixed(0)} ms, ${VAT_COUNT} vats ${all.toFixed(0)} ms`,
    ).toBeLessThan(1.5);
  });
});

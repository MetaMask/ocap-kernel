import type { CapData } from '@endo/marshal';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { KernelQueue } from './KernelQueue.ts';
import type { KernelStore } from './store/index.ts';
import type { CrankResult, KRef, RunQueueItem } from './types.ts';

vi.mock('./garbage-collection/garbage-collection.ts', () => ({
  processGCActionSet: vi.fn().mockReturnValue(null),
}));

/**
 * `#processCrankResult` flushes the crank buffer last of the crank's own work,
 * "after the fallible work above, not before it", because the flush settles the
 * promise `enqueueMessage` gave an external caller and a later rollback would
 * discard the state that answer was computed from.
 *
 * `assertRefCountsIfAuditing` then runs after the flush, because a buffered
 * item's references were counted at enqueue time and so read as a leak if the
 * audit runs mid-flush. Both orderings are individually justified and they
 * contradict each other: the audit is fallible, it runs after the answers have
 * gone out, and a crank that throws there is rolled back by the run loop's catch.
 */
describe('a reference count audit that fails after the flush', () => {
  let kernelStore: KernelStore;
  let kernelQueue: KernelQueue;
  let resolveSubscription: (value: CapData<KRef>) => void;

  const AUDIT_FAILED = 'reference count invariant violated';

  beforeEach(() => {
    resolveSubscription = vi.fn();

    kernelStore = {
      startCrank: vi.fn(),
      endCrank: vi.fn(),
      createCrankSavepoint: vi.fn(),
      rollbackCrank: vi.fn(),
      nextTerminatedVatCleanup: vi.fn(),
      nextReapAction: vi.fn().mockReturnValue(null),
      runQueueLength: vi.fn().mockReturnValue(0),
      dequeueRun: vi.fn(),
      enqueueRun: vi.fn(),
      incrementRefCount: vi.fn(),
      collectGarbage: vi.fn(),
      // The buffered notify a successful crank flushes.
      flushCrankBuffer: vi
        .fn()
        .mockReturnValue([{ type: 'notify', endpointId: 'v1', kpid: 'kp1' }]),
      getKernelPromise: vi.fn().mockReturnValue({
        state: 'fulfilled',
        value: { body: '{}', slots: [] },
      }),
      // The audit the `auditRefCounts` option turns on, finding drift.
      assertRefCountsIfAuditing: vi.fn(() => {
        throw new Error(AUDIT_FAILED);
      }),
    } as unknown as KernelStore;

    kernelQueue = new KernelQueue(
      kernelStore,
      vi.fn().mockResolvedValue(undefined),
    );

    // An external caller waiting on `kp1`, as `enqueueMessage` leaves one.
    kernelQueue.subscriptions.set('kp1' as KRef, {
      resolve: resolveSubscription,
      reject: vi.fn(),
    });
  });

  it('does not answer the external caller it is about to roll back', async () => {
    const item: RunQueueItem = {
      type: 'notify',
      endpointId: 'v1',
      kpid: 'kp1' as KRef,
    } as RunQueueItem;
    vi.mocked(kernelStore.runQueueLength).mockReturnValueOnce(1);
    vi.mocked(kernelStore.dequeueRun).mockReturnValueOnce(item);

    const deliver = vi
      .fn<(queueItem: RunQueueItem) => Promise<CrankResult | undefined>>()
      .mockResolvedValue(undefined);

    await expect(kernelQueue.run(deliver)).rejects.toThrow(AUDIT_FAILED);

    // The flush invoked the subscription, so the caller has its answer...
    expect(resolveSubscription).toHaveBeenCalled();
    // ...and then the audit threw and the run loop rolled the delivery back
    // underneath it. One of these two has to go.
    expect(kernelStore.rollbackCrank).not.toHaveBeenCalledWith('delivery');
  });
});

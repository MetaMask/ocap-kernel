import { describe, it, expect, beforeEach } from 'vitest';

import { makeMapKernelDatabase } from '../../../test/storage.ts';
import { makeKernelStore } from '../index.ts';

describe('GC methods', () => {
  let kernelStore: ReturnType<typeof makeKernelStore>;

  beforeEach(() => {
    kernelStore = makeKernelStore(makeMapKernelDatabase());
  });

  describe('reachability tracking', () => {
    it('manages reachable flags', () => {
      const ko1 = kernelStore.initKernelObject('v1');
      kernelStore.addCListEntry('v1', ko1, 'o-1');

      expect(kernelStore.getReachableFlag('v1', ko1)).toBe(true);

      kernelStore.clearReachableFlag('v1', ko1);
      expect(kernelStore.getReachableFlag('v1', ko1)).toBe(false);

      const refCounts = kernelStore.getObjectRefCount(ko1);
      expect(refCounts.reachable).toBe(0);
    });
  });
});

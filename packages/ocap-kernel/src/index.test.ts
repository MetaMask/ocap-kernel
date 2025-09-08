import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'CapDataStruct',
      'ClusterConfigStruct',
      'Kernel',
      'KernelStatusStruct',
      'SubclusterStruct',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'initNetwork',
      'isVatConfig',
      'isVatId',
      'krefOf',
      'kser',
      'kslot',
      'kunser',
      'makeKernelStore',
      'parseRef',
    ]);
  });
});

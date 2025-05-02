import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'CapDataStruct',
      'ClusterConfigStruct',
      'Kernel',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'isVatConfig',
      'isVatId',
      'kser',
      'kunser',
      'makeKernelStore',
      'parseRef',
    ]);
  });
});

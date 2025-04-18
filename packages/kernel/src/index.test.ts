import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ClusterConfigStruct',
      'Kernel',
      'KernelCommandMethod',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'isKernelCommand',
      'isKernelCommandReply',
      'isVatConfig',
      'isVatId',
      'kser',
      'kunser',
      'makeKernelStore',
      'parseRef',
    ]);
  });
});

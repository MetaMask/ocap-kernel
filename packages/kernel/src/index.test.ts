import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ClusterConfigStruct',
      'Kernel',
      'KernelCommandMethod',
      'VatCommandMethod',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'isKernelCommand',
      'isKernelCommandReply',
      'isVatCommand',
      'isVatCommandPayloadUI',
      'isVatCommandReply',
      'isVatConfig',
      'isVatId',
      'kser',
      'kunser',
      'makeKernelStore',
      'parseRef',
    ]);
  });
});

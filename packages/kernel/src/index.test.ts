import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ClusterConfigStruct',
      'Kernel',
      'KernelCommandMethod',
      'KernelSendVatCommandStruct',
      'MessageResolver',
      'VatCommandMethod',
      'VatConfigStruct',
      'VatHandle',
      'VatIdStruct',
      'VatSupervisor',
      'VatWorkerServiceCommandMethod',
      'isKernelCommand',
      'isKernelCommandReply',
      'isVatCommand',
      'isVatCommandReply',
      'isVatConfig',
      'isVatId',
      'isVatWorkerServiceCommand',
      'isVatWorkerServiceReply',
    ]);
  });
});

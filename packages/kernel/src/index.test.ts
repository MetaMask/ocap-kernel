import { describe, it, expect } from 'vitest';
import '@ocap/test-utils';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'Kernel',
      'KernelCommandMethod',
      'KernelSendMessageStruct',
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

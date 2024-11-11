import '@ocap/shims/endoify';
import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'Kernel',
      'KernelCommandMethod',
      'KernelSendMessageStruct',
      'Supervisor',
      'Vat',
      'VatCommandMethod',
      'VatIdStruct',
      'VatWorkerServiceCommandMethod',
      'isKernelCommand',
      'isKernelCommandReply',
      'isVatCommand',
      'isVatCommandReply',
      'isVatId',
      'isVatWorkerServiceCommand',
      'isVatWorkerServiceCommandReply',
    ]);
  });
});

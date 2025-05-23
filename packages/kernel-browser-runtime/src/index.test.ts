import { describe, expect, it } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'VatWorkerClient',
      'VatWorkerServer',
      'establishKernelConnection',
      'makeIframeVatWorker',
      'receiveUiConnections',
      'rpcHandlers',
      'rpcMethodSpecs',
    ]);
  });
});

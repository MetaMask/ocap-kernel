import { describe, expect, it } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'PlatformServicesClient',
      'PlatformServicesServer',
      'UIOrchestrator',
      'connectToKernel',
      'createRelayQueryString',
      'getCapTPMessage',
      'getRelaysFromCurrentLocation',
      'handleConsoleForwardMessage',
      'isCapTPNotification',
      'isConsoleForwardMessage',
      'makeBackgroundCapTP',
      'makeCapTPNotification',
      'makeIframeVatWorker',
      'makeUIVatWorker',
      'parseRelayQueryString',
      'receiveInternalConnections',
      'rpcHandlers',
      'rpcMethodSpecs',
      'setupConsoleForwarding',
    ]);
  });
});

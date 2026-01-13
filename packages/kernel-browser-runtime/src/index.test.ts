import '@ocap/repo-tools/test-utils/mock-endoify';

import { describe, expect, it } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'PlatformServicesClient',
      'PlatformServicesServer',
      'connectToKernel',
      'createRelayQueryString',
      'getCapTPMessage',
      'getRelaysFromCurrentLocation',
      'isCapTPNotification',
      'makeBackgroundCapTP',
      'makeBackgroundKref',
      'makeCapTPNotification',
      'makeIframeVatWorker',
      'parseRelayQueryString',
      'receiveInternalConnections',
      'rpcHandlers',
      'rpcMethodSpecs',
    ]);
  });
});

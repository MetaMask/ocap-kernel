import '@ocap/test-utils/mock-endoify';
import { describe, it, expect } from 'vitest';

import * as indexModule from './index.js';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'ChromeRuntimeDuplexStream',
      'ChromeRuntimeMultiplexer',
      'ChromeRuntimeReader',
      'ChromeRuntimeTarget',
      'ChromeRuntimeWriter',
      'MessagePortDuplexStream',
      'MessagePortMultiplexer',
      'MessagePortReader',
      'MessagePortWriter',
      'NodeWorkerDuplexStream',
      'NodeWorkerMultiplexer',
      'NodeWorkerReader',
      'NodeWorkerWriter',
      'PostMessageDuplexStream',
      'PostMessageReader',
      'PostMessageWriter',
      'StreamMultiplexer',
      'initializeMessageChannel',
      'isMultiplexEnvelope',
      'receiveMessagePort',
    ]);
  });
});

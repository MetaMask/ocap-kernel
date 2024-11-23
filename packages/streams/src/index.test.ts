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

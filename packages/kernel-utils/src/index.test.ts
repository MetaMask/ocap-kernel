import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'DEFAULT_BASE_DELAY_MS',
      'DEFAULT_MAX_DELAY_MS',
      'DEFAULT_MAX_RETRY_ATTEMPTS',
      'EmptyJsonArray',
      'GET_DESCRIPTION',
      'abortableDelay',
      'calculateReconnectionBackoff',
      'delay',
      'fetchValidatedJson',
      'fromHex',
      'ifDefined',
      'installWakeDetector',
      'isCapData',
      'isJsonRpcCall',
      'isJsonRpcMessage',
      'isPrimitive',
      'isTypedArray',
      'isTypedObject',
      'isVatBundle',
      'makeCounter',
      'makeDefaultExo',
      'makeDefaultInterface',
      'makeDiscoverableExo',
      'mergeDisjointRecords',
      'prettifyCapData',
      'retry',
      'retryWithBackoff',
      'stringify',
      'toHex',
      'waitUntilQuiescent',
    ]);
  });
});

import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'DEFAULT_BASE_DELAY_MS',
      'DEFAULT_MAX_DELAY_MS',
      'DEFAULT_MAX_RETRY_ATTEMPTS',
      'EmptyJsonArray',
      'abortableDelay',
      'calculateReconnectionBackoff',
      'delay',
      'fetchValidatedJson',
      'fromHex',
      'installWakeDetector',
      'isJsonRpcCall',
      'isJsonRpcMessage',
      'isPrimitive',
      'isTypedArray',
      'isTypedObject',
      'makeCounter',
      'makeDefaultExo',
      'makeDefaultInterface',
      'mergeDisjointRecords',
      'retry',
      'retryWithBackoff',
      'stringify',
      'toHex',
      'waitUntilQuiescent',
    ]);
  });
});

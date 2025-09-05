import { describe, it, expect } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'EmptyJsonArray',
      'delay',
      'fetchValidatedJson',
      'fromHex',
      'isJsonRpcCall',
      'isJsonRpcMessage',
      'isPrimitive',
      'isTypedArray',
      'isTypedObject',
      'makeCounter',
      'makeDefaultExo',
      'makeDefaultInterface',
      'objectDisjointUnion',
      'stringify',
      'toHex',
      'waitUntilQuiescent',
    ]);
  });
});

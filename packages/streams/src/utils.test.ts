import { describe, expect, it } from 'vitest';

import {
  assertIsWritable,
  ErrorSentinel,
  makePendingResult,
  unmarshalError,
} from './utils.js';

describe('assertIsWritable', () => {
  it('should throw if the value is not a Writable', () => {
    expect(() => assertIsWritable({})).toThrow(
      'Invalid writable value: must be IteratorResult or Error.',
    );
  });

  it.each([makePendingResult('foo'), new Error('foo')])(
    'should not throw if the value is a Writable',
    (value) => {
      expect(() => assertIsWritable(value)).not.toThrow();
    },
  );
});

describe('unmarshalError', () => {
  it('should unmarshal a marshaled error', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
    } as const;
    expect(unmarshalError(marshaledError)).toStrictEqual(
      expect.objectContaining({
        message: 'foo',
        stack: 'bar',
      }),
    );
  });

  it('should unmarshal a marshaled error, with a cause', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'foo',
      stack: 'bar',
      cause: {
        [ErrorSentinel]: true,
        message: 'baz',
        stack: 'qux',
      },
    } as const;
    expect(unmarshalError(marshaledError)).toStrictEqual(
      expect.objectContaining({
        message: 'foo',
        stack: 'bar',
        cause: expect.objectContaining({
          message: 'baz',
          stack: 'qux',
        }),
      }),
    );
  });
});

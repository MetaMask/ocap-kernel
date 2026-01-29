import { describe, it, expect } from 'vitest';

import { ResourceLimitError } from './ResourceLimitError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('ResourceLimitError', () => {
  it('creates a ResourceLimitError with the correct properties', () => {
    const error = new ResourceLimitError('Connection limit exceeded');
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.code).toBe(ErrorCode.ResourceLimitError);
    expect(error.message).toBe('Connection limit exceeded');
    expect(error.data).toBeUndefined();
  });

  it('creates a ResourceLimitError with connection limit data', () => {
    const error = new ResourceLimitError('Connection limit exceeded', {
      data: {
        limitType: 'connection',
        current: 100,
        limit: 100,
      },
    });
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.code).toBe(ErrorCode.ResourceLimitError);
    expect(error.message).toBe('Connection limit exceeded');
    expect(error.data).toStrictEqual({
      limitType: 'connection',
      current: 100,
      limit: 100,
    });
  });

  it('creates a ResourceLimitError with message size limit data', () => {
    const error = new ResourceLimitError('Message size limit exceeded', {
      data: {
        limitType: 'messageSize',
        current: 1048577,
        limit: 1048576,
      },
    });
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.code).toBe(ErrorCode.ResourceLimitError);
    expect(error.message).toBe('Message size limit exceeded');
    expect(error.data).toStrictEqual({
      limitType: 'messageSize',
      current: 1048577,
      limit: 1048576,
    });
  });

  it('creates a ResourceLimitError with partial data', () => {
    const error = new ResourceLimitError('Resource limit exceeded', {
      data: {
        limitType: 'connection',
      },
    });
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.data).toStrictEqual({
      limitType: 'connection',
    });
  });

  it('creates a ResourceLimitError with a cause', () => {
    const cause = new Error('Original error');
    const error = new ResourceLimitError('Resource limit exceeded', { cause });
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.code).toBe(ErrorCode.ResourceLimitError);
    expect(error.cause).toBe(cause);
  });

  it('creates a ResourceLimitError with a custom stack', () => {
    const customStack = 'custom stack trace';
    const error = new ResourceLimitError('Resource limit exceeded', {
      stack: customStack,
    });
    expect(error).toBeInstanceOf(ResourceLimitError);
    expect(error.stack).toBe(customStack);
  });

  it('unmarshals a valid marshaled ResourceLimitError with connection limit data', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Connection limit exceeded',
      code: ErrorCode.ResourceLimitError,
      data: {
        limitType: 'connection',
        current: 100,
        limit: 100,
      },
      stack: 'stack trace',
    };

    const unmarshaledError = ResourceLimitError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(ResourceLimitError);
    expect(unmarshaledError.code).toBe(ErrorCode.ResourceLimitError);
    expect(unmarshaledError.message).toBe('Connection limit exceeded');
    expect(unmarshaledError.stack).toBe('stack trace');
    expect(unmarshaledError.data).toStrictEqual({
      limitType: 'connection',
      current: 100,
      limit: 100,
    });
  });

  it('unmarshals a valid marshaled ResourceLimitError with message size limit data', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Message size limit exceeded',
      code: ErrorCode.ResourceLimitError,
      data: {
        limitType: 'messageSize',
        current: 1048577,
        limit: 1048576,
      },
      stack: 'stack trace',
    };

    const unmarshaledError = ResourceLimitError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(ResourceLimitError);
    expect(unmarshaledError.code).toBe(ErrorCode.ResourceLimitError);
    expect(unmarshaledError.message).toBe('Message size limit exceeded');
    expect(unmarshaledError.data).toStrictEqual({
      limitType: 'messageSize',
      current: 1048577,
      limit: 1048576,
    });
  });

  it('unmarshals a valid marshaled ResourceLimitError without data', () => {
    const marshaledError = {
      [ErrorSentinel]: true,
      message: 'Resource limit exceeded',
      code: ErrorCode.ResourceLimitError,
      stack: 'stack trace',
    } as unknown as MarshaledOcapError;

    const unmarshaledError = ResourceLimitError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(ResourceLimitError);
    expect(unmarshaledError.code).toBe(ErrorCode.ResourceLimitError);
    expect(unmarshaledError.message).toBe('Resource limit exceeded');
    expect(unmarshaledError.data).toBeUndefined();
  });

  it.each([
    {
      name: 'invalid limitType value',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Resource limit exceeded',
        code: ErrorCode.ResourceLimitError,
        data: {
          limitType: 'invalid',
          current: 100,
          limit: 100,
        },
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: data.limitType -- Expected the value to satisfy a union of `literal | literal | literal | literal`, but received: "invalid"',
    },
    {
      name: 'invalid current type',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Resource limit exceeded',
        code: ErrorCode.ResourceLimitError,
        data: {
          limitType: 'connection',
          current: 'not a number',
          limit: 100,
        },
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: data.current -- Expected a number, but received: "not a number"',
    },
    {
      name: 'invalid limit type',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Resource limit exceeded',
        code: ErrorCode.ResourceLimitError,
        data: {
          limitType: 'connection',
          current: 100,
          limit: 'not a number',
        },
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: data.limit -- Expected a number, but received: "not a number"',
    },
    {
      name: 'wrong error code',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Resource limit exceeded',
        code: 'WRONG_ERROR_CODE' as ErrorCode,
        stack: 'stack trace',
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"RESOURCE_LIMIT_ERROR"`, but received: "WRONG_ERROR_CODE"',
    },
    {
      name: 'missing required fields',
      marshaledError: {
        [ErrorSentinel]: true,
        message: 'Resource limit exceeded',
        // Missing code field
      } as unknown as MarshaledOcapError,
      expectedError:
        'At path: code -- Expected the literal `"RESOURCE_LIMIT_ERROR"`, but received: undefined',
    },
  ])(
    'throws an error when unmarshaling with $name',
    ({ marshaledError, expectedError }) => {
      expect(() =>
        ResourceLimitError.unmarshal(marshaledError, unmarshalErrorOptions),
      ).toThrow(expectedError);
    },
  );
});

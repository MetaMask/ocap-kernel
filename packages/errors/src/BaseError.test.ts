import { describe, it, expect } from 'vitest';

import { BaseError } from './BaseError.js';
import { ErrorCode } from './constants.js';
import type { MarshaledOcapError } from './types.js';

describe('BaseError', () => {
  const mockCode = ErrorCode.VatNotFound;
  const mockMessage = 'VAT was not found.';
  const mockData = { key: 'value' };
  const mockCause = new Error('Root cause error');

  it('creates a BaseError with required properties', () => {
    const error = new BaseError(mockCode, mockMessage);
    expect(error).toBeInstanceOf(BaseError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BaseError');
    expect(error.message).toBe(mockMessage);
    expect(error.code).toBe(mockCode);
    expect(error.data).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('creates a BaseError with all properties', () => {
    const error = new BaseError(mockCode, mockMessage, mockData, mockCause);
    expect(error.name).toBe('BaseError');
    expect(error.message).toBe(mockMessage);
    expect(error.code).toBe(mockCode);
    expect(error.data).toStrictEqual(mockData);
    expect(error.cause).toBe(mockCause);
  });

  it('inherits from the Error class and have the correct name', () => {
    const error = new BaseError(mockCode, mockMessage);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('BaseError');
  });

  it('handles a missing data parameter', () => {
    const error = new BaseError(mockCode, mockMessage, undefined, mockCause);
    expect(error.data).toBeUndefined();
    expect(error.cause).toBe(mockCause);
  });

  it('handles a missing cause parameter', () => {
    const error = new BaseError(mockCode, mockMessage, mockData);
    expect(error.data).toStrictEqual(mockData);
    expect(error.cause).toBeUndefined();
  });

  it('throws an error when unmarshal is called', () => {
    expect(() => BaseError.unmarshal({} as MarshaledOcapError)).toThrow(
      'Unmarshal method not implemented',
    );
  });
});

import { describe, it, expect } from 'vitest';

import { VatAlreadyExistsError } from './VatAlreadyExistsError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('VatAlreadyExistsError', () => {
  const mockVatId = 'mockVatId';

  it('creates a VatAlreadyExistsError with the correct properties', () => {
    const error = new VatAlreadyExistsError(mockVatId);
    expect(error).toBeInstanceOf(VatAlreadyExistsError);
    expect(error.code).toBe(ErrorCode.VatAlreadyExists);
    expect(error.message).toBe('Vat already exists.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat already exists.',
      code: ErrorCode.VatAlreadyExists,
      data: { vatId: mockVatId },
      stack: 'stack trace',
    };

    const unmarshaledError = VatAlreadyExistsError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(VatAlreadyExistsError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatAlreadyExists);
    expect(unmarshaledError.message).toBe('Vat already exists.');
    expect(unmarshaledError.stack).toBe('stack trace');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat already exists.',
      code: ErrorCode.VatAlreadyExists,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() =>
      VatAlreadyExistsError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(
      'At path: data -- Expected an object, but received: "{ vatId: mockVatId }"',
    );
  });
});

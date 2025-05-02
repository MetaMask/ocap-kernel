import { describe, it, expect } from 'vitest';

import { VatDeletedError } from './VatDeletedError.ts';
import { ErrorCode, ErrorSentinel } from '../constants.ts';
import { unmarshalErrorOptions } from '../marshal/unmarshalError.ts';
import type { MarshaledOcapError } from '../types.ts';

describe('VatDeletedError', () => {
  const mockVatId = 'mockVatId';

  it('creates a VatDeletedError with the correct properties', () => {
    const error = new VatDeletedError(mockVatId);
    expect(error).toBeInstanceOf(VatDeletedError);
    expect(error.code).toBe(ErrorCode.VatDeleted);
    expect(error.message).toBe('Vat was deleted.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat was deleted.',
      code: ErrorCode.VatDeleted,
      data: { vatId: mockVatId },
      stack: 'stack trace',
    };

    const unmarshaledError = VatDeletedError.unmarshal(
      marshaledError,
      unmarshalErrorOptions,
    );
    expect(unmarshaledError).toBeInstanceOf(VatDeletedError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatDeleted);
    expect(unmarshaledError.message).toBe('Vat was deleted.');
    expect(unmarshaledError.stack).toBe('stack trace');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat was deleted.',
      code: ErrorCode.VatDeleted,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() =>
      VatDeletedError.unmarshal(marshaledError, unmarshalErrorOptions),
    ).toThrow(
      'At path: data -- Expected an object, but received: "{ vatId: mockVatId }"',
    );
  });
});

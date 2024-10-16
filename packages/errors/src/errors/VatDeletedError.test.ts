import { describe, it, expect } from 'vitest';

import { VatDeletedError } from './VatDeletedError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

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

    const unmarshaledError = VatDeletedError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(VatDeletedError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatDeleted);
    expect(unmarshaledError.message).toBe('Vat was deleted.');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws when an invalid messages is unmarshal marshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat was deleted.',
      code: ErrorCode.VatDeleted,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() => VatDeletedError.unmarshal(marshaledError)).toThrow(
      'Invalid VatDeletedError structure',
    );
  });
});

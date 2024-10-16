import { describe, it, expect } from 'vitest';

import { VatNotFoundError } from './VatNotFoundError.js';
import type { MarshaledOcapError } from '../types.js';
import { ErrorCode, ErrorSentinel } from '../types.js';

describe('VatNotFoundError', () => {
  const mockVatId = 'mockVatId';

  it('creates a VatNotFoundError with the correct properties', () => {
    const error = new VatNotFoundError(mockVatId);
    expect(error).toBeInstanceOf(VatNotFoundError);
    expect(error.code).toBe(ErrorCode.VatNotFound);
    expect(error.message).toBe('Vat does not exist.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat does not exist.',
      code: ErrorCode.VatNotFound,
      data: { vatId: mockVatId },
      stack: 'stack trace',
    };

    const unmarshaledError = VatNotFoundError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(VatNotFoundError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatNotFound);
    expect(unmarshaledError.message).toBe('Vat does not exist.');
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws when an invalid messages is unmarshal marshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat does not exist.',
      code: ErrorCode.VatNotFound,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() => VatNotFoundError.unmarshal(marshaledError)).toThrow(
      'Invalid VatNotFoundError structure',
    );
  });
});

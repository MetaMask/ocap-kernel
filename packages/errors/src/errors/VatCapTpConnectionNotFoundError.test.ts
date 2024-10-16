import { describe, it, expect } from 'vitest';

import { VatCapTpConnectionNotFoundError } from './VatCapTpConnectionNotFoundError.js';
import type { MarshaledOcapError } from '../types.js';
import { ErrorCode, ErrorSentinel } from '../types.js';

describe('VatCapTpConnectionNotFoundError', () => {
  const mockVatId = 'mockVatId';

  it('creates a VatCapTpConnectionNotFoundError with the correct properties', () => {
    const error = new VatCapTpConnectionNotFoundError(mockVatId);
    expect(error).toBeInstanceOf(VatCapTpConnectionNotFoundError);
    expect(error.code).toBe(ErrorCode.VatCapTpConnectionNotFound);
    expect(error.message).toBe('Vat does not have a CapTP connection.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat does not have a CapTP connection.',
      code: ErrorCode.VatCapTpConnectionNotFound,
      data: { vatId: mockVatId },
      stack: 'stack trace',
    };

    const unmarshaledError =
      VatCapTpConnectionNotFoundError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(VatCapTpConnectionNotFoundError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatCapTpConnectionNotFound);
    expect(unmarshaledError.message).toBe(
      'Vat does not have a CapTP connection.',
    );
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws when an invalid messages is unmarshal marshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat does not have a CapTP connection.',
      code: ErrorCode.VatCapTpConnectionNotFound,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() =>
      VatCapTpConnectionNotFoundError.unmarshal(marshaledError),
    ).toThrow('Invalid VatCapTpConnectionNotFoundError structure');
  });
});

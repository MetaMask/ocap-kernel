import { describe, it, expect } from 'vitest';

import { VatCapTpConnectionExistsError } from './VatCapTpConnectionExistsError.js';
import { ErrorCode, ErrorSentinel } from '../constants.js';
import type { MarshaledOcapError } from '../types.js';

describe('VatCapTpConnectionExistsError', () => {
  const mockVatId = 'mockVatId';

  it('creates a VatCapTpConnectionExistsError with the correct properties', () => {
    const error = new VatCapTpConnectionExistsError(mockVatId);
    expect(error).toBeInstanceOf(VatCapTpConnectionExistsError);
    expect(error.code).toBe(ErrorCode.VatCapTpConnectionExists);
    expect(error.message).toBe('Vat already has a CapTP connection.');
    expect(error.data).toStrictEqual({ vatId: mockVatId });
    expect(error.cause).toBeUndefined();
  });

  it('unmarshals a valid marshaled error', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat already has a CapTP connection.',
      code: ErrorCode.VatCapTpConnectionExists,
      data: { vatId: mockVatId },
      stack: 'stack trace',
    };

    const unmarshaledError =
      VatCapTpConnectionExistsError.unmarshal(marshaledError);
    expect(unmarshaledError).toBeInstanceOf(VatCapTpConnectionExistsError);
    expect(unmarshaledError.code).toBe(ErrorCode.VatCapTpConnectionExists);
    expect(unmarshaledError.message).toBe(
      'Vat already has a CapTP connection.',
    );
    expect(unmarshaledError.data).toStrictEqual({
      vatId: mockVatId,
    });
  });

  it('throws an error when an invalid message is unmarshaled', () => {
    const marshaledError: MarshaledOcapError = {
      [ErrorSentinel]: true,
      message: 'Vat already has a CapTP connection.',
      code: ErrorCode.VatCapTpConnectionExists,
      data: '{ vatId: mockVatId }',
      stack: 'stack trace',
    };

    expect(() =>
      VatCapTpConnectionExistsError.unmarshal(marshaledError),
    ).toThrow(
      'At path: data -- Expected an object, but received: "{ vatId: mockVatId }"',
    );
  });
});

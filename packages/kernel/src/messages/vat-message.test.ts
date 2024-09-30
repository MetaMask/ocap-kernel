import { describe, expect, it } from 'vitest';

import { isVatMessage } from './vat-message.js';
import { VatCommandMethod } from './vat.js';

describe('isVatMessage', () => {
  const validPayload = { method: VatCommandMethod.Evaluate, params: '3 + 3' };

  it.each`
    value                                              | expectedResult | description
    ${{ id: 'v0:1', payload: validPayload }}           | ${true}        | ${'valid message id with valid payload'}
    ${{ id: 'vat-message-id', payload: validPayload }} | ${false}       | ${'invalid id'}
    ${{ id: 1, payload: validPayload }}                | ${false}       | ${'numerical id'}
    ${{ id: 'v0:1' }}                                  | ${false}       | ${'missing payload'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isVatMessage(value)).toBe(expectedResult);
  });
});

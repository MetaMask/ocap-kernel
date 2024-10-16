import { describe, expect, it } from 'vitest';

import { isVatCommand, VatCommandMethod } from './vat.js';

describe('isVatCommand', () => {
  const payload = { method: VatCommandMethod.Evaluate, params: '3 + 3' };

  it.each`
    value                                | expectedResult | description
    ${{ id: 'v0:1', payload }}           | ${true}        | ${'valid message id with valid payload'}
    ${{ id: 'vat-message-id', payload }} | ${false}       | ${'invalid id'}
    ${{ id: 1, payload }}                | ${false}       | ${'numerical id'}
    ${{ id: 'v0:1' }}                    | ${false}       | ${'missing payload'}
  `('returns $expectedResult for $description', ({ value, expectedResult }) => {
    expect(isVatCommand(value)).toBe(expectedResult);
  });
});

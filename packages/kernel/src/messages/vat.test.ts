import { describe, expect, it } from 'vitest';

import { isVatCommand, isVatCommandReply, VatCommandMethod } from './vat.ts';

describe('isVatCommand', () => {
  const payload = { method: VatCommandMethod.ping, params: [] };

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

describe('isVatCommandReply', () => {
  it.each([
    {
      name: 'ping reply',
      value: {
        id: 'v0:456',
        payload: {
          method: VatCommandMethod.ping,
          params: 'pong',
        },
      },
      expected: true,
    },
    {
      name: 'invalid id format',
      value: {
        id: 'invalid-id',
        payload: {
          method: VatCommandMethod.ping,
          params: 'pong',
        },
      },
      expected: false,
    },
    {
      name: 'invalid method',
      value: {
        id: 'test-vat:123',
        payload: {
          method: 'invalidMethod',
          params: 'result',
        },
      },
      expected: false,
    },
    {
      name: 'missing payload',
      value: {
        id: 'test-vat:123',
      },
      expected: false,
    },
    {
      name: 'null value',
      value: null,
      expected: false,
    },
  ])('should return $expected for $name', ({ value, expected }) => {
    expect(isVatCommandReply(value)).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isVatCommand,
  isVatCommandReply,
  VatCommandMethod,
  isVatMessageStreamId,
} from './vat.js';

describe('isVatCommand', () => {
  const payload = { method: VatCommandMethod.ping, params: null };

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
      name: 'capTpInit reply',
      value: {
        id: 'v0:789',
        payload: {
          method: VatCommandMethod.capTpInit,
          params: 'initialized',
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

describe('isVatMessageStreamId', () => {
  it.each([
    ['v0:1', true, 'valid vat message id'],
    ['v123:456', true, 'valid vat message id with larger numbers'],
    ['v1_supervisor:789', true, 'valid supervisor message id'],
    [
      'v123_supervisor:456',
      true,
      'valid supervisor message id with larger numbers',
    ],
    ['v01:1', true, 'valid vat id with leading zero'],
    ['v1:01', true, 'message number with leading zero'],
    ['v:1', false, 'invalid vat id part'],
    ['v1.2:1', false, 'invalid vat id with decimal'],
    ['v1_super:1', false, 'invalid supervisor suffix'],
    ['x1:1', false, 'invalid prefix'],
    ['v1:', false, 'missing number part'],
    ['v1:abc', false, 'non-numeric message number'],
    ['v1:1.2', false, 'decimal message number'],
    ['v1:-1', false, 'negative message number'],
    ['', false, 'empty string'],
    [123, false, 'non-string value'],
    [null, false, 'null value'],
    [undefined, false, 'undefined value'],
  ])('returns %s for %s', (value, expected, _description) => {
    expect(isVatMessageStreamId(value)).toBe(expected);
  });
});

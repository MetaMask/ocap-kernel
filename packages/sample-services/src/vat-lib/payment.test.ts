import { describe, expect, it } from 'vitest';

import { assertPayment, PAYMENT_ARG_SCHEMA, USD_TO_CENTS } from './payment.ts';

describe('assertPayment', () => {
  const tag = 'test-service.someMethod';

  it('accepts a well-formed Money whose amount matches', () => {
    expect(() =>
      assertPayment({ amount: 1_200, auth: 'abc123' }, 1_200, tag),
    ).not.toThrow();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not a money'],
    ['a number', 42],
    ['a boolean', true],
  ])('throws when payment is %s', (_label, payment) => {
    expect(() => assertPayment(payment, 100, tag)).toThrow(
      /expected a payment object/u,
    );
  });

  it.each([
    ['negative', { amount: -1, auth: 'x' }],
    ['fractional', { amount: 1.5, auth: 'x' }],
    ['NaN', { amount: Number.NaN, auth: 'x' }],
    ['Infinity', { amount: Number.POSITIVE_INFINITY, auth: 'x' }],
    ['a string', { amount: '100', auth: 'x' }],
    ['missing', { auth: 'x' }],
  ])('rejects a %s amount', (_label, payment) => {
    expect(() => assertPayment(payment, 100, tag)).toThrow(
      /payment\.amount must be a non-negative integer/u,
    );
  });

  it.each([
    ['missing', { amount: 100 }],
    ['empty', { amount: 100, auth: '' }],
    ['a number', { amount: 100, auth: 42 }],
  ])('rejects a %s auth', (_label, payment) => {
    expect(() => assertPayment(payment, 100, tag)).toThrow(
      /payment\.auth must be a non-empty string/u,
    );
  });

  it('rejects a payment whose amount does not match the expected price', () => {
    expect(() =>
      assertPayment({ amount: 500, auth: 'ok' }, 1_200, tag),
    ).toThrow(/500 cents does not match the expected price of 1200 cents/u);
  });

  it('includes the method tag in error messages', () => {
    expect(() =>
      assertPayment({ amount: 5, auth: 'x' }, 10, 'foo.bar'),
    ).toThrow(/^foo\.bar:/u);
  });
});

describe('USD_TO_CENTS', () => {
  it('is 100', () => {
    expect(USD_TO_CENTS).toBe(100);
  });
});

describe('PAYMENT_ARG_SCHEMA', () => {
  it('describes a payment object with amount + auth as required', () => {
    expect(PAYMENT_ARG_SCHEMA).toMatchObject({
      type: 'object',
      properties: {
        amount: { type: 'number' },
        auth: { type: 'string' },
      },
      required: ['amount', 'auth'],
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  assertPayment,
  mintAuth,
  PAYMENT_ARG_SCHEMA,
  USD_TO_CENTS,
} from './payment.ts';

describe('assertPayment', () => {
  const tag = 'test-service.someMethod';

  it('accepts a well-formed Money whose amount matches and whose auth is valid', async () => {
    const auth = await mintAuth(1_200);
    expect(
      await assertPayment({ amount: 1_200, auth }, 1_200, tag),
    ).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'not a money'],
    ['a number', 42],
    ['a boolean', true],
  ])('throws when payment is %s', async (_label, payment) => {
    await expect(assertPayment(payment, 100, tag)).rejects.toThrow(
      /expected a payment object/u,
    );
  });

  it.each([
    ['negative', { amount: -1, auth: 'x.y' }],
    ['fractional', { amount: 1.5, auth: 'x.y' }],
    ['NaN', { amount: Number.NaN, auth: 'x.y' }],
    ['Infinity', { amount: Number.POSITIVE_INFINITY, auth: 'x.y' }],
    ['a string', { amount: '100', auth: 'x.y' }],
    ['missing', { auth: 'x.y' }],
  ])('rejects a %s amount', async (_label, payment) => {
    await expect(assertPayment(payment, 100, tag)).rejects.toThrow(
      /payment\.amount must be a non-negative integer/u,
    );
  });

  it.each([
    ['missing', { amount: 100 }],
    ['empty', { amount: 100, auth: '' }],
    ['a number', { amount: 100, auth: 42 }],
  ])('rejects a %s auth', async (_label, payment) => {
    await expect(assertPayment(payment, 100, tag)).rejects.toThrow(
      /payment\.auth must be a non-empty string/u,
    );
  });

  it('rejects a payment whose amount does not match the expected price', async () => {
    const auth = await mintAuth(500);
    await expect(
      assertPayment({ amount: 500, auth }, 1_200, tag),
    ).rejects.toThrow(/500 cents does not match the expected price of 1200/u);
  });

  it.each([
    ['no dot', 'plainstringnosdot'],
    ['starts with dot', '.macpart'],
    ['ends with dot', 'noncepart.'],
  ])('rejects a malformed %s auth', async (_label, auth) => {
    await expect(
      assertPayment({ amount: 100, auth }, 100, tag),
    ).rejects.toThrow(/malformed|failed verification/u);
  });

  it('rejects a payment whose auth was minted for a different amount', async () => {
    const stolenAuth = await mintAuth(1_200);
    // Same auth, but claim it's for a different amount — the MAC binds
    // to the amount, so verification fails.
    await expect(
      assertPayment({ amount: 500, auth: stolenAuth }, 500, tag),
    ).rejects.toThrow(/failed verification/u);
  });

  it('rejects a payment with a plausible-looking but fabricated auth', async () => {
    // An LLM would guess a random-looking hex string; without the key
    // it can't produce a valid MAC.
    await expect(
      assertPayment(
        {
          amount: 1_200,
          auth: 'abcdef1234567890.deadbeefcafef00d1234567890abcdef1234567890abcdef1234567890abcdef',
        },
        1_200,
        tag,
      ),
    ).rejects.toThrow(/failed verification/u);
  });

  it('includes the method tag in error messages', async () => {
    await expect(
      assertPayment({ amount: 5, auth: 'x.y' }, 10, 'foo.bar'),
    ).rejects.toThrow(/^foo\.bar:/u);
  });
});

describe('mintAuth', () => {
  it('produces a <nonce>.<mac> string that round-trips through assertPayment', async () => {
    const auth = await mintAuth(2_500);
    expect(auth).toMatch(/^[0-9a-f]+\.[0-9a-f]+$/u);
    expect(
      await assertPayment({ amount: 2_500, auth }, 2_500, 'x.y'),
    ).toBeUndefined();
  });

  it('produces a distinct auth on each call, even for the same amount', async () => {
    const a = await mintAuth(1_000);
    const b = await mintAuth(1_000);
    expect(a).not.toBe(b);
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

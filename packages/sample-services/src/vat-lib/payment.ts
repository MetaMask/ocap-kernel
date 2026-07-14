/**
 * Shared payment plumbing for demo-simulation services. Every costed
 * method on a sample-service exo takes a `payment: Money` argument
 * minted by the wallet vat's `withdraw`; this module carries the
 * shared type, the reusable discoverable-schema block, and the
 * runtime validator each service uses to guard its costed work.
 *
 * See `packages/sample-services/src/wallet/index.ts` for the wallet
 * vat itself.
 */

/**
 * A transferable quantity of money. Currently a plain data shape;
 * a future revision will make `auth` a cryptographic proof rather
 * than a random nonce.
 */
export type Money = {
  /** Amount, in integer USD cents. */
  amount: number;
  /**
   * Opaque validation string. Random nonce for now; will become a
   * cryptographic proof (signature or encrypted envelope) that
   * ties the money to a real wallet withdrawal.
   */
  auth: string;
};

/**
 * Discoverable-schema block for the `payment` argument. Every
 * costed method's schema appends this after its existing args so
 * the LLM sees a consistent contract: withdraw first, then pass
 * the returned `Money` as the final positional argument.
 */
export const PAYMENT_ARG_SCHEMA = {
  type: 'object' as const,
  description:
    'Payment tendered for this call. Obtain it by invoking the ' +
    'wallet vat`s `withdraw(amountCents)` with the exact price the ' +
    'method charges; pass the returned `Money` here. The service ' +
    'validates that `amount` matches the expected price and rejects ' +
    'the call otherwise.',
  properties: {
    amount: {
      type: 'number' as const,
      description:
        'Amount tendered, in integer USD cents. Must equal the ' +
        'exact price the method charges.',
    },
    auth: {
      type: 'string' as const,
      description:
        'Opaque validation string minted by `withdraw`. The service ' +
        'currently only checks presence; a future revision will ' +
        'validate a cryptographic proof.',
    },
  },
  required: ['amount', 'auth'],
};

/**
 * Assert that `payment` is a well-formed `Money` object whose
 * `amount` matches `expectedCents`. Throws with a diagnostic message
 * on any mismatch so the LLM has a clear error to react to.
 *
 * @param payment - Value to validate.
 * @param expectedCents - The exact price the service expects to be
 *   paid, in integer USD cents.
 * @param methodTag - Human-readable tag used in error messages
 *   (e.g. `'assembly-coop.build'`).
 * @throws If `payment` is not a Money-shaped object or if
 *   `payment.amount !== expectedCents`.
 */
export function assertPayment(
  payment: unknown,
  expectedCents: number,
  methodTag: string,
): asserts payment is Money {
  if (typeof payment !== 'object' || payment === null) {
    throw new Error(
      `${methodTag}: expected a payment object with { amount, auth }; got ${
        payment === null ? 'null' : typeof payment
      }.`,
    );
  }
  const money = payment as { amount?: unknown; auth?: unknown };
  if (
    typeof money.amount !== 'number' ||
    !Number.isFinite(money.amount) ||
    !Number.isInteger(money.amount) ||
    money.amount < 0
  ) {
    throw new Error(
      `${methodTag}: payment.amount must be a non-negative integer in cents; got ${String(
        money.amount,
      )}.`,
    );
  }
  if (typeof money.auth !== 'string' || money.auth.length === 0) {
    throw new Error(`${methodTag}: payment.auth must be a non-empty string.`);
  }
  if (money.amount !== expectedCents) {
    throw new Error(
      `${methodTag}: payment amount ${money.amount} cents does not match the expected price of ${expectedCents} cents.`,
    );
  }
}

/**
 * Cents-per-dollar multiplier. Exists so services can write
 * `PRICE_USD * USD_TO_CENTS` instead of `* 100`, making the intent
 * obvious at a glance.
 */
export const USD_TO_CENTS = 100;

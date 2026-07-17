/**
 * Shared payment plumbing for the orchestration-demo service vats.
 * Every costed method on a demo-service exo takes a `payment: Money`
 * argument minted by the wallet vat's `withdraw`; this module
 * carries the shared type, the reusable discoverable-schema block,
 * the runtime validator each service uses to guard its costed
 * work, and the demo-only shared-secret used to bind a Money's
 * `auth` field to a real wallet withdrawal.
 *
 * **Security posture (demo, not production).** The `auth` field is
 * a SHA-256 MAC over `(sharedKey, amount, nonce)` where `sharedKey`
 * is a constant bundled into every vat in this package. A caller
 * that can read the source (or the bundle) can forge `Money`
 * values; the only adversary this stops is the producer LLM,
 * which sees only tool inputs/outputs and never the source. That's
 * the intended bar for the demo — enough to force the LLM through
 * `demo_wallet_withdraw` rather than fabricating `{amount, auth}`
 * from thin air. A real cryptographic solution (wallet-signed
 * payments, key exchange, receipts) is out of scope for the demo
 * and tracked in `docs/orchestration-demo-wallet-design.md`.
 *
 * See `packages/orchestration-demo-vats/src/wallet/index.ts` for
 * the wallet vat itself.
 */

/**
 * A transferable quantity of money. `auth` is a self-contained
 * proof of a prior wallet withdrawal in `<nonce>.<mac>` form; see
 * the file header for the security-posture caveats.
 */
export type Money = {
  /** Amount, in integer USD cents. */
  amount: number;
  /**
   * Self-contained proof-of-withdrawal in `<nonce>.<mac>` form
   * (both parts hex). `nonce` is a fresh random 12-byte string
   * per withdrawal; `mac` is `SHA-256(sharedKey|amount|nonce)`
   * hex-encoded. Verified by `assertPayment`.
   */
  auth: string;
};

/**
 * Cents-per-dollar multiplier. Exists so services can write
 * `PRICE_USD * USD_TO_CENTS` instead of `* 100`, making the intent
 * obvious at a glance.
 */
export const USD_TO_CENTS = 100;

/**
 * Nonce byte length. 12 bytes → 24 hex chars. Big enough to make
 * accidental collisions astronomically unlikely.
 */
const NONCE_BYTES = 12;

/**
 * Shared secret used to bind `Money.auth` to a real wallet
 * withdrawal. Bundled into every vat in this package at build
 * time; NEVER emitted in tool responses or error text. Rotating
 * this invalidates every outstanding `Money` object minted from
 * the previous key — for a demo that's fine; rotation across a
 * live production run would need a proper KMS.
 *
 * Rotate by replacing this constant with a fresh random 32-byte
 * hex string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
 */
const PAYMENT_AUTH_KEY =
  '3e7c92a45b8d1f620c9e5a7d1b6f8c3a5e9d2b7c4a8f1e5d9c3b6a2e8f4d7c1b';

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
    'validates that `amount` matches the expected price AND that ' +
    '`auth` is a valid proof-of-withdrawal, and rejects the call ' +
    'otherwise.',
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
        'Proof-of-withdrawal string minted by `withdraw`. The ' +
        'service verifies it cryptographically — the LLM cannot ' +
        'construct a valid value on its own, only replay one ' +
        'returned by `withdraw`.',
    },
  },
  required: ['amount', 'auth'],
};

/* eslint-disable n/no-unsupported-features/node-builtins */

type CryptoSource = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
  subtle: { digest: (algo: string, data: Uint8Array) => Promise<ArrayBuffer> };
};

/**
 * Resolve the crypto endowment at call time. Vats configured with
 * `globals: ['crypto']` expose it; if it isn't available (some
 * test environments), the caller has to be prepared for
 * `undefined` and handle that path.
 *
 * @returns The crypto source, or `undefined` if unreachable.
 */
function resolveCrypto(): CryptoSource | undefined {
  const bare: unknown = typeof crypto === 'undefined' ? undefined : crypto;
  const source = (bare ?? (globalThis as { crypto?: unknown }).crypto) as
    | Partial<CryptoSource>
    | undefined;
  if (
    source &&
    typeof source.getRandomValues === 'function' &&
    source.subtle &&
    typeof source.subtle.digest === 'function'
  ) {
    return source as CryptoSource;
  }
  return undefined;
}

/* eslint-enable n/no-unsupported-features/node-builtins */

/**
 * Convert a byte array to a lowercase hex string.
 *
 * @param bytes - The bytes to encode.
 * @returns The hex encoding.
 */
function bytesToHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (const byte of bytes) {
    parts.push(byte.toString(16).padStart(2, '0'));
  }
  return parts.join('');
}

/**
 * Compute the MAC binding an `(amount, nonce)` pair to the shared
 * secret. `SHA-256(key | '|' | amount | '|' | nonce)` in hex.
 *
 * @param amountCents - The payment amount, in integer USD cents.
 * @param nonce - Hex-encoded per-withdrawal random nonce.
 * @returns The MAC hex string.
 * @throws If `crypto.subtle` is unavailable.
 */
async function computeMac(amountCents: number, nonce: string): Promise<string> {
  const source = resolveCrypto();
  if (!source) {
    throw new Error(
      'payment: crypto.subtle unavailable — the vat must be configured ' +
        "with `globals: ['crypto']` at launch time.",
    );
  }
  const input = `${PAYMENT_AUTH_KEY}|${amountCents}|${nonce}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await source.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Mint a fresh proof-of-withdrawal for the given amount. Generates
 * a random nonce, computes the MAC, returns them packed as
 * `<nonce>.<mac>`.
 *
 * Called by the wallet vat's `withdraw`. Every value returned by
 * this function is a valid `Money.auth`.
 *
 * @param amountCents - The withdrawal amount, in integer USD cents.
 * @returns The packed `auth` string.
 * @throws If `crypto` is unavailable.
 */
export async function mintAuth(amountCents: number): Promise<string> {
  const source = resolveCrypto();
  if (!source) {
    throw new Error(
      'payment: crypto unavailable — the wallet vat must be configured ' +
        "with `globals: ['crypto']` at launch time.",
    );
  }
  const nonceBytes = new Uint8Array(NONCE_BYTES);
  source.getRandomValues(nonceBytes);
  const nonce = bytesToHex(nonceBytes);
  const mac = await computeMac(amountCents, nonce);
  return `${nonce}.${mac}`;
}

/**
 * Assert that `payment` is a well-formed `Money` object whose
 * `amount` matches `expectedCents` AND whose `auth` verifies
 * against the shared secret. Throws with a diagnostic message on
 * any mismatch so the LLM has a clear error to react to.
 *
 * @param payment - Value to validate.
 * @param expectedCents - The exact price the service expects to be
 *   paid, in integer USD cents.
 * @param methodTag - Human-readable tag used in error messages
 *   (e.g. `'assembly-coop.build'`).
 * @throws If `payment` is not a Money-shaped object, if
 *   `payment.amount !== expectedCents`, or if `payment.auth`
 *   fails MAC verification.
 */
export async function assertPayment(
  payment: unknown,
  expectedCents: number,
  methodTag: string,
): Promise<void> {
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
  const dot = money.auth.indexOf('.');
  if (dot <= 0 || dot === money.auth.length - 1) {
    throw new Error(
      `${methodTag}: payment.auth is malformed — expected "<nonce>.<mac>".`,
    );
  }
  const nonce = money.auth.slice(0, dot);
  const providedMac = money.auth.slice(dot + 1);
  const expectedMac = await computeMac(money.amount, nonce);
  if (providedMac !== expectedMac) {
    throw new Error(
      `${methodTag}: payment.auth failed verification — the tendered ` +
        'proof does not match a genuine wallet withdrawal. Obtain a ' +
        'fresh Money via demo_wallet_withdraw and retry.',
    );
  }
}

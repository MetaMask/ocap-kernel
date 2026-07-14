/**
 * Simulated wallet vat for the orchestration demo. **Not a real
 * wallet** — it lives here alongside the other demo-simulation
 * vats (industrial-design, shenzhen-direct, etc.) precisely
 * because it is scaffolding, not production infrastructure. A
 * real wallet vat will eventually replace this one; see
 * `docs/orchestration-demo-wallet-design.md` for the migration
 * path.
 *
 * The vat exposes a single public facet with four methods:
 * `deposit`, `withdraw`, `balance`, `init`. Amounts are always
 * integer USD cents; callers that operate in dollars must convert
 * at the boundary. The balance is durable in vat baggage — vat
 * re-incarnation restores the last committed value.
 *
 * `withdraw(amount)` returns a `Money` object that a downstream
 * service can inspect to validate that payment was actually
 * tendered. The `auth` field is a random nonce for now; a future
 * revision will replace it with a proper cryptographic proof
 * (either signed-by-wallet or an encrypted amount using a shared
 * key the LLM doesn't hold). For the current demo the honest
 * behaviour of the wallet plus the service-side amount check is
 * enough to remove the "let's pretend" narration failure mode
 * we hit when the producer LLM was tracking the balance in its
 * conversation memory.
 */

import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';

import type { Money } from '../vat-lib/index.ts';

export type { Money } from '../vat-lib/index.ts';

type Services = {
  ocapURLIssuerService: OcapURLIssuerService;
  ocapURLRedemptionService: OcapURLRedemptionService;
};

/** Baggage key holding the current balance (integer cents). */
const BALANCE_KEY = 'balanceCents';
/** Baggage key holding the issued wallet OCAP URL. */
const WALLET_URL_KEY = 'walletUrl';
/** Length of the random nonce used as `Money.auth`. */
const NONCE_BYTES = 12;
/** Default initial balance in cents ($10,000.00). Overridable via `init`. */
const DEFAULT_INITIAL_BALANCE_CENTS = 1_000_000;

/* eslint-disable n/no-unsupported-features/node-builtins */

type CryptoSource = {
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

/**
 * Resolve the crypto endowment at call time. The vat kernel
 * exposes `crypto` as a global; if it isn't available (some test
 * environments), fall back to a deterministic counter so the
 * shape stays valid even when true randomness is missing.
 *
 * @returns The crypto source, or `undefined` if unreachable.
 */
function resolveCrypto(): CryptoSource | undefined {
  const bare: unknown = typeof crypto === 'undefined' ? undefined : crypto;
  return (bare ?? (globalThis as { crypto?: unknown }).crypto) as
    | CryptoSource
    | undefined;
}

/* eslint-enable n/no-unsupported-features/node-builtins */

let fallbackNonceCounter = 0;

/**
 * Generate a short random nonce for a `Money.auth` field. The
 * nonce is base16 of `NONCE_BYTES` random bytes; falls back to a
 * counter-derived hex string if `crypto.getRandomValues` is
 * unavailable.
 *
 * @returns A hex string suitable for use as an opaque auth token.
 */
function makeNonce(): string {
  const source = resolveCrypto();
  if (source?.getRandomValues) {
    const bytes = new Uint8Array(NONCE_BYTES);
    source.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  fallbackNonceCounter += 1;
  return fallbackNonceCounter.toString(16).padStart(NONCE_BYTES * 2, '0');
}

/**
 * Assert that `amount` is a non-negative integer number of cents.
 *
 * @param amount - Value to validate.
 * @param methodName - Method name for the error message.
 * @throws If `amount` is not a non-negative integer.
 */
function assertNonNegativeIntegerCents(
  amount: unknown,
  methodName: string,
): asserts amount is number {
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount < 0
  ) {
    throw new Error(
      `wallet-vat: ${methodName} amount must be a non-negative integer number of cents; got ${String(amount)}.`,
    );
  }
}

/**
 * Build the wallet vat's root object.
 *
 * @param _vatPowers - Vat powers (unused).
 * @param _parameters - Vat parameters (unused).
 * @param baggage - Vat baggage; used to persist the balance and
 *   the issued OCAP URL across re-incarnation.
 * @returns The vat root exo, exposing `bootstrap`,
 *   `getPublicFacet`, and `getWalletUrl`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  _vatPowers: Record<string, unknown>,
  _parameters: Record<string, unknown>,
  baggage: Baggage,
) {
  const log = (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    console.log('[wallet]', ...args);
  };

  if (!baggage.has(BALANCE_KEY)) {
    baggage.init(BALANCE_KEY, DEFAULT_INITIAL_BALANCE_CENTS);
    log(`initial balance seeded to ${DEFAULT_INITIAL_BALANCE_CENTS} cents`);
  }

  /**
   * Read the current balance from baggage.
   *
   * @returns The balance in integer cents.
   */
  function readBalance(): number {
    return baggage.get(BALANCE_KEY) as number;
  }

  /**
   * Store the balance to baggage.
   *
   * @param cents - The balance to store, in integer cents.
   */
  function writeBalance(cents: number): void {
    baggage.set(BALANCE_KEY, cents);
  }

  const publicFacet = makeDefaultExo('walletPublicFacet', {
    /**
     * Deposit money into the wallet.
     *
     * @param amount - The amount to deposit, in integer cents.
     * @returns The new balance in integer cents.
     * @throws If `amount` is not a non-negative integer.
     */
    deposit(amount: number): number {
      assertNonNegativeIntegerCents(amount, 'deposit');
      const balance = readBalance() + amount;
      writeBalance(balance);
      log(`deposit ${amount}: balance ${balance}`);
      return balance;
    },

    /**
     * Withdraw money from the wallet and return it as a Money
     * object suitable for passing as a `payment` argument to a
     * service call.
     *
     * @param amount - The amount to withdraw, in integer cents.
     * @returns A tuple of `[Money, newBalance]`.
     * @throws If `amount` is not a positive integer or would
     *   overdraw the wallet.
     */
    withdraw(amount: number): [Money, number] {
      assertNonNegativeIntegerCents(amount, 'withdraw');
      if (amount === 0) {
        throw new Error('wallet-vat: withdraw amount must be positive.');
      }
      const current = readBalance();
      if (amount > current) {
        throw new Error(
          `wallet-vat: withdraw of ${amount} cents would overdraw wallet ` +
            `(balance ${current} cents; shortfall ${amount - current} cents).`,
        );
      }
      const balance = current - amount;
      writeBalance(balance);
      const money: Money = harden({ amount, auth: makeNonce() });
      log(`withdraw ${amount}: balance ${balance}`);
      return harden([money, balance]);
    },

    /**
     * Inquire about the wallet's current balance.
     *
     * @returns The current balance in integer cents.
     */
    balance(): number {
      return readBalance();
    },

    /**
     * Reset the wallet's balance to a known value. Used at the
     * start of a demo run to put the wallet into a predictable
     * state.
     *
     * @param amount - The amount that should become the wallet's
     *   balance, in integer cents.
     * @throws If `amount` is not a non-negative integer.
     */
    init(amount: number): void {
      assertNonNegativeIntegerCents(amount, 'init');
      writeBalance(amount);
      log(`init balance to ${amount}`);
    },
  });

  return makeDefaultExo('walletVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      if (!incoming?.ocapURLIssuerService) {
        throw new Error('ocapURLIssuerService is required');
      }
      if (!incoming.ocapURLRedemptionService) {
        throw new Error('ocapURLRedemptionService is required');
      }
      const walletUrl = await E(incoming.ocapURLIssuerService).issue(
        publicFacet,
      );
      if (baggage.has(WALLET_URL_KEY)) {
        baggage.set(WALLET_URL_KEY, walletUrl);
      } else {
        baggage.init(WALLET_URL_KEY, walletUrl);
      }
      log(`bootstrap complete; walletUrl=${walletUrl}`);
      return harden({ walletUrl });
    },

    /**
     * Return the public facet directly (used by tests and by
     * local callers with vat-root access).
     *
     * @returns The public wallet exo.
     */
    getPublicFacet() {
      return publicFacet;
    },

    /**
     * Return the wallet's public OCAP URL as previously issued at
     * bootstrap. Stable across re-incarnations because the URL is
     * deterministic over (kref, peer id, ocap-URL key) and all
     * three persist.
     *
     * @returns The wallet OCAP URL, or `undefined` if bootstrap
     *   has not yet run.
     */
    getWalletUrl(): string | undefined {
      return baggage.has(WALLET_URL_KEY)
        ? (baggage.get(WALLET_URL_KEY) as string)
        : undefined;
    },
  });
}

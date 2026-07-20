/**
 * Simulated wallet vat for the orchestration demo. **Not a real
 * wallet** — it lives here alongside the other demo-simulation
 * vats (industrial-design, shenzhen-direct, etc.) precisely
 * because it is scaffolding, not production infrastructure. A
 * real wallet vat will eventually replace this one; see
 * `docs/orchestration-demo-wallet-design.md` for the migration
 * path.
 *
 * The vat's ROOT is the wallet API — `deposit`, `withdraw`,
 * `balance`, `init`, `getWalletUrl`, plus the kernel-called
 * `bootstrap`. Amounts are always integer USD cents; callers that
 * operate in dollars must convert at the boundary. The balance is
 * durable in vat baggage — vat re-incarnation restores the last
 * committed value.
 *
 * Historical note: an earlier design split the API onto a separate
 * `publicFacet` exo and issued the wallet URL for that. Because
 * `ocapURLIssuerService.issue()` doesn't keep a reference to the
 * exo it encrypts, the publicFacet's kernel-side export refcount
 * dropped to zero right after bootstrap, and the URL later
 * redeemed to a kref the kernel had GC'd — the OBJECT_DELETED
 * failure. Consolidating the API onto the root fixes it because
 * the root's kref is held alive by the kernel for the vat's
 * lifetime.
 *
 * `withdraw(amount)` returns a `Money` object that a downstream
 * service can inspect to validate that payment was actually
 * tendered. `Money.auth` is a `<nonce>.<mac>` pair produced by
 * `mintAuth` in `../vat-lib/payment.ts`; the MAC binds the amount
 * to a shared secret every demo-vat bundles at build time. A
 * future revision will replace this with a real cryptographic
 * signature; for the demo it stops the producer LLM from
 * fabricating `{amount, auth}` values without going through
 * `demo_wallet_withdraw`, which is the failure mode we hit when
 * the LLM was tracking the balance in its conversation memory.
 */

import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Baggage,
  OcapURLIssuerService,
  OcapURLRedemptionService,
} from '@metamask/ocap-kernel';

import { mintAuth } from '../vat-lib/index.ts';
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
/** Default initial balance in cents ($10,000.00). Overridable via `init`. */
const DEFAULT_INITIAL_BALANCE_CENTS = 1_000_000;

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
 * The API (`deposit` / `withdraw` / `balance` / `init` /
 * `getWalletUrl`) lives directly on the root, alongside the
 * kernel-called `bootstrap`. The URL bootstrap issues points at the
 * root itself — the vat root's kref (`o+0`) is kept alive by the
 * kernel for as long as the vat exists, so the URL stays
 * redeemable. An earlier design split the API onto a separate
 * `publicFacet` exo and issued the URL for that; the publicFacet's
 * only kernel-visible reference was the one held during the
 * `issue()` call, so it got GC'd shortly after bootstrap and every
 * subsequent redemption of the URL returned OBJECT_DELETED.
 *
 * @param _vatPowers - Vat powers (unused).
 * @param _parameters - Vat parameters (unused).
 * @param baggage - Vat baggage; used to persist the balance and
 *   the issued OCAP URL across re-incarnation.
 * @returns The vat root exo, exposing the wallet API plus
 *   `bootstrap` and `getWalletUrl`.
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

  const root = makeDefaultExo('walletVatRoot', {
    async bootstrap(_vats: Record<string, unknown>, incoming: Services) {
      if (!incoming?.ocapURLIssuerService) {
        throw new Error('ocapURLIssuerService is required');
      }
      if (!incoming.ocapURLRedemptionService) {
        throw new Error('ocapURLRedemptionService is required');
      }
      // Issue a URL for the ROOT itself. The root's kref is `o+0`
      // in this vat's namespace and is kept alive by the kernel
      // for the vat's lifetime, so any later redemption of this
      // URL yields a live kref rather than getting GC'd.
      const walletUrl = await E(incoming.ocapURLIssuerService).issue(root);
      if (baggage.has(WALLET_URL_KEY)) {
        baggage.set(WALLET_URL_KEY, walletUrl);
      } else {
        baggage.init(WALLET_URL_KEY, walletUrl);
      }
      log(`bootstrap complete; walletUrl=${walletUrl}`);
      return harden({ walletUrl });
    },

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
    async withdraw(amount: number): Promise<[Money, number]> {
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
      // Mint the auth BEFORE decrementing the balance so a mintAuth
      // failure (e.g. crypto.subtle unavailable) doesn't leave the
      // wallet in a half-consistent state where the balance moved
      // but no Money was returned.
      const auth = await mintAuth(amount);
      const balance = current - amount;
      writeBalance(balance);
      const money: Money = harden({ amount, auth });
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

  return root;
}

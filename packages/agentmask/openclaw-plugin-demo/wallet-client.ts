/**
 * Thin RPC client for the orchestration-demo wallet vat. Wraps
 * `daemon queueMessage <walletKref> <method>` calls so the demo
 * plugin's tools don't have to know the CLI plumbing. All amounts
 * are integer USD cents — same denomination the vat itself uses;
 * conversion to/from dollars happens at the LLM-facing tool
 * boundary in `tools/util.ts`.
 *
 * `Money` is re-exported here rather than pulled from
 * `@ocap/sample-services` because the demo plugin is loaded by the
 * openclaw gateway as a stand-alone module (via
 * `openclaw plugins install`) and can't take on a monorepo import
 * for a one-line type.
 */

import type { DaemonCaller } from './daemon.ts';

/**
 * A transferable quantity of money. Structural mirror of the type
 * exported from `@ocap/sample-services/vat-lib/payment.ts` — kept
 * local because the demo plugin can't depend on that package (see
 * file header).
 */
export type Money = {
  amount: number;
  auth: string;
};

/**
 * The wallet RPC surface the plugin's tools consume. Backed by
 * `daemon.queueMessage` on the wallet vat's public facet.
 */
export type WalletClient = {
  balance(): Promise<number>;
  deposit(amountCents: number): Promise<number>;
  withdraw(amountCents: number): Promise<{ money: Money; balance: number }>;
  init(amountCents: number): Promise<void>;
};

/**
 * Coerce a queueMessage reply that is expected to be a number.
 *
 * @param value - The daemon reply.
 * @param label - Method name for error messages.
 * @returns The reply as a number.
 * @throws If the reply is not a number.
 */
function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `wallet.${label}: expected numeric reply from wallet vat; got ${
        value === null ? 'null' : typeof value
      } (${JSON.stringify(value)}).`,
    );
  }
  return value;
}

/**
 * Coerce a queueMessage reply that is expected to be a
 * `[Money, newBalance]` tuple.
 *
 * @param value - The daemon reply.
 * @returns The parsed money and new balance.
 * @throws If the reply is not the expected shape.
 */
function asWithdrawResult(value: unknown): { money: Money; balance: number } {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(
      `wallet.withdraw: expected [Money, balance] tuple from wallet vat; got ${JSON.stringify(
        value,
      )}.`,
    );
  }
  const [rawMoney, rawBalance] = value;
  if (typeof rawMoney !== 'object' || rawMoney === null) {
    throw new Error(
      `wallet.withdraw: first tuple element is not a Money object: ${JSON.stringify(
        rawMoney,
      )}.`,
    );
  }
  const { amount, auth } = rawMoney as { amount?: unknown; auth?: unknown };
  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    typeof auth !== 'string' ||
    auth.length === 0
  ) {
    throw new Error(
      `wallet.withdraw: Money fields malformed: ${JSON.stringify(rawMoney)}.`,
    );
  }
  return {
    money: { amount, auth },
    balance: asNumber(rawBalance, 'withdraw'),
  };
}

/**
 * Build a wallet client bound to a daemon caller and a wallet kref.
 *
 * @param options - Construction options.
 * @param options.daemon - Daemon caller that reaches the daemon
 *   hosting the wallet vat.
 * @param options.walletKref - Kernel reference for the wallet's
 *   public facet (obtained by redeeming the wallet OCAP URL).
 * @returns A wallet client with `balance` / `deposit` / `withdraw` /
 *   `init` methods.
 */
export function makeWalletClient(options: {
  daemon: DaemonCaller;
  walletKref: string;
}): WalletClient {
  const { daemon, walletKref } = options;
  return {
    async balance(): Promise<number> {
      const raw = await daemon.queueMessage({
        target: walletKref,
        method: 'balance',
        args: [],
      });
      return asNumber(raw, 'balance');
    },
    async deposit(amountCents: number): Promise<number> {
      const raw = await daemon.queueMessage({
        target: walletKref,
        method: 'deposit',
        args: [amountCents],
      });
      return asNumber(raw, 'deposit');
    },
    async withdraw(
      amountCents: number,
    ): Promise<{ money: Money; balance: number }> {
      const raw = await daemon.queueMessage({
        target: walletKref,
        method: 'withdraw',
        args: [amountCents],
      });
      return asWithdrawResult(raw);
    },
    async init(amountCents: number): Promise<void> {
      await daemon.queueMessage({
        target: walletKref,
        method: 'init',
        args: [amountCents],
      });
    },
  };
}

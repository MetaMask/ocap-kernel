/**
 * In-process state for the demo plugin. Now that the balance lives
 * in the wallet vat, all this holds is the wallet-connection slot;
 * everything else (artifact storage) moved to the process-global
 * `artifact-store.ts` so the `@openclaw/discovery` plugin's
 * `service_call` interning and this plugin's bookkeeping tools see
 * the same Map.
 */

import type { WalletClient } from './wallet-client.ts';

/**
 * 3-state representation of the wallet-vat connection. Modeled the
 * same way `@openclaw/discovery`'s matcher slot is: a discriminated
 * union that rules out the contradictory state where both a
 * resolved entry and a still-pending pre-redemption are observable
 * at once. Wallet tools that need the client `await`
 * `requireWallet(state)`, which handles all three arms.
 */
export type WalletSlot =
  | { status: 'absent' }
  | { status: 'pending'; promise: Promise<WalletClient> }
  | { status: 'resolved'; client: WalletClient; kref: string };

export type PluginState = {
  wallet: WalletSlot;
};

/**
 * Build a fresh `PluginState`.
 *
 * @returns The empty state.
 */
export function createState(): PluginState {
  return {
    wallet: { status: 'absent' },
  };
}

/**
 * Await the wallet client, awaiting any in-flight pre-redemption.
 * Throws if the wallet URL was never configured or if the
 * pre-redemption failed permanently.
 *
 * @param state - The plugin state.
 * @returns The resolved wallet client.
 * @throws If the wallet slot is `absent` (no walletUrl configured).
 */
export async function requireWallet(state: PluginState): Promise<WalletClient> {
  switch (state.wallet.status) {
    case 'resolved':
      return state.wallet.client;
    case 'pending':
      return await state.wallet.promise;
    case 'absent':
      throw new Error(
        'demo plugin: wallet client not configured. Set ' +
          '`plugins.entries.demo.config.walletUrl` (or the ' +
          '`DEMO_WALLET_OCAP_URL` env var) to the wallet vat`s ocap URL ' +
          'and restart the gateway.',
      );
    default: {
      const exhaustiveCheck: never = state.wallet;
      throw new Error(
        `demo plugin: unexpected wallet slot: ${JSON.stringify(exhaustiveCheck)}.`,
      );
    }
  }
}

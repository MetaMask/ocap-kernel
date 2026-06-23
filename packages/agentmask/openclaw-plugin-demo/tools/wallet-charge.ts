/**
 * `demo_wallet_charge` tool: deduct a USD amount from the inventor's
 * wallet and notify demo-display so the wallet ribbon updates. The
 * agent calls this after each successful `service_call` that incurs
 * a cost, mirroring the price the service quoted.
 *
 * Zero-amount charges are accepted as no-ops (no state mutation, no
 * `wallet.charge` event) so revisions that are covered by the
 * original engagement can be closed out without inventing a nominal
 * dollar. Charges that would overdraw the wallet are refused — the
 * conceit is that these are actual funds being paid to a contractor,
 * and you can't spend money that isn't there. The agent should
 * surface the shortfall to the inventor and ask for a top-up.
 */
import type { DisplayClient } from '../display-client.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { formatUsd } from './util.ts';

/**
 * Register the demo_wallet_charge tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 * @param options.display - Display client for posting wallet.balance
 *   events when the balance changes.
 */
export function registerWalletChargeTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_wallet_charge',
    label: "Deduct from the inventor's wallet",
    description:
      "Deduct a USD amount from the inventor's wallet to reflect a " +
      'service payment that just completed. Call this once per ' +
      'successful service_call that incurred a cost, using the price ' +
      'the service quoted. Zero amounts are accepted as no-ops (no ' +
      'state mutation, no event) for covered revisions. Charges that ' +
      'would overdraw the wallet are refused — surface the shortfall ' +
      'to the inventor and request a top-up via demo_wallet_credit ' +
      'first. Returns the new balance.',
    parameters: {
      type: 'object',
      properties: {
        amountUsd: {
          type: 'number',
          description:
            'Amount to deduct, in USD. Must be non-negative; must not ' +
            'exceed the current balance.',
        },
        reason: {
          type: 'string',
          description:
            'Short human-readable description of the charge (e.g. ' +
            '"industrial-design pass"). Optional; not stored, but ' +
            'helpful for context in logs.',
        },
      },
      required: ['amountUsd'],
    },
    async execute(
      _id: string,
      params: { amountUsd: number; reason?: string },
    ): Promise<ToolResponse> {
      const amount = params.amountUsd;
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: amountUsd must be a non-negative number; got ${amount}.`,
            },
          ],
          details: undefined,
        };
      }
      if (amount === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `No charge applied (amount $0). ` +
                `Balance unchanged at ${formatUsd(state.balanceUsd)}.`,
            },
          ],
          details: undefined,
        };
      }
      if (amount > state.balanceUsd) {
        const shortfall = amount - state.balanceUsd;
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Error: charge of ${formatUsd(amount)} would overdraw the ` +
                `wallet (balance ${formatUsd(state.balanceUsd)}, shortfall ` +
                `${formatUsd(shortfall)}). Surface the shortfall to the ` +
                `inventor and request a top-up via demo_wallet_credit ` +
                `before retrying.`,
            },
          ],
          details: undefined,
        };
      }
      state.balanceUsd -= amount;
      display
        .post({
          kind: 'wallet.charge',
          amountUsd: amount,
          reason: params.reason,
          balanceUsd: state.balanceUsd,
          at: new Date().toISOString(),
        })
        .catch(() => undefined);
      const reasonSuffix =
        typeof params.reason === 'string' && params.reason.length > 0
          ? ` (${params.reason})`
          : '';
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Charged ${formatUsd(amount)}${reasonSuffix}. ` +
              `New balance: ${formatUsd(state.balanceUsd)}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

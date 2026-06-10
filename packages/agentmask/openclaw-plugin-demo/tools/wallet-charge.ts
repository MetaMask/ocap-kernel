/**
 * `demo_wallet_charge` tool: deduct a USD amount from the inventor's
 * wallet and notify demo-display so the wallet ribbon updates. The
 * agent calls this after each successful `service_call` that incurs
 * a cost, mirroring the price the service quoted.
 *
 * Going negative is allowed (and reported back) so the agent can see
 * when it has overspent — useful for the "wallet is tight, propose
 * capital-formation" branch of the demo. The plugin doesn't refuse
 * the charge.
 */
import type { DisplayClient } from '../display-client.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

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
      'the service quoted. Returns the new balance.',
    parameters: {
      type: 'object',
      properties: {
        amountUsd: {
          type: 'number',
          description: 'Amount to deduct, in USD. Must be positive.',
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
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: amountUsd must be a positive number; got ${amount}.`,
            },
          ],
          details: undefined,
        };
      }
      state.balanceUsd -= amount;
      display
        .post({
          kind: 'wallet.balance',
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
              `Charged $${amount.toLocaleString()}${reasonSuffix}. ` +
              `New balance: $${state.balanceUsd.toLocaleString()}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

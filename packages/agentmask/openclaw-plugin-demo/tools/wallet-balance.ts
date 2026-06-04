/**
 * `demo_wallet_balance` tool: report the inventor's current wallet
 * balance in USD. V0 holds a static value, configured at register
 * time. Later commits will introduce a mock-wallet service that the
 * matcher routes to for charge/credit; at that point the balance
 * becomes dynamic and this tool reflects whatever value the service
 * is currently holding.
 */
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the demo_wallet_balance tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 */
export function registerWalletBalanceTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
}): void {
  const { api, state } = options;

  api.registerTool({
    name: 'demo_wallet_balance',
    label: "Read the inventor's wallet balance",
    description:
      "Return the inventor's current wallet balance in USD. Useful for " +
      'checking whether a planned service call fits within budget before ' +
      'invoking it.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResponse> {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Wallet balance: $${state.balanceUsd.toLocaleString()}`,
          },
        ],
        details: undefined,
      };
    },
  });
}

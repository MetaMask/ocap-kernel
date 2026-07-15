/**
 * `demo_wallet_balance` tool: ask the wallet vat for the current
 * balance in USD cents, format for the LLM as dollars-and-cents, and
 * push a `wallet.balance` SSE event so the dashboard ribbon stays in
 * sync (the register-time push is unreliable — see index.ts for
 * context).
 */
import type { DisplayClient } from '../display-client.ts';
import { requireWallet } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse, formatUsdFromCents } from './util.ts';

/**
 * Register the demo_wallet_balance tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state; carries the wallet slot.
 * @param options.display - Display client for posting wallet.balance
 *   events so the dashboard ribbon reflects the vat's current view.
 */
export function registerWalletBalanceTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_wallet_balance',
    label: "Read the inventor's wallet balance",
    description:
      "Return the inventor's current wallet balance. Reads through to " +
      'the wallet vat, so the value is the vat`s source-of-truth number ' +
      'rather than any process-local cache. Useful for checking whether a ' +
      'planned service call fits within budget before invoking it.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResponse> {
      try {
        const wallet = await requireWallet(state);
        const balanceCents = await wallet.balance();
        display
          .post({ kind: 'wallet.balance', balanceCents })
          .catch(() => undefined);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Wallet balance: ${formatUsdFromCents(balanceCents)} (${balanceCents.toLocaleString()}c)`,
            },
          ],
          details: undefined,
        };
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}

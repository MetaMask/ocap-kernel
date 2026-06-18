/**
 * `demo_wallet_credit` tool: add a USD amount to the inventor's
 * wallet, mirroring `demo_wallet_charge` in shape but in the
 * crediting direction. The agent calls this when the inventor
 * explicitly authorizes a top-up — most often when the wallet runs
 * low mid-phase and the inventor wants to continue.
 *
 * The agent should NOT credit on its own initiative — only on direct
 * authorization from the inventor (the SKILL.md spells this out).
 * Per-call validation only checks that the amount is positive; trust
 * the upstream conversational gating to keep credits intentional.
 */
import type { DisplayClient } from '../display-client.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the demo_wallet_credit tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 * @param options.display - Display client for posting wallet.credit
 *   events when the balance changes.
 */
export function registerWalletCreditTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_wallet_credit',
    label: "Add funds to the inventor's wallet",
    description:
      "Add a USD amount to the inventor's wallet — typically a " +
      'top-up the inventor authorized when the balance ran low. ' +
      'Only call this in direct response to an inventor instruction ' +
      'to add funds (e.g. "add $10,000" / "top up the wallet"); ' +
      "do not credit on the agent's own initiative. Returns the new " +
      'balance.',
    parameters: {
      type: 'object',
      properties: {
        amountUsd: {
          type: 'number',
          description: 'Amount to add, in USD. Must be positive.',
        },
        reason: {
          type: 'string',
          description:
            'Short human-readable description of the credit (e.g. ' +
            '"inventor top-up"). Optional; not stored, but helpful for ' +
            'context in logs.',
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
      state.balanceUsd += amount;
      display
        .post({
          kind: 'wallet.credit',
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
              `Credited $${amount.toLocaleString()}${reasonSuffix}. ` +
              `New balance: $${state.balanceUsd.toLocaleString()}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

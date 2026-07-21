/**
 * `demo_wallet_withdraw` tool: withdraw funds from the wallet vat
 * ahead of a costed service call. Returns a Money object the agent
 * passes as the final positional argument to the immediately-
 * following service_call. Also posts a wallet.charge SSE event so
 * the dashboard ribbon and events log update at withdrawal time.
 */
import type { DisplayClient } from '../display-client.ts';
import { requireWallet } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import {
  decodeLiteralUnicodeEscapes,
  errorResponse,
  formatUsdFromCents,
} from './util.ts';

/**
 * Register the demo_wallet_withdraw tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state (for the wallet slot).
 * @param options.display - Display client for posting wallet.charge
 *   events at withdrawal time.
 */
export function registerWalletWithdrawTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_wallet_withdraw',
    label: "Withdraw funds from the inventor's wallet",
    description:
      "Withdraw a positive USD-cents amount from the inventor's wallet " +
      'ahead of a costed service_call. Returns a Money object that the ' +
      'agent passes as the final positional argument to the next ' +
      'service_call on a costed method. Amounts are integer USD cents ' +
      'and must match the target price exactly.',
    parameters: {
      type: 'object',
      properties: {
        amountCents: {
          type: 'number',
          description:
            'Amount to withdraw, in integer USD cents. Must be positive.',
        },
        reason: {
          type: 'string',
          description:
            'Short human-readable description of the withdrawal (e.g. ' +
            '"industrial-design pass"). Optional; not stored, but helpful ' +
            'for context on the dashboard events log.',
        },
      },
      required: ['amountCents'],
    },
    async execute(
      _id: string,
      params: { amountCents: number; reason?: string },
    ): Promise<ToolResponse> {
      const amount = params.amountCents;
      if (
        typeof amount !== 'number' ||
        Number.isNaN(amount) ||
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return errorResponse(
          `amountCents must be a positive integer number of cents; got ${amount}.`,
        );
      }
      try {
        const wallet = await requireWallet(state);
        const { money, balance: balanceCents } = await wallet.withdraw(amount);
        const decodedReason =
          typeof params.reason === 'string'
            ? decodeLiteralUnicodeEscapes(params.reason)
            : undefined;
        display
          .post({
            kind: 'wallet.charge',
            amountCents: amount,
            balanceCents,
            ...(decodedReason === undefined ? {} : { reason: decodedReason }),
            at: new Date().toISOString(),
          })
          .catch(() => undefined);
        const reasonSuffix =
          typeof decodedReason === 'string' && decodedReason.length > 0
            ? ` (${decodedReason})`
            : '';
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Withdrew ${formatUsdFromCents(amount)}${reasonSuffix}. ` +
                `New balance: ${formatUsdFromCents(balanceCents)}.\n` +
                `Payment: ${JSON.stringify(money)}\n` +
                `Pass Payment verbatim as the final positional arg to ` +
                `the immediately-following service_call.`,
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

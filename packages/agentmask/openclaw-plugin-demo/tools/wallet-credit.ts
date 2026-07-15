/**
 * `demo_wallet_credit` tool: deposit funds into the wallet vat.
 * Called when the inventor explicitly authorizes a top-up — most
 * often when the wallet runs low mid-phase and the inventor wants
 * to continue.
 *
 * The agent should NOT credit on its own initiative — only on direct
 * authorization from the inventor (the SKILL.md spells this out).
 * Per-call validation only checks that the amount is positive; trust
 * the upstream conversational gating to keep credits intentional.
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
 * Register the demo_wallet_credit tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state (for the wallet slot).
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
      "Deposit a positive USD-cents amount into the inventor's wallet " +
      '(the wallet vat, not a local cache) — typically a top-up the ' +
      'inventor authorized when the balance ran low. Only call this in ' +
      'direct response to an inventor instruction to add funds (e.g. ' +
      '"add $10,000" / "top up the wallet"); do not credit on the ' +
      "agent's own initiative. Amounts are integer USD cents — " +
      'multiply the inventor-facing dollar amount by 100 before ' +
      'passing. Returns the new balance.',
    parameters: {
      type: 'object',
      properties: {
        amountCents: {
          type: 'number',
          description:
            'Amount to deposit, in integer USD cents. Must be positive.',
        },
        reason: {
          type: 'string',
          description:
            'Short human-readable description of the credit (e.g. ' +
            '"inventor top-up"). Optional; not stored, but helpful for ' +
            'context on the dashboard events log.',
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
        const balanceCents = await wallet.deposit(amount);
        const decodedReason =
          typeof params.reason === 'string'
            ? decodeLiteralUnicodeEscapes(params.reason)
            : undefined;
        display
          .post({
            kind: 'wallet.credit',
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
                `Credited ${formatUsdFromCents(amount)}${reasonSuffix}. ` +
                `New balance: ${formatUsdFromCents(balanceCents)}.`,
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

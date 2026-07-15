/**
 * `demo_wallet_withdraw` tool: withdraw funds from the wallet vat
 * ahead of a costed service call. Returns a `Money` object that
 * the LLM must pass as the final positional argument to the next
 * `service_call` on a costed method — the receiving service
 * validates that `payment.amount` matches its expected price and
 * rejects the call otherwise. Because withdrawal decrements the
 * wallet, this tool also posts a `wallet.charge` SSE event so the
 * dashboard ribbon and events log update at withdrawal time (which
 * is when the funds actually leave the wallet).
 *
 * This replaces the earlier `demo_wallet_charge` tool: services now
 * do the amount validation themselves against the `payment`
 * argument, so the agent no longer notifies the plugin of a charge
 * post-facto. Withdrawal *is* the charge.
 *
 * Overdraws are refused by the wallet vat; this tool surfaces the
 * error text verbatim so the agent can react (typically by asking
 * the inventor for a top-up).
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
    label: 'Withdraw funds ahead of a costed service call',
    description:
      "Withdraw funds from the inventor's wallet ahead of a costed " +
      'service_call. Returns a `Money` object of the form ' +
      '`{"amount": <cents>, "auth": "<nonce>"}` that MUST be passed as ' +
      'the final positional argument to the immediately-following ' +
      '`service_call` on a costed method — the receiving service ' +
      'validates that `payment.amount` matches its expected price and ' +
      'rejects the call otherwise. Amounts are integer USD cents ' +
      "(multiply the service's quoted USD price by 100). The withdraw " +
      'IS the charge: the wallet ribbon and events log update on ' +
      'withdrawal, no separate "record the charge" tool call is ' +
      'needed. Overdraws are refused — surface the shortfall to the ' +
      'inventor and request a top-up via demo_wallet_credit before ' +
      'retrying.',
    parameters: {
      type: 'object',
      properties: {
        amountCents: {
          type: 'number',
          description:
            'Amount to withdraw, in integer USD cents. Must be a ' +
            "positive integer and must match the target service's " +
            'quoted price exactly (services reject amount mismatches).',
        },
        reason: {
          type: 'string',
          description:
            'Short human-readable description of the withdrawal (e.g. ' +
            '"industrial-design pass", "pcb fabrication"). Optional but ' +
            'strongly recommended — surfaces on the dashboard events ' +
            'log so the audience sees why the wallet just decremented.',
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

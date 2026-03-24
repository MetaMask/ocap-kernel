import { Type } from '@sinclair/typebox';

import type { WalletCaller } from '../daemon.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import {
  ETH_ADDRESS_RE,
  HEX_VALUE_RE,
  errorMessage,
  formatTxResult,
  makeError,
  makeText,
  parseDecimalAmount,
  resolveTransactionResult,
} from '../utils.ts';

/**
 * Register ETH balance and send tools.
 *
 * @param api - The OpenClaw plugin API.
 * @param wallet - Wallet caller function.
 */
export function registerEthTools(
  api: OpenClawPluginApi,
  wallet: WalletCaller,
): void {
  // -- wallet_balance -------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_balance',
      label: 'Wallet balance',
      description:
        'Get ETH balance. If no address is given, checks all wallet accounts.',
      parameters: Type.Object({
        address: Type.Optional(
          Type.String({
            description:
              'Ethereum address (0x...). Omit to check all accounts.',
          }),
        ),
      }),
      async execute(
        _id: string,
        params: { address?: string },
      ): Promise<ToolResponse> {
        try {
          const addresses: string[] = [];

          if (params.address) {
            if (!ETH_ADDRESS_RE.test(params.address)) {
              return makeError(
                'Invalid Ethereum address. Must be 0x followed by 40 hex characters.',
              );
            }
            addresses.push(params.address);
          } else {
            const accounts = await wallet('getAccounts', []);
            if (Array.isArray(accounts)) {
              addresses.push(
                ...accounts.filter(
                  (a: unknown): a is string =>
                    typeof a === 'string' && ETH_ADDRESS_RE.test(a),
                ),
              );
            }
          }

          if (addresses.length === 0) {
            return makeError('No wallet accounts found.');
          }

          const lines: string[] = [];
          for (const addr of addresses) {
            const result = await wallet('request', [
              'eth_getBalance',
              [addr, 'latest'],
            ]);
            if (typeof result !== 'string' || !result.startsWith('0x')) {
              return makeError(
                `Balance query for ${addr} returned an unexpected result. ` +
                  'The RPC node may be unavailable.',
              );
            }
            const balanceHex = result;
            const wei = BigInt(balanceHex);
            const whole = wei / 10n ** 18n;
            const frac = (wei < 0n ? -wei : wei) % 10n ** 18n;
            const fracStr = frac.toString().padStart(18, '0').slice(0, 6);
            const ethAmount = `${String(whole)}.${fracStr} ETH`;
            lines.push(`${addr}: ${ethAmount} (${balanceHex})`);
          }
          return makeText(lines.join('\n'));
        } catch (error: unknown) {
          return makeError(`Balance lookup failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );

  // -- wallet_send ----------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_send',
      label: 'Wallet send',
      description:
        'Send ETH to an address. The kernel handles signing via delegations or peer wallet.',
      parameters: Type.Object({
        to: Type.String({ description: 'Recipient address (0x...)' }),
        value: Type.String({
          description:
            "Amount of ETH to send as a decimal string (e.g. '0.1' for 0.1 ETH)",
        }),
      }),
      async execute(
        _id: string,
        params: { to: string; value: string },
      ): Promise<ToolResponse> {
        if (!ETH_ADDRESS_RE.test(params.to)) {
          return makeError(
            'Invalid recipient address. Must be 0x followed by 40 hex characters.',
          );
        }

        // Convert decimal ETH string to hex wei.
        let hexValue: string;
        if (HEX_VALUE_RE.test(params.value)) {
          if (BigInt(params.value) <= 0n) {
            return makeError('Amount must be greater than zero.');
          }
          hexValue = params.value;
        } else {
          try {
            const wei = parseDecimalAmount(params.value, 18);
            if (wei <= 0n) {
              return makeError('Amount must be greater than zero.');
            }
            hexValue = `0x${wei.toString(16)}`;
          } catch (error: unknown) {
            return makeError(
              `Invalid value. ${errorMessage(error)} ` +
                "Provide a decimal ETH amount (e.g. '0.1') or hex wei (e.g. '0xde0b6b3a7640000').",
            );
          }
        }

        try {
          const accountsResult = await wallet('getAccounts', []);
          if (!Array.isArray(accountsResult)) {
            return makeError('Wallet returned invalid accounts response.');
          }
          const from = accountsResult.find(
            (account): account is string =>
              typeof account === 'string' && ETH_ADDRESS_RE.test(account),
          );
          if (!from) {
            return makeError('No wallet account available to use as sender.');
          }

          const result = await wallet('sendTransaction', [
            { from, to: params.to, value: hexValue },
          ]);
          if (typeof result !== 'string' || !result.startsWith('0x')) {
            return makeError(
              `Transaction submitted but no valid hash returned (got ${JSON.stringify(result)}).`,
            );
          }
          const txResult = await resolveTransactionResult({
            hash: result,
            wallet,
          });

          return makeText(formatTxResult(txResult));
        } catch (error: unknown) {
          return makeError(`Send transaction failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );
}

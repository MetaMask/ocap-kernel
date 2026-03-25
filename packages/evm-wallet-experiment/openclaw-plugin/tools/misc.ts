import { Type } from '@sinclair/typebox';

import type { WalletCaller } from '../daemon.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import {
  errorMessage,
  formatToolResult,
  makeError,
  makeText,
} from '../utils.ts';

/**
 * Register misc wallet tools: sign, capabilities, accounts.
 *
 * @param api - The OpenClaw plugin API.
 * @param wallet - Wallet caller function.
 */
export function registerMiscTools(
  api: OpenClawPluginApi,
  wallet: WalletCaller,
): void {
  // -- wallet_sign ----------------------------------------------------------

  api.registerTool({
    name: 'wallet_sign',
    label: 'Wallet sign',
    description: 'Sign a message. May forward to the home kernel for approval.',
    parameters: Type.Object({
      message: Type.String({ description: 'Message to sign' }),
    }),
    async execute(
      _id: string,
      params: { message: string },
    ): Promise<ToolResponse> {
      try {
        const result = await wallet('signMessage', [params.message]);
        return makeText(formatToolResult(result));
      } catch (error: unknown) {
        return makeError(`Sign message failed: ${errorMessage(error)}`);
      }
    },
  });

  // -- wallet_capabilities --------------------------------------------------

  api.registerTool({
    name: 'wallet_capabilities',
    label: 'Wallet capabilities',
    description:
      'Check wallet capabilities: local keys, delegations, peer wallet, bundler.',
    parameters: Type.Object({}),
    async execute(): Promise<ToolResponse> {
      try {
        const result = await wallet('getCapabilities', []);
        // Strip internal fields the agent shouldn't see
        if (result && typeof result === 'object') {
          const caps = result as Record<string, unknown>;
          delete caps.localAccounts;
          delete caps.hasLocalKeys;
        }
        return makeText(formatToolResult(result));
      } catch (error: unknown) {
        return makeError(`Get capabilities failed: ${errorMessage(error)}`);
      }
    },
  });

  // -- wallet_accounts ------------------------------------------------------

  api.registerTool({
    name: 'wallet_accounts',
    label: 'Wallet accounts',
    description: 'List wallet accounts.',
    parameters: Type.Object({}),
    async execute(): Promise<ToolResponse> {
      try {
        const result = await wallet('getAccounts', []);
        return makeText(formatToolResult(result));
      } catch (error: unknown) {
        return makeError(`Get accounts failed: ${errorMessage(error)}`);
      }
    },
  });
}

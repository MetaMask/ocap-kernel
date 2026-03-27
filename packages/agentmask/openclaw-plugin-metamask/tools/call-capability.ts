/**
 * metamask_call_capability tool: call a method on an obtained capability.
 */
import type { DaemonCaller } from '../daemon.ts';
import type { PluginState } from '../state.ts';
import { resolveCapability } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the metamask_call_capability tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerCallCapabilityTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'metamask_call_capability',
    label: 'Call MetaMask capability',
    description:
      'Call a method on a previously obtained MetaMask capability. ' +
      'Specify the capability by name (e.g., "PersonalMessageSigner") or kref (e.g., "ko5"), ' +
      'the method name, and optionally a JSON array of arguments.',
    parameters: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description:
            'Capability name (e.g., "PersonalMessageSigner") or kref (e.g., "ko5").',
        },
        method: {
          type: 'string',
          description:
            'Method name to invoke (e.g., "getAccounts", "signMessage").',
        },
        args: {
          type: 'string',
          description:
            'JSON array of arguments (default: "[]"). Example: \'["0xabc...", "hello", "0x1"]\'',
        },
      },
      required: ['capability', 'method'],
    },
    async execute(
      _id: string,
      params: { capability: string; method: string; args?: string },
    ): Promise<ToolResponse> {
      try {
        const kref = resolveCapability(params.capability, state);

        let parsedArgs: unknown[] = [];
        if (params.args) {
          const parsed = JSON.parse(params.args) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('args must be a JSON array');
          }
          parsedArgs = parsed;
        }

        const result = await daemon.queueMessage({
          target: kref,
          method: params.method,
          args: parsedArgs,
        });

        const text =
          typeof result === 'string' ? result : JSON.stringify(result, null, 2);

        return {
          content: [{ type: 'text' as const, text }],
          details: undefined,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${message}`,
            },
          ],
          details: undefined,
        };
      }
    },
  });
}

/**
 * metamask_request_capability tool: request a capability from the vendor.
 */
import type { DaemonCaller } from '../daemon.ts';
import type { PluginState } from '../state.ts';
import { ensureVendor, parseCapabilityResponse } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the metamask_request_capability tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 * @param options.ocapUrl - The OCAP URL for the vendor.
 */
export function registerRequestCapabilityTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
  ocapUrl: string;
}): void {
  const { api, daemon, state, ocapUrl } = options;

  api.registerTool({
    name: 'metamask_request_capability',
    label: 'Request MetaMask capability',
    description:
      'Request a capability from the MetaMask wallet vendor. ' +
      'Describe what you need in natural language (e.g., "I need to sign personal messages"). ' +
      'Returns the capability name and kref for use with metamask_call_capability.',
    parameters: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
          description:
            'Natural language description of the desired capability.',
        },
      },
      required: ['request'],
    },
    async execute(
      _id: string,
      params: { request: string },
    ): Promise<ToolResponse> {
      try {
        const vendorKref = await ensureVendor({ state, daemon, ocapUrl });

        const rawResult = await daemon.queueMessage({
          target: vendorKref,
          method: 'requestCapability',
          args: [params.request],
          raw: true,
        });

        const { kref, name } = parseCapabilityResponse(rawResult);

        state.capabilities.set(name, {
          kref,
          name,
          description: params.request,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Obtained capability: ${name}`,
                `KRef: ${kref}`,
                `Use metamask_call_capability to invoke methods on this capability.`,
              ].join('\n'),
            },
          ],
          details: undefined,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });
}

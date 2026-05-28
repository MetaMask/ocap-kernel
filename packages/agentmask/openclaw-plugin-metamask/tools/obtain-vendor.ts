/**
 * metamask_obtain_vendor tool: obtain the capability vendor by redeeming an OCAP URL.
 */
import type { DaemonCaller } from '../daemon.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the metamask_obtain_vendor tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerObtainVendorTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'metamask_obtain_vendor',
    label: 'Obtain MetaMask capability vendor',
    description:
      'Obtain the MetaMask capability vendor by redeeming an OCAP URL. ' +
      'The user obtains this URL from their ocap kernel-enabled MetaMask ' +
      'extension. Must be called before requesting capabilities.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'OCAP URL from the MetaMask extension (e.g., "ocap:abc123@12D3KooW...,/ip4/...").',
        },
      },
      required: ['url'],
    },
    async execute(_id: string, params: { url: string }): Promise<ToolResponse> {
      try {
        const url = params.url.trim();
        if (!url) {
          throw new Error('OCAP URL is empty.');
        }

        const kref = await daemon.redeemUrl(url);
        state.ocapUrl = url;
        state.vendorKref = kref;

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                'Obtained MetaMask capability vendor.',
                `Vendor KRef: ${kref}`,
                'Use metamask_request_capability to request capabilities.',
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

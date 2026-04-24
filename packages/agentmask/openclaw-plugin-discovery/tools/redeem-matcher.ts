/**
 * `discovery_redeem_matcher` tool: redeem the matcher's OCAP URL to
 * obtain a reference that `discovery_find_services` can query.
 */
import type { DaemonCaller } from '../daemon.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the discovery_redeem_matcher tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerRedeemMatcherTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'discovery_redeem_matcher',
    label: 'Redeem service matcher URL',
    description:
      'Redeem a service matcher OCAP URL to obtain a reference that ' +
      '`discovery_find_services` can query. Must be called before finding ' +
      'services unless the URL was pre-configured.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'OCAP URL for the service matcher (e.g., "ocap:abc@12D3KooW...,/ip4/...").',
        },
      },
      required: ['url'],
    },
    async execute(_id: string, params: { url: string }): Promise<ToolResponse> {
      try {
        const url = params.url.trim();
        if (!url) {
          throw new Error('Matcher URL is empty.');
        }
        const kref = await daemon.redeemUrl(url);
        state.matcher = { url, kref };
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                'Connected to service matcher.',
                `Matcher kref: ${kref}`,
                'Use `discovery_find_services` to look up services.',
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

/**
 * `discovery_find_services` tool: query the matcher with a natural-language
 * description of what the user needs. Returns the candidate matches,
 * which the agent can then connect to via `service_get_description` /
 * `service_initiate_contact`.
 */
import type { DaemonCaller } from '../daemon.ts';
import { requireMatcher } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * The shape of an entry returned by the matcher's `findServices`, after
 * CapData decoding. The matcher returns an array of these.
 */
type ServiceMatchWire = {
  description: {
    description: string;
    contact: { contactType: string; contactUrl: string }[];
    apiSpec: unknown;
  };
  rationale?: string;
};

/**
 * Register the discovery_find_services tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerFindServicesTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'discovery_find_services',
    label: 'Find matching services',
    description:
      'Ask the service matcher for services matching a natural-language ' +
      "description of the user's need. Returns each candidate's " +
      'description and the contact URLs that can be used to initiate ' +
      'contact with it.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Natural-language description of what the user wants to do ' +
            '(e.g., "sign a message with my wallet").',
        },
      },
      required: ['description'],
    },
    async execute(
      _id: string,
      params: { description: string },
    ): Promise<ToolResponse> {
      try {
        const matcherKref = requireMatcher(state);
        const query = { description: params.description };
        const raw = await daemon.queueMessage({
          target: matcherKref,
          method: 'findServices',
          args: [query],
        });

        if (!Array.isArray(raw)) {
          throw new Error(
            `Unexpected findServices result: ${JSON.stringify(raw).slice(0, 200)}`,
          );
        }
        const matches = raw as ServiceMatchWire[];
        if (matches.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No matching services found.',
              },
            ],
            details: undefined,
          };
        }

        const lines: string[] = [
          `Found ${matches.length} candidate service${matches.length === 1 ? '' : 's'}:`,
          '',
        ];
        matches.forEach((match, index) => {
          lines.push(`${index + 1}. ${match.description.description}`);
          for (const contact of match.description.contact) {
            lines.push(
              `   - contact (${contact.contactType}): ${contact.contactUrl}`,
            );
          }
          if (match.rationale) {
            lines.push(`   - rationale: ${match.rationale}`);
          }
          lines.push('');
        });
        lines.push(
          'To use a service, call `service_get_description` (to inspect ' +
            'its API) and then `service_initiate_contact` on one of the ' +
            'contact URLs above.',
        );

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
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

/**
 * `service_get_description` tool: fetch the ServiceDescription from a
 * contact endpoint (identified by OCAP URL, contact nickname, or kref).
 * The returned description carries the service's full API tree
 * recursively — any method whose return schema declares an
 * `interface` includes that inner object's methods inline, so no
 * separate probe is needed to learn a returned object's API.
 */
import type { DaemonCaller } from '../daemon.ts';
import { resolveContact } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the service_get_description tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerGetDescriptionTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'service_get_description',
    label: 'Fetch service description',
    description:
      'Ask a contact endpoint for its full service description, including ' +
      'the API of any objects the service returns (declared inline as ' +
      '`interface`-typed return schemas). `contact` may be an OCAP URL, a ' +
      'previously-cached contact nickname, or a kref.',
    parameters: {
      type: 'object',
      properties: {
        contact: {
          type: 'string',
          description:
            'OCAP URL, contact nickname, or kref identifying the contact endpoint.',
        },
      },
      required: ['contact'],
    },
    async execute(
      _id: string,
      params: { contact: string },
    ): Promise<ToolResponse> {
      try {
        const entry = await resolveContact({
          ref: params.contact,
          state,
          daemon,
        });
        const description = await daemon.queueMessage({
          target: entry.kref,
          method: 'getServiceDescription',
          args: [],
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `Contact: ${entry.nickname}${entry.url ? ` (${entry.url})` : ''}`,
                `Kref: ${entry.kref}`,
                '',
                'Service description:',
                JSON.stringify(description, null, 2),
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

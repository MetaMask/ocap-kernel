/**
 * `service_call` tool: invoke a method on a service obtained via
 * `service_initiate_contact`.
 */
import type { DaemonCaller } from '../daemon.ts';
import { isKref, resolveService } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the service_call tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerCallServiceTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'service_call',
    label: 'Call service method',
    description:
      'Invoke a method on a service obtained via `service_initiate_contact`. ' +
      'Specify the service by nickname (e.g., "PersonalMessageSigner") or ' +
      'kref (e.g., "ko7"), the method name, and optionally a JSON array of ' +
      'arguments.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description:
            'Service nickname (e.g., "PersonalMessageSigner") or kref (e.g., "ko7").',
        },
        method: {
          type: 'string',
          description: 'Method name to invoke (e.g., "signMessage").',
        },
        args: {
          type: 'string',
          description:
            'JSON array of arguments (default: "[]"). Example: ' +
            '\'["0xabc...", "hello", "0x1"]\'',
        },
      },
      required: ['service', 'method'],
    },
    async execute(
      _id: string,
      params: { service: string; method: string; args?: string },
    ): Promise<ToolResponse> {
      try {
        const kref = isKref(params.service)
          ? params.service
          : resolveService(params.service, state).kref;

        let parsedArgs: unknown[] = [];
        if (params.args) {
          const parsed = JSON.parse(params.args) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('`args` must be a JSON array');
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
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          details: undefined,
        };
      }
    },
  });
}

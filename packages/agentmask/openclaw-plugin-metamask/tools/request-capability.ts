/**
 * metamask_request_capability tool: request a capability from the vendor.
 */
import type { DaemonCaller } from '../daemon.ts';
import type { MethodSchema, PluginState } from '../state.ts';
import { ensureVendor, parseCapabilityResponse } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * The dunder method name used to retrieve a discoverable exo's schema.
 * Matches `GET_DESCRIPTION` from `@metamask/kernel-utils`.
 */
const GET_DESCRIPTION = '__getDescription__';

/**
 * Format a method schema into a human-readable string.
 *
 * @param name - The method name.
 * @param schema - The method schema.
 * @returns A formatted description string.
 */
function formatMethod(name: string, schema: MethodSchema): string {
  const argParts = Object.entries(schema.args).map(([argName, argSchema]) => {
    const desc = argSchema.description ? ` — ${argSchema.description}` : '';
    return `    ${argName}: ${argSchema.type}${desc}`;
  });

  const argsBlock =
    argParts.length > 0
      ? `\n  Args:\n${argParts.join('\n')}`
      : '\n  Args: none';

  const returnsBlock = schema.returns
    ? `\n  Returns: ${schema.returns.type}${schema.returns.description ? ` — ${schema.returns.description}` : ''}`
    : '';

  return `- ${name}: ${schema.description}${argsBlock}${returnsBlock}`;
}

/**
 * Register the metamask_request_capability tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.daemon - The daemon caller.
 * @param options.state - The plugin state.
 */
export function registerRequestCapabilityTool(options: {
  api: OpenClawPluginApi;
  daemon: DaemonCaller;
  state: PluginState;
}): void {
  const { api, daemon, state } = options;

  api.registerTool({
    name: 'metamask_request_capability',
    label: 'Request MetaMask capability',
    description:
      'Request a capability from the MetaMask wallet vendor. ' +
      'Describe what you need in natural language (e.g., "I need to sign personal messages"). ' +
      'Returns the capability name, kref, and available methods with their signatures.',
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
        const vendorKref = await ensureVendor({ state, daemon });

        const rawResult = await daemon.queueMessage({
          target: vendorKref,
          method: 'requestCapability',
          args: [params.request],
          raw: true,
        });

        const { kref, name } = parseCapabilityResponse(rawResult);

        // Discover available methods by calling __getDescription__ on the capability.
        let methods: Record<string, MethodSchema> | undefined;
        try {
          const description = await daemon.queueMessage({
            target: kref,
            method: GET_DESCRIPTION,
            args: [],
          });
          if (description && typeof description === 'object') {
            methods = description as Record<string, MethodSchema>;
          }
        } catch {
          // Discovery is best-effort — the capability may not be discoverable.
        }

        state.capabilities.set(name, {
          kref,
          name,
          description: params.request,
          methods,
        });

        const lines = [`Obtained capability: ${name}`, `KRef: ${kref}`];

        if (methods && Object.keys(methods).length > 0) {
          lines.push('', 'Available methods:');
          for (const [methodName, schema] of Object.entries(methods)) {
            lines.push(formatMethod(methodName, schema));
          }
        }

        lines.push(
          '',
          'Use metamask_call_capability to invoke methods on this capability.',
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

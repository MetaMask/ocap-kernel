/**
 * metamask_list_capabilities tool: list all obtained capabilities.
 */
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the metamask_list_capabilities tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 */
export function registerListCapabilitiesTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
}): void {
  const { api, state } = options;

  api.registerTool({
    name: 'metamask_list_capabilities',
    label: 'List MetaMask capabilities',
    description:
      'List all capabilities obtained from the MetaMask capability vendor in this session.',
    parameters: { type: 'object', properties: {} },
    async execute(): Promise<ToolResponse> {
      if (state.capabilities.size === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No capabilities obtained yet. Use metamask_request_capability to request one from the vendor.',
            },
          ],
          details: undefined,
        };
      }

      const lines: string[] = [];
      for (const [name, entry] of state.capabilities) {
        const methodNames = entry.methods
          ? Object.keys(entry.methods).join(', ')
          : 'unknown';
        lines.push(
          `- ${name} (${entry.kref}): ${entry.description}\n  Methods: ${methodNames}`,
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Capabilities (${String(state.capabilities.size)}):\n${lines.join('\n')}`,
          },
        ],
        details: undefined,
      };
    },
  });
}

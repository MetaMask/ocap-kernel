/**
 * `discovery_list_tracked` tool: show everything the plugin is currently
 * tracking — matcher, redeemed contacts, and obtained services.
 */
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';

/**
 * Register the discovery_list_tracked tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 */
export function registerListTrackedTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
}): void {
  const { api, state } = options;

  api.registerTool({
    name: 'discovery_list_tracked',
    label: 'List tracked discovery state',
    description:
      'Report everything this plugin is currently tracking in the session: ' +
      'the matcher connection, redeemed contact endpoints, and services ' +
      'obtained via `service_initiate_contact`.',
    parameters: {
      type: 'object',
      properties: {},
    },
    async execute(): Promise<ToolResponse> {
      const lines: string[] = [];

      if (state.matcher) {
        lines.push(`Matcher: ${state.matcher.kref} (${state.matcher.url})`);
      } else {
        lines.push('Matcher: not connected.');
      }
      lines.push('');

      if (state.contacts.size > 0) {
        lines.push('Contacts:');
        for (const entry of state.contacts.values()) {
          const urlPart = entry.url ? ` — ${entry.url}` : '';
          lines.push(`  - ${entry.nickname} (${entry.kref})${urlPart}`);
        }
      } else {
        lines.push('Contacts: none.');
      }
      lines.push('');

      if (state.services.size > 0) {
        lines.push('Services:');
        for (const entry of state.services.values()) {
          lines.push(
            `  - ${entry.nickname} (${entry.kref}) — from contact ${entry.fromContact}`,
          );
        }
      } else {
        lines.push('Services: none.');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        details: undefined,
      };
    },
  });
}

/**
 * `demo_get_artifact` tool: fetch a previously-recorded artifact by
 * its handle. The agent uses this to retrieve an artifact's data
 * when it needs to inline the payload into a follow-on service call.
 */
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse } from './util.ts';

type GetArtifactParams = {
  handle?: string;
};

/**
 * Register the demo_get_artifact tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 */
export function registerGetArtifactTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
}): void {
  const { api, state } = options;

  api.registerTool({
    name: 'demo_get_artifact',
    label: 'Fetch a recorded artifact by handle',
    description:
      'Fetch a previously-recorded artifact by its `artifact-N` handle. ' +
      "Returns the artifact's kind, data, fromService tag, and metadata.",
    parameters: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description: 'Opaque handle returned by `demo_record_artifact`.',
        },
      },
      required: ['handle'],
    },
    async execute(
      _id: string,
      params: GetArtifactParams,
    ): Promise<ToolResponse> {
      const handle = params.handle?.trim();
      if (!handle) {
        return errorResponse('demo_get_artifact: `handle` is required.');
      }
      const stored = state.artifacts.get(handle);
      if (stored === undefined) {
        const available = [...state.artifacts.keys()].join(', ') || '(none)';
        return errorResponse(
          `demo_get_artifact: no artifact with handle "${handle}". Available: ${available}.`,
        );
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(stored, null, 2),
          },
        ],
        details: undefined,
      };
    },
  });
}

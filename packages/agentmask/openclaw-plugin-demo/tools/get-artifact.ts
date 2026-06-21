/**
 * `demo_get_artifact` tool: fetch a previously-recorded artifact by
 * its handle. The agent uses this when it explicitly needs to inspect
 * a stored artifact (rare — the consolidated tools usually carry the
 * agent through a phase without raw-data lookups).
 */
import { getArtifactStore } from '../artifact-store.ts';
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
 */
export function registerGetArtifactTool(options: {
  api: OpenClawPluginApi;
}): void {
  const { api } = options;
  const artifacts = getArtifactStore();

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
          description: 'Opaque handle of the artifact to retrieve.',
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
      const stored = artifacts.get(handle);
      if (stored === undefined) {
        return errorResponse(
          `demo_get_artifact: no artifact with handle "${handle}".`,
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

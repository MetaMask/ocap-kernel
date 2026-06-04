/**
 * `demo_announce` tool: surface a workflow-phase transition or a
 * free-form narration line to demo-display. The workflow board reads
 * `phase.announced` events to track which column new artifacts belong
 * to; `agent.note` events render under the workflow board as a thin
 * narration strip.
 */
import type { DisplayClient } from '../display-client.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse } from './util.ts';

type AnnounceParams = {
  phaseTransition?: string;
  note?: string;
};

/**
 * Register the demo_announce tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.display - Client posting events to demo-display.
 */
export function registerAnnounceTool(options: {
  api: OpenClawPluginApi;
  display: DisplayClient;
}): void {
  const { api, display } = options;

  api.registerTool({
    name: 'demo_announce',
    label: 'Announce workflow transition or narration',
    description:
      'Surface a workflow-phase transition or a free-form narration line ' +
      'to the audience-facing display. Provide `phaseTransition` to mark a ' +
      'move to a new phase (e.g. "Electronics"); provide `note` for a ' +
      'one-line narration that lands under the workflow board. At least ' +
      'one must be supplied.',
    parameters: {
      type: 'object',
      properties: {
        phaseTransition: {
          type: 'string',
          description:
            'Name of the workflow phase the agent is moving into. ' +
            "Examples: 'Concept', 'Electronics', 'Procurement', " +
            "'Manufacturing', 'Sales'.",
        },
        note: {
          type: 'string',
          description:
            'One-line narration. Speak in the producer/general-contractor voice.',
        },
      },
    },
    async execute(_id: string, params: AnnounceParams): Promise<ToolResponse> {
      const phase = params.phaseTransition?.trim();
      const note = params.note?.trim();
      if (!phase && !note) {
        return errorResponse(
          'demo_announce: at least one of `phaseTransition` or `note` is required.',
        );
      }
      const acknowledgements: string[] = [];
      if (phase) {
        await display.post({ kind: 'phase.announced', phase });
        acknowledgements.push(`Phase → ${phase}`);
      }
      if (note) {
        await display.post({ kind: 'agent.note', note });
        acknowledgements.push(`Note: ${note}`);
      }
      return {
        content: [{ type: 'text' as const, text: acknowledgements.join('\n') }],
        details: undefined,
      };
    },
  });
}

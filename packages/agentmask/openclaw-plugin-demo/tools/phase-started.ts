/**
 * `demo_phase_started` tool: open a new workflow phase in a single
 * call. Combines the three things the agent invariably does together
 * at the top of each phase: announce the phase transition, record an
 * (optional) producer-authored brief artifact, and post an
 * (optional) one-line audience note. Folding these into one tool
 * call saves two LLM round-trips per phase compared to the older
 * `demo_announce` + `demo_record_artifact` + `demo_announce` triplet.
 *
 * The individual tools still exist as escape hatches for cases that
 * don't fit the pattern; the SKILL.md instructs the agent to use
 * this consolidated form for the standard per-phase flow.
 */
import type { DisplayClient } from '../display-client.ts';
import { allocateArtifactHandle } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse } from './util.ts';

type BriefParams = {
  data?: string;
  title?: string;
  summary?: string;
};

type PhaseStartedParams = {
  phase?: string;
  brief?: BriefParams;
  note?: string;
};

/**
 * Register the demo_phase_started tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state (for artifact-handle
 *   allocation and wallet-balance side-emission).
 * @param options.display - Client posting events to demo-display.
 */
export function registerPhaseStartedTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_phase_started',
    label: 'Open a workflow phase (announce + brief + note in one call)',
    description:
      'Open a new workflow phase in one tool call. Announces the phase ' +
      'transition, optionally records the producer-authored brief as a ' +
      'markdown artifact, and optionally surfaces a one-line audience ' +
      'note. Use this at the top of every phase instead of calling ' +
      '`demo_announce` + `demo_record_artifact` + `demo_announce` ' +
      'separately — each LLM round-trip the agent saves is several ' +
      'seconds off the demo pacing.',
    parameters: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          description:
            'Name of the phase the agent is entering. Must exactly match ' +
            'one of the canonical phase names from the skill (e.g. ' +
            '"Concept", "Industrial Design", "Procurement").',
        },
        brief: {
          type: 'object',
          description:
            'Optional producer-authored markdown brief describing what ' +
            'the agent is handing forward into this phase. Recorded as a ' +
            'markdown artifact attributed `fromService: "producer"`. ' +
            'Omit for the Concept phase only if the inventor-supplied ' +
            'pitch is sufficient (otherwise include a brief).',
          properties: {
            data: {
              type: 'string',
              description: 'Markdown source for the brief.',
            },
            title: {
              type: 'string',
              description:
                'Short title for the brief artifact card (e.g. ' +
                '"Industrial Design brief"). Optional.',
            },
            summary: {
              type: 'string',
              description:
                'One-line subtitle for the brief artifact card. Optional.',
            },
          },
          required: ['data'],
        },
        note: {
          type: 'string',
          description:
            'Optional one-line narration to surface on the events log. ' +
            'Producer/general-contractor voice. Keep terse — one short ' +
            'sentence.',
        },
      },
      required: ['phase'],
    },
    async execute(
      _id: string,
      params: PhaseStartedParams,
    ): Promise<ToolResponse> {
      const phase = params.phase?.trim();
      if (!phase) {
        return errorResponse('demo_phase_started: `phase` is required.');
      }

      await display.post({ kind: 'phase.announced', phase });

      const acknowledgements: string[] = [`Phase → ${phase}`];

      let briefHandle: string | undefined;
      if (params.brief && typeof params.brief.data === 'string') {
        const handle = allocateArtifactHandle(state);
        const metadata =
          params.brief.title || params.brief.summary
            ? { title: params.brief.title, summary: params.brief.summary }
            : undefined;
        const stored = {
          handle,
          artifactKind: 'markdown',
          data: params.brief.data,
          fromService: 'producer',
          ...(metadata === undefined ? {} : { metadata }),
        };
        state.artifacts.set(handle, stored);
        await display.post({
          kind: 'artifact.recorded',
          ...stored,
          phase,
        });
        briefHandle = handle;
        acknowledgements.push(`Brief recorded as ${handle}`);
      }

      const note = params.note?.trim();
      if (note) {
        await display.post({ kind: 'agent.note', note });
        acknowledgements.push(`Note: ${note}`);
      }

      // Mirror demo_announce's side-effect re-post of the wallet balance
      // so the dashboard ribbon stays sticky on the agent's first
      // activity in each phase.
      display
        .post({ kind: 'wallet.balance', balanceUsd: state.balanceUsd })
        .catch(() => undefined);

      const briefSuffix =
        briefHandle === undefined ? '' : ` brief=${briefHandle}`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Phase "${phase}" started${briefSuffix}.\n${acknowledgements.join(
              '\n',
            )}`,
          },
        ],
        details: undefined,
      };
    },
  });
}

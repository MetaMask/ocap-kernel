/**
 * `demo_record_artifact` tool: register an artifact with the demo
 * bookkeeping store, get back an opaque handle, and surface the
 * artifact to demo-display so the artifact panel + workflow board can
 * render it.
 */
import type { DisplayClient } from '../display-client.ts';
import { allocateArtifactHandle } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse } from './util.ts';

type RecordArtifactParams = {
  kind?: string;
  data?: string;
  fromService?: string;
  title?: string;
  summary?: string;
  phase?: string;
  consumes?: string[];
};

/**
 * Register the demo_record_artifact tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state.
 * @param options.display - Client posting events to demo-display.
 */
export function registerRecordArtifactTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_record_artifact',
    label: 'Record an artifact in the demo bookkeeping store',
    description:
      'Register an artifact (e.g. a concept sketch returned from a ' +
      'service call) with the demo bookkeeping store. Returns an opaque ' +
      'handle of the form `artifact-N`; pass that handle to subsequent ' +
      'service calls instead of inlining the artifact data.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            "Artifact kind. One of: 'svg', 'image', 'markdown', 'json'.",
        },
        data: {
          type: 'string',
          description:
            'The artifact payload. SVG source, markdown text, ' +
            'JSON-encoded object, or data URI for raster images.',
        },
        fromService: {
          type: 'string',
          description:
            'Provider tag (or other short identifier) for the service ' +
            'that produced this artifact.',
        },
        title: {
          type: 'string',
          description: 'Short title for the artifact card. Optional.',
        },
        summary: {
          type: 'string',
          description: 'One-line subtitle for the artifact card. Optional.',
        },
        phase: {
          type: 'string',
          description:
            'Workflow phase this artifact belongs to (e.g. "Concept", ' +
            '"Electronics"). Use the same name you passed to ' +
            'demo_announce({ phaseTransition }). Optional — falls back ' +
            "to the dashboard's active-phase pointer when omitted, but " +
            'set it explicitly whenever there is any chance the active ' +
            'phase has advanced past the one the artifact belongs to ' +
            '(e.g. parallel phase work, an artifact returning out of ' +
            'order).',
        },
        consumes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Handles of earlier artifacts that were passed (as inputs) ' +
            'to the service call that produced this one — e.g. the ' +
            'schematic handle when recording a PCB layout, or the spec ' +
            'handle when recording a firmware implementation. The demo ' +
            'display reads this to draw lineage edges between artifacts ' +
            'on the workflow board, so the audience can see how each ' +
            'output was derived from earlier work. Optional but should ' +
            'be set whenever the producing call actually took earlier ' +
            'handles as arguments.',
        },
      },
      required: ['kind', 'data', 'fromService'],
    },
    async execute(
      _id: string,
      params: RecordArtifactParams,
    ): Promise<ToolResponse> {
      const kind = params.kind?.trim();
      const { data } = params;
      const fromService = params.fromService?.trim();
      if (!kind || data === undefined || !fromService) {
        return errorResponse(
          'demo_record_artifact: `kind`, `data`, and `fromService` are all required.',
        );
      }
      const handle = allocateArtifactHandle(state);
      const metadata =
        params.title || params.summary
          ? { title: params.title, summary: params.summary }
          : undefined;
      const phase = params.phase?.trim();
      const consumes = Array.isArray(params.consumes)
        ? params.consumes.filter(
            (handleRef): handleRef is string =>
              typeof handleRef === 'string' && handleRef.length > 0,
          )
        : undefined;
      const stored = {
        handle,
        artifactKind: kind,
        data,
        fromService,
        ...(metadata === undefined ? {} : { metadata }),
      };
      state.artifacts.set(handle, stored);
      await display.post({
        kind: 'artifact.recorded',
        ...stored,
        ...(phase ? { phase } : {}),
        ...(consumes && consumes.length > 0 ? { consumes } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded ${kind} artifact as ${handle}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

/**
 * `demo_record_artifact` tool: register an agent-authored artifact
 * with the shared artifact store, get back an opaque handle, and
 * surface the artifact to demo-display so the artifact panel + workflow
 * board can render it. The agent uses this for artifacts it produces
 * directly (e.g. the Concept brief at the top of the pipeline);
 * artifacts that come back from a `service_call` are already
 * interned by the discovery plugin and should be closed out via
 * `demo_service_completed` rather than re-recorded here.
 */
import { getArtifactStore, ARTIFACT_KINDS } from '../artifact-store.ts';
import type { ArtifactKind } from '../artifact-store.ts';
import type { DisplayClient } from '../display-client.ts';
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
 * @param options.display - Client posting events to demo-display.
 */
export function registerRecordArtifactTool(options: {
  api: OpenClawPluginApi;
  display: DisplayClient;
}): void {
  const { api, display } = options;
  const artifacts = getArtifactStore();

  api.registerTool({
    name: 'demo_record_artifact',
    label: 'Record an agent-authored artifact in the bookkeeping store',
    description:
      'Register an agent-authored artifact (e.g. the Concept brief that ' +
      'opens the pipeline) with the demo bookkeeping store. Returns the ' +
      'allocated handle. For artifacts returned by a `service_call`, use ' +
      '`demo_service_completed` instead — the service result is already ' +
      'interned and has a handle waiting.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description: `Artifact kind. One of: ${ARTIFACT_KINDS.join(', ')}.`,
        },
        data: {
          type: 'string',
          description:
            'The artifact payload. SVG source, markdown text, ' +
            'JSON-encoded object, C source, or data URI for raster images.',
        },
        fromService: {
          type: 'string',
          description:
            'Provider tag (or other short identifier) for the source of ' +
            'this artifact. For agent-authored artifacts, the convention ' +
            'is "agent".',
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
            'Workflow phase this artifact belongs to (e.g. "Concept"). ' +
            "Optional — falls back to the dashboard's active-phase pointer " +
            'when omitted.',
        },
        consumes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Handles of earlier artifacts that fed into this one. Drives ' +
            "the workflow board's lineage footer. Optional.",
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
      if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) {
        return errorResponse(
          `demo_record_artifact: kind "${kind}" is not one of: ${ARTIFACT_KINDS.join(', ')}.`,
        );
      }
      const metadata =
        params.title || params.summary
          ? { title: params.title, summary: params.summary }
          : undefined;
      const stored = artifacts.intern({
        kind: kind as ArtifactKind,
        data,
        fromService,
        ...(metadata === undefined ? {} : { metadata }),
      });
      const phase = params.phase?.trim();
      const consumes = Array.isArray(params.consumes)
        ? params.consumes.filter(
            (handleRef): handleRef is string =>
              typeof handleRef === 'string' && handleRef.length > 0,
          )
        : undefined;
      await display.post({
        kind: 'artifact.recorded',
        handle: stored.handle,
        artifactKind: stored.kind,
        data: stored.data,
        fromService: stored.fromService,
        ...(stored.metadata === undefined ? {} : { metadata: stored.metadata }),
        ...(phase ? { phase } : {}),
        ...(consumes && consumes.length > 0 ? { consumes } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded ${kind} artifact as ${stored.handle}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

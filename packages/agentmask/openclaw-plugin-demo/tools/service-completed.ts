/**
 * `demo_service_completed` tool: close out a service_call by recording
 * the returned artifact against a workflow phase, posting any
 * inter-service handoffs that produced the artifact, and (optionally)
 * emitting a one-line audience note. Folds three things the agent
 * invariably does together after a service returns into a single
 * tool call, saving two LLM round-trips per service completion
 * compared to invoking `demo_record_artifact` + `demo_announce`
 * separately.
 *
 * Wallet bookkeeping is NOT part of this call. Since Phase 3 of the
 * wallet rework, costed services validate the `payment` argument
 * they received against their expected price; the withdrawal that
 * minted that payment (via `demo_wallet_withdraw`) already
 * decremented the wallet and posted the `wallet.charge` event, so
 * post-service there's nothing left to charge.
 *
 * Artifact bytes never round-trip through the LLM: `service_call`
 * interns the service result and surfaces only the handle plus
 * summary fields. This tool resolves the handle against the shared
 * artifact store and posts the full payload to `demo-display`
 * server-side.
 */
import { getArtifactStore } from '../artifact-store.ts';
import type { DisplayClient } from '../display-client.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { decodeLiteralUnicodeEscapes, errorResponse } from './util.ts';

type ServiceCompletedParams = {
  handle?: string;
  phase?: string;
  consumes?: string[];
  note?: string;
};

/**
 * Register the demo_service_completed tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.display - Client posting events to demo-display.
 */
export function registerServiceCompletedTool(options: {
  api: OpenClawPluginApi;
  display: DisplayClient;
}): void {
  const { api, display } = options;
  const artifacts = getArtifactStore();

  api.registerTool({
    name: 'demo_service_completed',
    label: 'Close out a service_call (artifact + note in one call)',
    description:
      'Close out a service_call in one tool call. Pass the artifact ' +
      'handle returned by the preceding `service_call`, the phase the ' +
      'artifact belongs to, any earlier-artifact handles that fed into ' +
      'this one (`consumes`), and an optional one-line audience `note`. ' +
      'The plugin resolves the handle against the shared artifact store ' +
      'and emits the full artifact (plus any inter-service handoffs) ' +
      'to the dashboard; the agent never has to round-trip the bytes. ' +
      'No wallet bookkeeping here — that already happened at ' +
      '`demo_wallet_withdraw` time.',
    parameters: {
      type: 'object',
      properties: {
        handle: {
          type: 'string',
          description:
            'Artifact handle returned by the preceding `service_call` (e.g. ' +
            '"artifact-3"). The plugin looks up the kind, data, fromService, ' +
            'and metadata from the shared store; the agent does not pass them.',
        },
        phase: {
          type: 'string',
          description:
            'Workflow phase this artifact belongs to (e.g. "Concept", ' +
            '"Electronics"). Should match what you passed to ' +
            '`demo_phase_started` at the top of this phase.',
        },
        consumes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Handles of earlier artifacts that were passed as inputs to ' +
            'the service call that produced this one. Drives the workflow ' +
            "board's lineage footer.",
        },
        note: {
          type: 'string',
          description:
            'Optional one-line audience-facing narration. Producer voice, ' +
            'one short sentence.',
        },
      },
      required: ['handle', 'phase'],
    },
    async execute(
      _id: string,
      params: ServiceCompletedParams,
    ): Promise<ToolResponse> {
      const handle = params.handle?.trim();
      const rawPhase = params.phase?.trim();
      const phase =
        rawPhase === undefined
          ? undefined
          : decodeLiteralUnicodeEscapes(rawPhase);

      if (!handle) {
        return errorResponse('demo_service_completed: `handle` is required.');
      }
      if (!phase) {
        return errorResponse('demo_service_completed: `phase` is required.');
      }

      const stored = artifacts.get(handle);
      if (stored === undefined) {
        return errorResponse(
          `demo_service_completed: unknown artifact handle "${handle}".`,
        );
      }

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
        phase,
        ...(consumes && consumes.length > 0 ? { consumes } : {}),
      });

      // Inter-service handoffs that took place while producing the
      // artifact (e.g. shenzhen-direct invoking assembly-coop's
      // receive-shipment ocap to deposit a parts manifest) surface
      // as their own SSE events on the dashboard so the audience
      // sees the supplier→assembler handshake separately from the
      // agent's narration. The actual cross-vat ocap call happened
      // inside the supplier vat; this is the parallel dashboard
      // record.
      if (stored.interactions && stored.interactions.length > 0) {
        const at = new Date().toISOString();
        for (const handoff of stored.interactions) {
          await display.post({
            kind: 'service.interaction',
            from: handoff.from,
            to: handoff.to,
            interaction: handoff.interaction,
            at,
          });
        }
      }

      const rawNote = params.note?.trim();
      const note =
        rawNote === undefined
          ? undefined
          : decodeLiteralUnicodeEscapes(rawNote);
      if (note) {
        await display.post({ kind: 'agent.note', note });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded ${stored.kind} artifact as ${handle}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

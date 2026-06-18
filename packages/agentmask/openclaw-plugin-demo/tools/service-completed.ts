/**
 * `demo_service_completed` tool: close out a service_call in a single
 * call. Combines the three things the agent invariably does together
 * after a service returns: record the result as an artifact, charge
 * the wallet for the quoted price, and post an (optional) one-line
 * audience note. Folding these into one tool call saves two LLM
 * round-trips per service completion compared to the older
 * `demo_record_artifact` + `demo_wallet_charge` + `demo_announce`
 * triplet.
 *
 * The individual tools still exist as escape hatches for cases that
 * don't fit the pattern; the SKILL.md instructs the agent to use
 * this consolidated form after every successful `service_call`.
 */
import type { DisplayClient } from '../display-client.ts';
import { allocateArtifactHandle } from '../state.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse } from './util.ts';

type ArtifactParams = {
  kind?: string;
  data?: string;
  fromService?: string;
  title?: string;
  summary?: string;
  phase?: string;
  consumes?: string[];
};

type ChargeParams = {
  amountUsd?: number;
  reason?: string;
};

type ServiceCompletedParams = {
  artifact?: ArtifactParams;
  charge?: ChargeParams;
  note?: string;
};

/**
 * Register the demo_service_completed tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state (for artifact handles and
 *   wallet balance).
 * @param options.display - Client posting events to demo-display.
 */
export function registerServiceCompletedTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;

  api.registerTool({
    name: 'demo_service_completed',
    label: 'Close out a service_call (artifact + charge + note in one call)',
    description:
      'Close out a service_call in one tool call. Records the returned ' +
      'artifact, deducts the quoted price from the wallet, and ' +
      'optionally surfaces a one-line audience note. Use this after ' +
      'every successful `service_call` instead of separate ' +
      '`demo_record_artifact` + `demo_wallet_charge` + `demo_announce` ' +
      'calls — each LLM round-trip saved is several seconds off the ' +
      'demo pacing. Returns the new artifact handle (for forwarding to ' +
      'subsequent service calls) and the new wallet balance.',
    parameters: {
      type: 'object',
      properties: {
        artifact: {
          type: 'object',
          description: 'The artifact the service returned.',
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
                'Provider tag of the service that produced this artifact.',
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
                '"Electronics"). Should match what you passed to ' +
                '`demo_phase_started` at the top of this phase.',
            },
            consumes: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Handles of earlier artifacts that were passed as inputs ' +
                'to the service call that produced this one. Drives the ' +
                "workflow board's lineage footer.",
            },
          },
          required: ['kind', 'data', 'fromService', 'phase'],
        },
        charge: {
          type: 'object',
          description: 'The wallet charge to apply for this service call.',
          properties: {
            amountUsd: {
              type: 'number',
              description: 'Amount to deduct, in USD. Must be positive.',
            },
            reason: {
              type: 'string',
              description:
                'Short human-readable description of the charge (e.g. ' +
                '"industrial-design pass"). Optional.',
            },
          },
          required: ['amountUsd'],
        },
        note: {
          type: 'string',
          description:
            'Optional one-line audience-facing narration. Producer voice, ' +
            'one short sentence.',
        },
      },
      required: ['artifact', 'charge'],
    },
    async execute(
      _id: string,
      params: ServiceCompletedParams,
    ): Promise<ToolResponse> {
      const artifactParams = params.artifact;
      const chargeParams = params.charge;

      if (!artifactParams) {
        return errorResponse(
          'demo_service_completed: `artifact` payload is required.',
        );
      }
      const kind = artifactParams.kind?.trim();
      const { data } = artifactParams;
      const fromService = artifactParams.fromService?.trim();
      const phase = artifactParams.phase?.trim();
      if (!kind || data === undefined || !fromService || !phase) {
        return errorResponse(
          'demo_service_completed: artifact `kind`, `data`, `fromService`, and `phase` are all required.',
        );
      }

      if (!chargeParams) {
        return errorResponse(
          'demo_service_completed: `charge` payload is required.',
        );
      }
      const amount = chargeParams.amountUsd;
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
        return errorResponse(
          `demo_service_completed: charge.amountUsd must be a positive number; got ${amount}.`,
        );
      }

      const handle = allocateArtifactHandle(state);
      const metadata =
        artifactParams.title || artifactParams.summary
          ? { title: artifactParams.title, summary: artifactParams.summary }
          : undefined;
      const consumes = Array.isArray(artifactParams.consumes)
        ? artifactParams.consumes.filter(
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
        phase,
        ...(consumes && consumes.length > 0 ? { consumes } : {}),
      });

      state.balanceUsd -= amount;
      await display.post({
        kind: 'wallet.charge',
        amountUsd: amount,
        reason: chargeParams.reason,
        balanceUsd: state.balanceUsd,
        at: new Date().toISOString(),
      });

      const note = params.note?.trim();
      if (note) {
        await display.post({ kind: 'agent.note', note });
      }

      const reasonSuffix =
        typeof chargeParams.reason === 'string' &&
        chargeParams.reason.length > 0
          ? ` (${chargeParams.reason})`
          : '';
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Recorded ${kind} artifact as ${handle}.\n` +
              `Charged $${amount.toLocaleString()}${reasonSuffix}. ` +
              `New balance: $${state.balanceUsd.toLocaleString()}.`,
          },
        ],
        details: undefined,
      };
    },
  });
}

/**
 * `demo_service_completed` tool: close out a service_call in a single
 * call. Combines the three things the agent invariably does together
 * after a service returns: record the result as an artifact (by
 * handle — the `service_call` reply already carries one), charge the
 * wallet for the quoted price, and post an (optional) one-line
 * audience note. Folding these into one tool call saves two LLM
 * round-trips per service completion compared to the older
 * `demo_record_artifact` + `demo_wallet_charge` + `demo_announce`
 * triplet.
 *
 * Artifact bytes never round-trip through the LLM: `service_call`
 * interns the service result and surfaces only the handle plus
 * summary fields. This tool resolves the handle against the shared
 * artifact store and posts the full payload to `demo-display`
 * server-side.
 */
import { getArtifactStore } from '../artifact-store.ts';
import type { DisplayClient } from '../display-client.ts';
import type { PluginState } from '../state.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import { errorResponse, formatUsd } from './util.ts';

type ServiceCompletedParams = {
  handle?: string;
  phase?: string;
  consumes?: string[];
  charge?: {
    amountUsd?: number;
    reason?: string;
  };
  note?: string;
};

/**
 * Register the demo_service_completed tool.
 *
 * @param options - Registration options.
 * @param options.api - The OpenClaw plugin API.
 * @param options.state - The plugin state (for wallet balance).
 * @param options.display - Client posting events to demo-display.
 */
export function registerServiceCompletedTool(options: {
  api: OpenClawPluginApi;
  state: PluginState;
  display: DisplayClient;
}): void {
  const { api, state, display } = options;
  const artifacts = getArtifactStore();

  api.registerTool({
    name: 'demo_service_completed',
    label: 'Close out a service_call (artifact + charge + note in one call)',
    description:
      'Close out a service_call in one tool call. Pass the artifact ' +
      'handle returned by the preceding `service_call`, the phase the ' +
      'artifact belongs to, any earlier-artifact handles that fed into ' +
      'this one (`consumes`), the wallet `charge`, and an optional ' +
      'one-line audience `note`. The plugin resolves the handle against ' +
      'the shared artifact store and emits the full artifact to the ' +
      'dashboard; the agent never has to round-trip the bytes. The ' +
      'charge amount must be non-negative and must fit in the current ' +
      'wallet balance — zero is accepted as a no-op for covered ' +
      'revisions, and an overdraw is refused with a shortfall message ' +
      'the agent should surface to the inventor before requesting a ' +
      'top-up.',
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
        charge: {
          type: 'object',
          description: 'The wallet charge to apply for this service call.',
          properties: {
            amountUsd: {
              type: 'number',
              description:
                'Amount to deduct, in USD. Use 0 for revisions that ' +
                'are covered by the original engagement (the wallet ' +
                'is left untouched). Otherwise the value must fit in ' +
                'the current balance; an overdraw is refused.',
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
      required: ['handle', 'phase', 'charge'],
    },
    async execute(
      _id: string,
      params: ServiceCompletedParams,
    ): Promise<ToolResponse> {
      const handle = params.handle?.trim();
      const phase = params.phase?.trim();
      const chargeParams = params.charge;

      if (!handle) {
        return errorResponse('demo_service_completed: `handle` is required.');
      }
      if (!phase) {
        return errorResponse('demo_service_completed: `phase` is required.');
      }
      if (!chargeParams) {
        return errorResponse(
          'demo_service_completed: `charge` payload is required.',
        );
      }
      const amount = chargeParams.amountUsd;
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount < 0) {
        return errorResponse(
          `demo_service_completed: charge.amountUsd must be a non-negative number; got ${amount}.`,
        );
      }
      if (amount > state.balanceUsd) {
        const shortfall = amount - state.balanceUsd;
        return errorResponse(
          `demo_service_completed: charge of ${formatUsd(amount)} would ` +
            `overdraw the wallet (balance ${formatUsd(state.balanceUsd)}, ` +
            `shortfall ${formatUsd(shortfall)}). Surface the shortfall to ` +
            `the inventor and request a top-up via demo_wallet_credit ` +
            `before retrying.`,
        );
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

      // Zero-amount charges (covered revisions) are no-ops on the
      // wallet side — skip the state update and the `wallet.charge`
      // SSE event entirely so the dashboard transcript doesn't get a
      // misleading "$0 charge" line.
      if (amount > 0) {
        state.balanceUsd -= amount;
        await display.post({
          kind: 'wallet.charge',
          amountUsd: amount,
          reason: chargeParams.reason,
          balanceUsd: state.balanceUsd,
          at: new Date().toISOString(),
        });
      }

      const note = params.note?.trim();
      if (note) {
        await display.post({ kind: 'agent.note', note });
      }

      const reasonSuffix =
        typeof chargeParams.reason === 'string' &&
        chargeParams.reason.length > 0
          ? ` (${chargeParams.reason})`
          : '';
      const chargeLine =
        amount === 0
          ? `No charge applied (covered revision or no-cost step).`
          : `Charged ${formatUsd(amount)}${reasonSuffix}. New balance: ${formatUsd(state.balanceUsd)}.`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded ${stored.kind} artifact as ${handle}.\n${chargeLine}`,
          },
        ],
        details: undefined,
      };
    },
  });
}

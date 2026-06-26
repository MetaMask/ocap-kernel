import { E } from '@endo/eventual-send';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { OcapURLRedemptionService } from '@metamask/ocap-kernel';

import { renderBom } from './template.ts';
import { formatUsd, makeVolumeProfile } from '../vat-lib/index.ts';
import type { ReceiveShipmentEndpoint } from '../vat-lib/index.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Source" per plan §6 component-sourcing capability discipline.
 */
export const COMPONENT_SOURCING_SERVICE_DESCRIPTION =
  'Source components and execute purchase orders for an electronic ' +
  'product. Two-step delivery: `source` returns a priced bill of ' +
  'materials markdown with part numbers, distributors, lead times, ' +
  'and unit prices (~$400 sourcing fee); on customer approval, ' +
  '`purchase` places the actual parts order with the cited ' +
  'distributors and returns a purchase confirmation, charging the ' +
  'quoted batch total. Sourcing fee covers up to two BOM revisions.';

export const COMPONENT_SOURCING_PROVIDER_TAG = 'shenzhen-direct';

/**
 * Advisory price (USD) for the sourcing fee. `purchase` charges
 * the actual batch parts cost, which now depends on the quantity
 * the brief named — see `renderBom` in `./template.ts` and the
 * shared volume-pricing helpers in `vat-lib`.
 */
export const COMPONENT_SOURCING_PRICE_USD = 400;
/**
 * Default quantity when the brief doesn't mention one. 15 matches
 * the prototype Manufacturing engagement in the demo's Stage 2.
 */
const DEFAULT_BATCH_QUANTITY = 15;

export type ComponentSourcingArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Inter-service handoffs that took place producing this artifact —
   * for the `purchase` method, the shipment of parts to the
   * assembler's receive-shipment endpoint. The demo plugin reads
   * this and posts a service.interaction event so the audience sees
   * the supplier→assembler handshake separately from agent narration.
   */
  interactions?: { from: string; to: string; interaction: string }[];
};

/**
 * Build the component-sourcing service exo.
 *
 * @param options - Construction options.
 * @param options.ocapURLRedemptionService - Kernel service used by
 *   `purchase` to redeem an assembler's receive-shipment URL and
 *   hand off the parts manifest directly.
 * @returns A discoverable exo with `source` and `purchase` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeComponentSourcingService(options: {
  ocapURLRedemptionService: OcapURLRedemptionService;
}) {
  const { ocapURLRedemptionService } = options;
  // The most recent BOM's quantity. `purchase` looks this up so the
  // order receipt and the shipped manifest match what the BOM
  // priced. Per-instance state; one matcher invocation per agent
  // session so cross-call contamination is not a concern.
  let lastBatchQuantity = DEFAULT_BATCH_QUANTITY;
  let lastBatchTotalUsd: number | undefined;
  return makeDiscoverableExo(
    'ComponentSourcingService',
    {
      async source(spec: string): Promise<ComponentSourcingArtifact> {
        const { markdown, profile, batchTotalUsd } = renderBom({
          providerLabel: COMPONENT_SOURCING_PROVIDER_TAG,
          brief: typeof spec === 'string' ? spec : '',
          defaultQuantity: DEFAULT_BATCH_QUANTITY,
        });
        lastBatchQuantity = profile.quantity;
        lastBatchTotalUsd = batchTotalUsd;
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: COMPONENT_SOURCING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — bill of materials',
            summary:
              `Priced BOM at ${profile.tierLabel}: ` +
              `${profile.quantity.toLocaleString()} units, ` +
              `batch total ${formatUsd(batchTotalUsd)}. Enclosure ` +
              `${profile.enclosureModality}.`,
          },
        });
      },
      async purchase(approval: {
        shipToUrl?: string;
      }): Promise<ComponentSourcingArtifact> {
        // Honor whatever the last source() call quoted, or
        // synthesize a quote on the fly if purchase() ran without
        // a prior source() (defensive; the agent's cadence puts
        // source() first).
        const quantity = lastBatchQuantity;
        const total =
          lastBatchTotalUsd ??
          makeVolumeProfile(quantity).pcbUnitUsd * quantity;
        const totalLabel = formatUsd(total);
        const profile = makeVolumeProfile(quantity);
        const shipToUrl =
          typeof approval?.shipToUrl === 'string' && approval.shipToUrl.length
            ? approval.shipToUrl
            : undefined;
        if (shipToUrl === undefined) {
          // Without a shipping target the order has nowhere to land;
          // refuse loudly so the agent has to surface the
          // assembler's receive-shipment URL it should already be
          // holding from the Manufacturing.assemble reply.
          throw new Error(
            'shenzhen-direct.purchase: approval.shipToUrl is required. ' +
              "Pass the manufacturer's receive-shipment ocap URL " +
              "from the prior assembly-coop.assemble reply's " +
              '`receiveShipmentUrl` field.',
          );
        }
        // Redeem the assembler's receive-shipment URL and hand
        // off the parts manifest directly. The assembler's ack
        // carries the receiver's provider tag, which we use to
        // label the dashboard event accurately.
        const receiver = (await E(ocapURLRedemptionService).redeem(
          shipToUrl,
        )) as ReceiveShipmentEndpoint;
        const ack = await E(receiver).receiveShipment({
          from: COMPONENT_SOURCING_PROVIDER_TAG,
          kind: 'parts shipment',
          items: `components for a ${quantity.toLocaleString()}-unit ${profile.tier} batch`,
        });
        const { receiverTag, buildPhase } = ack;
        const interactions = [
          {
            from: COMPONENT_SOURCING_PROVIDER_TAG,
            to: receiverTag,
            interaction: `parts shipment manifest acknowledged (${totalLabel}) — ${
              buildPhase
            }`,
          },
        ];
        const data =
          `# Parts purchase confirmation\n\n` +
          `Vendor: ${COMPONENT_SOURCING_PROVIDER_TAG}\n` +
          `Order: components for a ${quantity.toLocaleString()}-unit batch (${profile.tierLabel})\n` +
          `Total: ${totalLabel}\n` +
          `Estimated lead time: ${
            profile.enclosureModality === 'SLA' ? '14 days' : '21 days'
          }\n` +
          `Ship to: ${receiverTag}\n\n` +
          `Order accepted. The distributor will consolidate parts ` +
          `and ship to the manufacturer on the lead-time schedule. ` +
          `PCB fabrication is a separate engagement with the ` +
          `inventor's PCB house.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: COMPONENT_SOURCING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — parts purchase confirmation',
            summary:
              `Parts order placed with ${COMPONENT_SOURCING_PROVIDER_TAG}: ` +
              `${totalLabel} for the ${quantity.toLocaleString()}-unit batch ` +
              `at ${profile.tierLabel}. Manifest handed off to ${receiverTag} via ocap.`,
          },
          interactions,
        });
      },
    },
    {
      source: {
        description:
          'Round 1: produce a priced bill of materials from a ' +
          'schematic and a target batch size.',
        args: {
          spec: {
            type: 'string',
            description:
              'Sourcing brief, in plain English (schematic summary ' +
              'or handle, batch size, distributor preferences).',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping a markdown BOM document.',
          properties: {
            kind: {
              type: 'string',
              description: "Artifact kind. Always 'markdown' for this service.",
            },
            data: {
              type: 'string',
              description: 'Markdown source as a single string.',
            },
            fromService: {
              type: 'string',
              description: 'Provider tag of the service that produced this.',
            },
          },
          required: ['kind', 'data', 'fromService'],
        },
      },
      purchase: {
        description:
          'Round 2: place the actual parts purchase order with the ' +
          'distributors cited in the round-1 BOM, charging the batch ' +
          'total quoted in the BOM. The agent invokes this only after ' +
          'the inventor approves the BOM. `approval.shipToUrl` is ' +
          "required — pass the manufacturer's receive-shipment ocap " +
          "URL from the prior assembly-coop.assemble reply's " +
          '`receiveShipmentUrl` field. The distributor redeems it and ' +
          'hands the parts manifest off to the assembler directly.',
        args: {
          approval: {
            type: 'object',
            description:
              'Approval object carrying the manufacturer-handoff URL.',
            properties: {
              shipToUrl: {
                type: 'string',
                description:
                  "Required. Ocap URL of the manufacturer's " +
                  'receive-shipment endpoint, as returned by ' +
                  "assembly-coop.assemble's `receiveShipmentUrl` " +
                  'field. Without this the order has no shipping ' +
                  'target and the call fails.',
              },
            },
            required: ['shipToUrl'],
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown purchase receipt.',
          properties: {
            kind: {
              type: 'string',
              description: "Artifact kind. Always 'markdown' for this service.",
            },
            data: {
              type: 'string',
              description: 'Markdown source as a single string.',
            },
            fromService: {
              type: 'string',
              description: 'Provider tag of the service that produced this.',
            },
          },
          required: ['kind', 'data', 'fromService'],
        },
      },
    },
  );
}

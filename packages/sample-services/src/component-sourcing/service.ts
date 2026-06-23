import { E } from '@endo/eventual-send';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { OcapURLRedemptionService } from '@metamask/ocap-kernel';

import { renderBom } from './template.ts';
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
 * Advisory per-method prices (USD). `source` is a flat sourcing fee
 * for producing the BOM. `purchase` is the batch parts cost itself,
 * pinned to the canonical 15-unit profile so the agent's wallet
 * charge after the inventor approves the BOM matches what the
 * audience saw in the document.
 */
export const COMPONENT_SOURCING_PRICE_USD = 400;
export const COMPONENT_SOURCING_PURCHASE_PRICE_USD = 961.5;

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
 * Format a USD amount with two decimals + thousands separators.
 *
 * @param amount - The USD amount.
 * @returns The formatted string, e.g. `"$961.50"`.
 */
function formatUsd(amount: number): string {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
  return makeDiscoverableExo(
    'ComponentSourcingService',
    {
      async source(_spec: string): Promise<ComponentSourcingArtifact> {
        const markdown = renderBom({
          providerLabel: COMPONENT_SOURCING_PROVIDER_TAG,
        });
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: COMPONENT_SOURCING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — bill of materials',
            summary:
              'Priced BOM for a prototype batch: components, ' +
              'distributors, lead times, and per-unit totals.',
          },
        });
      },
      async purchase(approval: {
        shipToUrl?: string;
      }): Promise<ComponentSourcingArtifact> {
        const total = COMPONENT_SOURCING_PURCHASE_PRICE_USD;
        const totalLabel = formatUsd(total);
        const shipToUrl =
          typeof approval?.shipToUrl === 'string' && approval.shipToUrl.length
            ? approval.shipToUrl
            : undefined;
        let receiverTag = 'assembly-coop';
        const interactions: {
          from: string;
          to: string;
          interaction: string;
        }[] = [];
        if (shipToUrl !== undefined) {
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
            items: 'components for a 15-unit prototype batch',
          });
          receiverTag = ack.receiverTag;
          interactions.push({
            from: COMPONENT_SOURCING_PROVIDER_TAG,
            to: receiverTag,
            interaction: `parts shipment manifest acknowledged (${totalLabel})`,
          });
        }
        const data =
          `# Parts purchase confirmation\n\n` +
          `Vendor: ${COMPONENT_SOURCING_PROVIDER_TAG}\n` +
          `Order: components for a 15-unit prototype batch\n` +
          `Total: ${totalLabel}\n` +
          `Estimated lead time: 14 days\n` +
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
              `${totalLabel} for the 15-unit batch, 14-day lead time.`,
          },
          ...(interactions.length > 0 ? { interactions } : {}),
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
          'distributors cited in the round-1 BOM. The wallet charge ' +
          `for this call is the batch total ($${formatUsd(COMPONENT_SOURCING_PURCHASE_PRICE_USD).slice(1)} ` +
          'for the canonical 15-unit profile); the agent should ' +
          'invoke this only after the inventor approves the BOM. ' +
          "Pass the manufacturer's receive-shipment ocap URL in " +
          '`approval.shipToUrl`; the distributor redeems it and ' +
          'hands the parts manifest off directly to the assembler.',
        args: {
          approval: {
            type: 'object',
            description:
              "Approval object. `shipToUrl` carries the manufacturer's " +
              'receive-shipment ocap URL — the distributor redeems and ' +
              'invokes it to hand off the parts manifest directly. ' +
              'Omit `shipToUrl` only if the manufacturer is acquiring ' +
              'parts some other way (unusual).',
            properties: {
              shipToUrl: {
                type: 'string',
                description:
                  "Ocap URL of the manufacturer's receive-shipment " +
                  "endpoint, as returned by assembly-coop.assemble's " +
                  '`receiveShipmentUrl` field.',
              },
            },
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

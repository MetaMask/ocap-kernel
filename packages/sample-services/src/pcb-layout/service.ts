import { E } from '@endo/eventual-send';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { OcapURLRedemptionService } from '@metamask/ocap-kernel';

import { renderPcbLayout } from './template.ts';
import {
  formatUsd,
  makeVolumeProfile,
  parseQuantity,
} from '../vat-lib/index.ts';
import type { ReceiveShipmentEndpoint, VolumeTier } from '../vat-lib/index.ts';

/**
 * Tier-derived turnaround estimate for the PCB fab order.
 *
 * @param tier - The volume tier.
 * @returns A short human-readable string for the receipt.
 */
function pcbTurnaround(tier: VolumeTier): string {
  switch (tier) {
    case 'production':
      return '21 days (fab + shipping)';
    case 'medium-volume':
      return '14 days (fab + shipping)';
    case 'small-batch':
    case 'prototype':
    default:
      return '10 days (fab + shipping)';
  }
}

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Lay out" per plan §6 pcb-layout capability discipline.
 */
export const PCB_LAYOUT_SERVICE_DESCRIPTION =
  'Lay out and fabricate printed circuit boards. `layout` takes a ' +
  'schematic and case dimensions (text) and returns a top-view PCB ' +
  'image with components placed, copper traces, and silkscreen ' +
  'labels (~$600 design fee, covers up to two revisions). On ' +
  'customer approval of the layout we also ship a small set of ' +
  "sample bare boards to the customer's engineering-prototype shop " +
  'at no extra charge — the design fee covers it. On customer ' +
  'approval, `fabricate` places the production order for bare ' +
  'boards against an earlier layout and returns a fab receipt, ' +
  'charging per-board cost for the agreed batch and shipping the ' +
  'boards to a manufacturer of record.';

export const PCB_LAYOUT_PROVIDER_TAG = 'pcb-wizards';

/**
 * Advisory price (USD) for the layout design fee. `fabricate`
 * charges the actual batch fab cost, computed from the volume tier
 * of the brief passed to the prior `layout` call.
 */
export const PCB_LAYOUT_PRICE_USD = 600;
/**
 * Default board quantity when the brief doesn't mention one. 15
 * matches the prototype Manufacturing engagement in Stage 2.
 */
const DEFAULT_FAB_QUANTITY = 15;

/**
 * Shape returned by `layout`.
 */
export type PcbLayoutArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Shape returned by `fabricate`. Distinct from PcbLayoutArtifact
 * because `fabricate` returns markdown (the receipt) rather than the
 * SVG layout itself.
 */
export type PcbFabricateArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  interactions?: { from: string; to: string; interaction: string }[];
};

/**
 * Build the pcb-layout service exo.
 *
 * @param options - Construction options.
 * @param options.ocapURLRedemptionService - Kernel service used by
 *   `fabricate` to redeem an assembler's receive-shipment URL and
 *   hand off the bare-boards manifest directly.
 * @returns A discoverable exo with `layout` and `fabricate` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makePcbLayoutService(options: {
  ocapURLRedemptionService: OcapURLRedemptionService;
}) {
  const { ocapURLRedemptionService } = options;
  // Last `layout` call's quantity drives the fab quote — same
  // pattern as shenzhen-direct's source/purchase.
  let lastBoardQuantity = DEFAULT_FAB_QUANTITY;
  return makeDiscoverableExo(
    'PcbLayoutService',
    {
      async layout(spec: string): Promise<PcbLayoutArtifact> {
        const quantity = parseQuantity(
          typeof spec === 'string' ? spec : '',
          DEFAULT_FAB_QUANTITY,
        );
        const profile = makeVolumeProfile(quantity);
        lastBoardQuantity = quantity;
        const fabTotal = profile.pcbUnitUsd * quantity;
        const svg = renderPcbLayout({
          providerLabel: PCB_LAYOUT_PROVIDER_TAG,
        });
        return harden({
          kind: 'svg',
          data: svg,
          fromService: PCB_LAYOUT_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — PCB top view',
            summary:
              `PCB top-view layout — MCU QFN, mic, OLED connector, key ` +
              `switches, IR driver, battery clips, USB-C, mounting holes. ` +
              `Fab quote at ${profile.tierLabel}: ${formatUsd(
                profile.pcbUnitUsd,
              )} per board × ${quantity.toLocaleString()} = ` +
              `${formatUsd(fabTotal)} (charged on \`fabricate\`). ` +
              `Sample bare boards shipped to the engineering-prototype ` +
              `shop are included in the design fee.`,
          },
        });
      },
      async fabricate(approval: {
        shipToUrl?: string;
      }): Promise<PcbFabricateArtifact> {
        const quantity = lastBoardQuantity;
        const profile = makeVolumeProfile(quantity);
        const total = profile.pcbUnitUsd * quantity;
        const totalLabel = formatUsd(total);
        const shipToUrl =
          typeof approval?.shipToUrl === 'string' && approval.shipToUrl.length
            ? approval.shipToUrl
            : undefined;
        if (shipToUrl === undefined) {
          throw new Error(
            'pcb-wizards.fabricate: approval.shipToUrl is required. ' +
              "Pass the manufacturer's receive-shipment ocap URL " +
              "from the prior assembly-coop.assemble reply's " +
              '`receiveShipmentUrl` field.',
          );
        }
        const receiver = (await E(ocapURLRedemptionService).redeem(
          shipToUrl,
        )) as ReceiveShipmentEndpoint;
        const ack = await E(receiver).receiveShipment({
          from: PCB_LAYOUT_PROVIDER_TAG,
          kind: 'bare boards shipment',
          items: `${quantity.toLocaleString()} production boards, 2-layer, 46×102 mm, ENIG finish`,
        });
        const { receiverTag, buildPhase } = ack;
        const interactions = [
          {
            from: PCB_LAYOUT_PROVIDER_TAG,
            to: receiverTag,
            interaction: `bare-boards shipment manifest acknowledged (${totalLabel}) — ${
              buildPhase
            }`,
          },
        ];
        const turnaround = pcbTurnaround(profile.tier);
        const data =
          `# PCB fabrication confirmation\n\n` +
          `Vendor: ${PCB_LAYOUT_PROVIDER_TAG}\n` +
          `Order: ${quantity.toLocaleString()} bare boards, 2-layer, ` +
          `46×102 mm, ENIG finish (${profile.tierLabel})\n` +
          `Total: ${totalLabel}\n` +
          `Estimated turnaround: ${turnaround}\n` +
          `Ship to: ${receiverTag}\n\n` +
          `Order accepted. Boards run through our standard 2-layer ` +
          `production line and ship to the manufacturer to join the ` +
          `parts purchase for assembly.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: PCB_LAYOUT_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — PCB fabrication confirmation',
            summary:
              `Fab order placed with ${PCB_LAYOUT_PROVIDER_TAG}: ` +
              `${totalLabel} for ${quantity.toLocaleString()} boards at ` +
              `${profile.tierLabel}, ${turnaround}. Manifest handed off to ` +
              `${receiverTag} via ocap.`,
          },
          interactions,
        });
      },
      async shipSampleBoards(approval: {
        shipToUrl?: string;
      }): Promise<PcbFabricateArtifact> {
        const shipToUrl =
          typeof approval?.shipToUrl === 'string' && approval.shipToUrl.length
            ? approval.shipToUrl
            : undefined;
        if (shipToUrl === undefined) {
          throw new Error(
            'pcb-wizards.shipSampleBoards: shipToUrl is required.',
          );
        }
        const receiver = (await E(ocapURLRedemptionService).redeem(
          shipToUrl,
        )) as ReceiveShipmentEndpoint;
        const ack = await E(receiver).receiveShipment({
          from: PCB_LAYOUT_PROVIDER_TAG,
          kind: 'sample boards shipment',
          items: '3 sample bare boards from the prototype layout',
          notes:
            "no-charge delivery to the customer's engineering-prototype " +
            'shop, covered by the design fee',
        });
        const { receiverTag, buildPhase } = ack;
        const interactions = [
          {
            from: PCB_LAYOUT_PROVIDER_TAG,
            to: receiverTag,
            interaction: `sample bare boards shipped (no charge) — ${buildPhase}`,
          },
        ];
        const data =
          `# Sample bare boards shipment\n\n` +
          `Vendor: ${PCB_LAYOUT_PROVIDER_TAG}\n` +
          `Order: 3 sample bare boards\n` +
          `Total: $0.00 (covered by the layout design fee)\n` +
          `Ship to: ${receiverTag}\n\n` +
          `Sample boards on their way. The engineering-prototype shop ` +
          `can begin the bench build as soon as they arrive.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: PCB_LAYOUT_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — sample bare boards shipment',
            summary:
              `Sample boards shipped from ${PCB_LAYOUT_PROVIDER_TAG} to ` +
              `${receiverTag}, no charge (covered by layout fee).`,
          },
          interactions,
        });
      },
    },
    {
      layout: {
        description:
          'Produce a PCB top-view layout from a schematic and case dimensions.',
        args: {
          spec: {
            type: 'string',
            description:
              'Schematic handle + case dimensions, in plain English.',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping an inline SVG layout.',
          properties: {
            kind: {
              type: 'string',
              description: "Artifact kind. Always 'svg' for this service.",
            },
            data: {
              type: 'string',
              description: 'Raw SVG source as a single string.',
            },
            fromService: {
              type: 'string',
              description: 'Provider tag of the service that produced this.',
            },
          },
          required: ['kind', 'data', 'fromService'],
        },
      },
      fabricate: {
        description:
          'Place a production order for bare boards against an ' +
          'earlier layout. The wallet charge for this call is the ' +
          'per-batch fab total quoted by pcb-wizards. Invoke only ' +
          'after the inventor approves the layout and the ' +
          'engineering-prototype validation has cleared. ' +
          '`approval.shipToUrl` is required — pass the ' +
          "manufacturer's receive-shipment ocap URL from the prior " +
          "assembly-coop.assemble reply's `receiveShipmentUrl` " +
          'field. pcb-wizards redeems it and hands the bare-boards ' +
          'manifest off to the assembler directly.',
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
          description: 'Artifact descriptor wrapping a markdown fab receipt.',
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
      shipSampleBoards: {
        description:
          "Ship a small set of sample bare boards to the customer's " +
          'engineering-prototype shop. No wallet charge — covered by ' +
          "the layout design fee. Pass the prototype shop's receive-" +
          'shipment ocap URL in `approval.shipToUrl`; pcb-wizards ' +
          'redeems and invokes it to hand off the sample boards. ' +
          'Intended for the Bench Build phase.',
        args: {
          approval: {
            type: 'object',
            description:
              'Approval object. `shipToUrl` is required — it carries ' +
              "proto-pros's receive-shipment ocap URL.",
            properties: {
              shipToUrl: {
                type: 'string',
                description:
                  "Ocap URL of the engineering-prototype shop's " +
                  'receive-shipment endpoint, as returned by ' +
                  "proto-pros.engage's `receiveShipmentUrl` field.",
              },
            },
            required: ['shipToUrl'],
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a brief markdown shipment ' +
            'confirmation.',
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

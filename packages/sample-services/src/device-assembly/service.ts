import { E } from '@endo/eventual-send';
import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { OcapURLRedemptionService } from '@metamask/ocap-kernel';

import { renderBuildPlan } from './template.ts';
import type { ReceiveShipmentEndpoint } from '../vat-lib/index.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Assemble" per plan §6 device-assembly capability discipline.
 */
export const DEVICE_ASSEMBLY_SERVICE_DESCRIPTION =
  'Assemble an electronic device from a PCB, an enclosure, and ' +
  'electronic components. Three-step delivery: `assemble` returns a ' +
  'markdown build plan covering work cells, test sequence, QA gates, ' +
  'and per-unit assembly cost (~$1,800 setup fee), and issues a ' +
  'receive-shipment ocap URL so suppliers can hand off parts and ' +
  'boards directly. On customer approval, `build` executes the run ' +
  'and returns a build receipt, charging the per-unit labor for the ' +
  'agreed batch. `shipFinishedUnits` ships the completed batch to a ' +
  "fulfillment operator's receive-shipment URL after the build " +
  'finishes (no additional charge — covered by the build labor fee). ' +
  'Setup fee covers up to two revisions of the same plan on request.';

export const DEVICE_ASSEMBLY_PROVIDER_TAG = 'assembly-coop';

/**
 * Advisory per-method prices (USD). `assemble` is a one-time setup
 * fee for producing the build plan. `build` is the per-unit labor
 * for the prototype batch, pinned to the canonical 15-unit profile.
 */
export const DEVICE_ASSEMBLY_PRICE_USD = 1_800;
export const DEVICE_ASSEMBLY_BUILD_PRICE_USD = 240;

export type DeviceAssemblyArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Ocap URL of assembly-coop's receive-shipment endpoint. Returned
   * on `assemble` so the agent can thread it through to supplier
   * commit methods (shenzhen-direct.purchase, pcb-wizards.fabricate)
   * as their `shipToUrl` argument; the supplier redeems the URL and
   * calls `receiveShipment(manifest)` on the assembler directly.
   */
  receiveShipmentUrl?: string;
  /**
   * Inter-service handoffs attached when the assembler invokes
   * another service's receive-shipment ocap (`shipFinishedUnits`
   * outbound to pacific-fulfillment, for example).
   */
  interactions?: { from: string; to: string; interaction: string }[];
};

/**
 * Build the device-assembly service exo.
 *
 * @param options - Construction options.
 * @param options.getReceiveShipmentUrl - Closure returning the URL of
 *   the assembler's receive-shipment endpoint. Set by the vat root
 *   after the URL is issued at bootstrap.
 * @param options.ocapURLRedemptionService - Kernel service used by
 *   `shipFinishedUnits` to redeem the fulfillment operator's
 *   receive-shipment URL and hand off the finished units.
 * @returns A discoverable exo with `assemble`, `build`, and
 *   `shipFinishedUnits` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeDeviceAssemblyService(options: {
  getReceiveShipmentUrl: () => string;
  ocapURLRedemptionService: OcapURLRedemptionService;
}) {
  const { getReceiveShipmentUrl, ocapURLRedemptionService } = options;
  return makeDiscoverableExo(
    'DeviceAssemblyService',
    {
      async assemble(_spec: string): Promise<DeviceAssemblyArtifact> {
        const markdown = renderBuildPlan({
          providerLabel: DEVICE_ASSEMBLY_PROVIDER_TAG,
        });
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: DEVICE_ASSEMBLY_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — assembly build plan',
            summary:
              'Build plan covering work cells, test sequence, QA ' +
              'gates, schedule, and per-unit assembly cost. ' +
              'Engagement includes a receive-shipment ocap URL so ' +
              'suppliers can deliver parts and bare boards directly ' +
              'to the assembler.',
          },
          receiveShipmentUrl: getReceiveShipmentUrl(),
        });
      },
      async build(_approval: unknown): Promise<DeviceAssemblyArtifact> {
        const total = DEVICE_ASSEMBLY_BUILD_PRICE_USD;
        const totalLabel = `$${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
        const data =
          `# Build order confirmation\n\n` +
          `Vendor: ${DEVICE_ASSEMBLY_PROVIDER_TAG}\n` +
          `Order: 15-unit prototype assembly run\n` +
          `Labor total: ${totalLabel}\n` +
          `Estimated turnaround: 4 weeks from parts receipt\n` +
          `First-pass yield target: 94%\n` +
          `Includes: SMT placement, hand-population of the through-hole ` +
          `pin headers, button-press functional test, IR self-loopback ` +
          `against the four protocols in the firmware spec, BLE scan, ` +
          `mic SNR check, full button-matrix walk, drop test on a ` +
          `randomly-selected 10% of units.\n\n` +
          `Order accepted. Build kicks off once parts and PCBs arrive ` +
          `from their respective vendors. Finished units ship to the ` +
          `fulfillment operator (or destination) the customer ` +
          `designates via \`shipFinishedUnits\`.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: DEVICE_ASSEMBLY_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — build order confirmation',
            summary:
              `Build order placed with ${DEVICE_ASSEMBLY_PROVIDER_TAG}: ` +
              `${totalLabel} labor for the 15-unit batch, 4-week ` +
              `turnaround from parts receipt.`,
          },
        });
      },
      async shipFinishedUnits(approval: {
        shipToUrl?: string;
      }): Promise<DeviceAssemblyArtifact> {
        const shipToUrl =
          typeof approval?.shipToUrl === 'string' && approval.shipToUrl.length
            ? approval.shipToUrl
            : undefined;
        if (shipToUrl === undefined) {
          throw new Error(
            'assembly-coop.shipFinishedUnits: approval.shipToUrl is ' +
              "required. Pass the fulfillment operator's receive-" +
              'shipment ocap URL from the prior pacific-fulfillment.' +
              "arrange reply's `receiveShipmentUrl` field.",
          );
        }
        const receiver = (await E(ocapURLRedemptionService).redeem(
          shipToUrl,
        )) as ReceiveShipmentEndpoint;
        const ack = await E(receiver).receiveShipment({
          from: DEVICE_ASSEMBLY_PROVIDER_TAG,
          kind: 'finished units shipment',
          items: '15 finished LAUR units, individually packaged',
          notes:
            'shipped after the assembly run completes; tracking ' +
            'numbers handed off with the manifest',
        });
        const { receiverTag } = ack;
        const interactions = [
          {
            from: DEVICE_ASSEMBLY_PROVIDER_TAG,
            to: receiverTag,
            interaction: 'finished units shipment manifest acknowledged',
          },
        ];
        const data =
          `# Finished units shipment\n\n` +
          `Vendor: ${DEVICE_ASSEMBLY_PROVIDER_TAG}\n` +
          `Shipment: 15 finished LAUR units, individually packaged\n` +
          `Ship to: ${receiverTag}\n` +
          `Total: $0.00 (shipping covered by the build labor fee)\n\n` +
          `Units leave the line once the build completes and route ` +
          `directly into the fulfillment operator's intake queue.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: DEVICE_ASSEMBLY_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — finished units shipment',
            summary:
              `Finished units shipped from ${DEVICE_ASSEMBLY_PROVIDER_TAG} ` +
              `to ${receiverTag}, no charge (covered by build labor fee).`,
          },
          interactions,
        });
      },
    },
    {
      assemble: {
        description:
          'Round 1: produce a build plan and assembly schedule from ' +
          'a BOM and PCB layout.',
        args: {
          spec: {
            type: 'string',
            description:
              'Assembly brief in plain English (BOM summary or ' +
              'handle, PCB layout handle, batch size, any special ' +
              'tolerances).',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping a markdown build plan.',
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
      build: {
        description:
          "Round 2: the inventor's authorization to proceed with " +
          'manufacturing. The wallet charge for this call is the ' +
          'batch labor total quoted in the build plan. Invoke after ' +
          'the inventor approves the plan; suppliers (parts, PCBs) ' +
          'subsequently ship to the receive-shipment URL the assembler ' +
          'issued at `assemble`.',
        args: {
          approval: {
            type: 'object',
            description:
              'Approval object. Currently unused (the stub treats any ' +
              'invocation as approval); kept as an explicit argument so ' +
              "the agent has somewhere to surface the inventor's " +
              'authorization payload when a real provider needs it.',
            properties: {},
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping a markdown build receipt.',
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
      shipFinishedUnits: {
        description:
          'Ship the finished units into a fulfillment operator (or ' +
          "other shipping destination) via the operator's receive-" +
          'shipment ocap URL. No wallet charge — shipping is bundled ' +
          'with the build labor fee. Invoke after `build` has been ' +
          'committed and the fulfillment operator has been engaged ' +
          '(e.g. pacific-fulfillment.arrange) so the ' +
          '`receiveShipmentUrl` field from that engagement is in hand.',
        args: {
          approval: {
            type: 'object',
            description:
              "Approval object carrying the fulfillment operator's " +
              'receive-shipment ocap URL.',
            properties: {
              shipToUrl: {
                type: 'string',
                description:
                  "Required. Ocap URL of the fulfillment operator's " +
                  'receive-shipment endpoint, as returned by ' +
                  "pacific-fulfillment.arrange's `receiveShipmentUrl` " +
                  'field. Without this the assembler has nowhere to ' +
                  'ship the finished units and the call fails.',
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

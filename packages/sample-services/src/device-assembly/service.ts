import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderBuildPlan } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Assemble" per plan §6 device-assembly capability discipline.
 */
export const DEVICE_ASSEMBLY_SERVICE_DESCRIPTION =
  'Assemble an electronic device from a PCB, an enclosure, and ' +
  'electronic components. Two-step delivery: `assemble` returns a ' +
  'markdown build plan covering work cells, test sequence, QA gates, ' +
  'and per-unit assembly cost (~$1,800 setup fee); on customer ' +
  'approval, `build` executes the run and returns a build receipt, ' +
  'charging the per-unit labor for the agreed batch. Setup fee ' +
  'covers up to two revisions of the same plan on request.';

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
};

/**
 * Build the device-assembly service exo.
 *
 * @returns A discoverable exo with `assemble` and `build` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeDeviceAssemblyService() {
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
              'gates, schedule, and per-unit assembly cost.',
          },
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
          `inventor's address of record.\n`;
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
          'Round 2: place the actual build order against the round-1 ' +
          'plan. The wallet charge for this call is the batch labor ' +
          `total ($${DEVICE_ASSEMBLY_BUILD_PRICE_USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
          'for the canonical 15-unit profile); the agent should invoke ' +
          'this only after the inventor approves the build plan and ' +
          'parts plus PCBs are queued for delivery to the manufacturer.',
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
    },
  );
}

import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderBuildPlan } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Assemble" per plan §6 device-assembly capability discipline.
 */
export const DEVICE_ASSEMBLY_SERVICE_DESCRIPTION =
  'Assemble an electronic device from a PCB, an enclosure, and ' +
  'electronic components. Takes a BOM and PCB layout and returns a ' +
  'build plan covering work cells, test sequence, QA gates, and ' +
  'per-unit assembly cost. Price covers up to two revisions of the ' +
  'same plan on request.';

export const DEVICE_ASSEMBLY_PROVIDER_TAG = 'assembly-coop';

/**
 * Advisory per-invocation price (USD). Plan §6 device-assembly is
 * per-unit ($5–18); this stub charges a one-time $1,800 setup fee
 * for the build plan and the prototype run.
 */
export const DEVICE_ASSEMBLY_PRICE_USD = 1_800;

export type DeviceAssemblyArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the device-assembly service exo.
 *
 * @returns A discoverable exo with an `assemble` method.
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
    },
    {
      assemble: {
        description:
          'Produce a build plan and assembly schedule from a BOM and ' +
          'PCB layout.',
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
    },
  );
}

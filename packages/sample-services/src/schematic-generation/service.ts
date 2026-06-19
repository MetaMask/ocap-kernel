import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderSchematic } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Generate", domain nouns (schematic, circuit, BOM, components)
 * per plan §6.
 */
export const SCHEMATIC_GENERATION_SERVICE_DESCRIPTION =
  'Generate a circuit schematic from a functional specification. ' +
  'Takes a functional spec (text) and returns a schematic diagram ' +
  'covering the microcontroller, peripherals, signal routing, power ' +
  'tree, and other components required by the spec. Price covers up ' +
  'to two revisions of the same schematic on request.';

export const SCHEMATIC_GENERATION_PROVIDER_TAG = 'circuit-masters';

/**
 * Advisory per-invocation price (USD). Plan §6 schematic-generation
 * band is 800 – 2,400; circuit-masters is the budget option at $800.
 */
export const SCHEMATIC_GENERATION_PRICE_USD = 800;

/**
 * Shape returned by `generate`.
 */
export type SchematicArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the schematic-generation service exo.
 *
 * @returns A discoverable exo with a `generate` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeSchematicGenerationService() {
  return makeDiscoverableExo(
    'SchematicGenerationService',
    {
      async generate(_spec: string): Promise<SchematicArtifact> {
        const svg = renderSchematic({
          providerLabel: SCHEMATIC_GENERATION_PROVIDER_TAG,
        });
        return harden({
          kind: 'svg',
          data: svg,
          fromService: SCHEMATIC_GENERATION_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — circuit schematic',
            summary:
              'Top-level schematic: MCU + OLED + MEMS mic + IR driver + ' +
              '10-key matrix + power. KiCad-style with title block.',
          },
        });
      },
    },
    {
      generate: {
        description: 'Produce a circuit schematic from a functional spec.',
        args: {
          spec: {
            type: 'string',
            description:
              'Functional spec for the product, in plain English ' +
              '(features, key MCU requirements, peripherals).',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping an inline SVG schematic.',
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
    },
  );
}

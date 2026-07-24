import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderSchematic } from './template.ts';
import {
  assertPayment,
  makeReviser,
  PAYMENT_ARG_SCHEMA,
  REVISE_METHOD_SCHEMA,
  USD_TO_CENTS,
} from '../vat-lib/index.ts';
import type { Money, Reviser } from '../vat-lib/index.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Generate", domain nouns (schematic, circuit, BOM, components)
 * per plan §6.
 */
export const SCHEMATIC_GENERATION_SERVICE_DESCRIPTION =
  'Generate a circuit schematic from a functional specification. ' +
  'Takes a functional spec (text) and returns a schematic diagram ' +
  'covering the microcontroller, peripherals, signal routing, power ' +
  'tree, and other components required by the spec (~$800 per ' +
  'schematic, covers up to two revisions).';

export const SCHEMATIC_GENERATION_PROVIDER_TAG = 'circuit-masters';

/**
 * Advisory per-invocation price (USD). Plan §6 schematic-generation
 * band is 800 – 2,400; circuit-masters is the budget option at $800.
 */
export const SCHEMATIC_GENERATION_PRICE_USD = 800;

/**
 * Number of free revisions each purchase grants the buyer via the
 * returned reviser reference.
 */
export const SCHEMATIC_GENERATION_REVISIONS_ALLOWED = 2;

/**
 * Shape returned by `generate`.
 */
export type SchematicArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Per-purchase reviser capability. Present only on the paid call's
   * return.
   */
  reviser?: Reviser<SchematicArtifact>;
};

/**
 * Build the schematic-generation service exo.
 *
 * @returns A discoverable exo with a `generate` method.
 */
export function makeSchematicGenerationService(): unknown {
  let purchaseCounter = 0;
  const revisers = new Set<unknown>();

  return makeDiscoverableExo(
    'SchematicGenerationService',
    {
      async generate(
        _spec: string,
        payment: Money,
      ): Promise<SchematicArtifact> {
        await assertPayment(
          payment,
          SCHEMATIC_GENERATION_PRICE_USD * USD_TO_CENTS,
          `${SCHEMATIC_GENERATION_PROVIDER_TAG}.generate`,
        );
        purchaseCounter += 1;
        const purchaseId = `sale-${purchaseCounter}`;

        const svg = renderSchematic({
          providerLabel: SCHEMATIC_GENERATION_PROVIDER_TAG,
        });

        const reviser = makeReviser<SchematicArtifact>({
          name: `${SCHEMATIC_GENERATION_PROVIDER_TAG}-${purchaseId}-reviser`,
          remaining: SCHEMATIC_GENERATION_REVISIONS_ALLOWED,
          onRevise: (revNumber, _feedback) => {
            const revSvg = renderSchematic({
              providerLabel: SCHEMATIC_GENERATION_PROVIDER_TAG,
            });
            return {
              kind: 'svg',
              data: revSvg,
              fromService: SCHEMATIC_GENERATION_PROVIDER_TAG,
              metadata: {
                title: `LAUR — circuit schematic rev ${revNumber}`,
                summary:
                  'Revised schematic incorporating the buyer feedback: ' +
                  'peripheral / power / signal-routing adjustments.',
              },
            };
          },
        });
        revisers.add(reviser);

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
          reviser,
        });
      },
    },
    {
      generate: {
        description:
          'Produce a circuit schematic from a functional spec, and mint ' +
          'a per-purchase reviser reference that grants up to ' +
          `${SCHEMATIC_GENERATION_REVISIONS_ALLOWED} free follow-up ` +
          'revisions.',
        args: {
          spec: {
            type: 'string',
            description:
              'Functional spec for the product, in plain English ' +
              '(features, key MCU requirements, peripherals).',
          },
          payment: PAYMENT_ARG_SCHEMA,
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping an inline SVG schematic, plus ' +
            'a `reviser` object reference for follow-up revisions.',
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
            reviser: {
              type: 'interface',
              description:
                'Reviser object minted for this purchase. Its ' +
                '`revise(feedback)` method produces the next revision ' +
                'at no additional charge, up to ' +
                `${SCHEMATIC_GENERATION_REVISIONS_ALLOWED} revisions per ` +
                'purchase.',
              methods: {
                revise: REVISE_METHOD_SCHEMA,
              },
            },
          },
          required: ['kind', 'data', 'fromService', 'reviser'],
        },
      },
    },
  );
}

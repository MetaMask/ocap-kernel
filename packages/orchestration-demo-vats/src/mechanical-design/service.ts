import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderMechanicalHero } from './template.ts';
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
 * verb "Model" per plan §6 mechanical-design capability discipline.
 */
export const MECHANICAL_DESIGN_SERVICE_DESCRIPTION =
  'Model a 3D part or enclosure suitable for injection molding. ' +
  'Takes a concept sketch and dimensions (text) and returns a 3D ' +
  'render of the part in a chosen colorway (~$2,100 per part, ' +
  'covers up to two revisions).';

export const MECHANICAL_DESIGN_PROVIDER_TAG = 'nantucket-mech';

/**
 * Advisory per-invocation price (USD). Plan §6 mechanical-design band
 * is 1,200 – 3,500; nantucket-mech is the mid option at $2,100.
 */
export const MECHANICAL_DESIGN_PRICE_USD = 2_100;

/**
 * Number of free revisions each purchase grants the buyer via the
 * returned reviser reference.
 */
export const MECHANICAL_DESIGN_REVISIONS_ALLOWED = 2;

/**
 * Shape returned by `model`.
 */
export type MechanicalHeroArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Per-purchase reviser capability. Present only on the paid call's
   * return; subsequent `revise` results do not include a further
   * reviser.
   */
  reviser?: Reviser<MechanicalHeroArtifact>;
};

/**
 * Build the mechanical-design service exo.
 *
 * @returns A discoverable exo with a `model` method.
 */
export function makeMechanicalDesignService(): unknown {
  let purchaseCounter = 0;
  const revisers = new Set<unknown>();

  return makeDiscoverableExo(
    'MechanicalDesignService',
    {
      async model(
        _spec: string,
        payment: Money,
      ): Promise<MechanicalHeroArtifact> {
        await assertPayment(
          payment,
          MECHANICAL_DESIGN_PRICE_USD * USD_TO_CENTS,
          `${MECHANICAL_DESIGN_PROVIDER_TAG}.model`,
        );
        purchaseCounter += 1;
        const purchaseId = `sale-${purchaseCounter}`;

        const svg = renderMechanicalHero({
          providerLabel: MECHANICAL_DESIGN_PROVIDER_TAG,
        });

        const reviser = makeReviser<MechanicalHeroArtifact>({
          name: `${MECHANICAL_DESIGN_PROVIDER_TAG}-${purchaseId}-reviser`,
          remaining: MECHANICAL_DESIGN_REVISIONS_ALLOWED,
          onRevise: (revNumber, _feedback) => {
            const revSvg = renderMechanicalHero({
              providerLabel: MECHANICAL_DESIGN_PROVIDER_TAG,
            });
            return {
              kind: 'svg',
              data: revSvg,
              fromService: MECHANICAL_DESIGN_PROVIDER_TAG,
              metadata: {
                title: `LAUR — mechanical case render rev ${revNumber}`,
                summary:
                  'Revised 3D enclosure render incorporating the buyer ' +
                  'feedback: wall-thickness / material / colorway ' +
                  'adjustments applied.',
              },
            };
          },
        });
        revisers.add(reviser);

        return harden({
          kind: 'svg',
          data: svg,
          fromService: MECHANICAL_DESIGN_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — mechanical case render',
            summary:
              'Stylized 3D hero shot of the LAUR enclosure. Material, ' +
              'wall thickness, mass, drop-test rating, IP rating, and ' +
              'mic-port spec annotated.',
          },
          reviser,
        });
      },
    },
    {
      model: {
        description:
          'Produce a 3D enclosure render from a concept sketch and ' +
          'dimensions, and mint a per-purchase reviser reference that ' +
          `grants up to ${MECHANICAL_DESIGN_REVISIONS_ALLOWED} free ` +
          'follow-up revisions.',
        args: {
          spec: {
            type: 'string',
            description:
              'Combined design brief in plain English: concept-sketch ' +
              'handle, target dimensions, material notes, and any other ' +
              'input in one string. Not multiple positional args.',
          },
          payment: PAYMENT_ARG_SCHEMA,
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping an inline SVG hero render, plus ' +
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
                `${MECHANICAL_DESIGN_REVISIONS_ALLOWED} revisions per ` +
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

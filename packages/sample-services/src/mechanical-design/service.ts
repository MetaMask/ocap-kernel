import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderMechanicalHero } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Model" per plan §6 mechanical-design capability discipline.
 */
export const MECHANICAL_DESIGN_SERVICE_DESCRIPTION =
  'Model a 3D enclosure for a consumer-electronics product. Takes a ' +
  'concept sketch and dimensions (text) and returns a 3D render of ' +
  "the product's case in a chosen colorway. Price covers up to two " +
  'revisions of the same enclosure on request.';

export const MECHANICAL_DESIGN_PROVIDER_TAG = 'nantucket-mech';

/**
 * Advisory per-invocation price (USD). Plan §6 mechanical-design band
 * is 1,200 – 3,500; nantucket-mech is the mid option at $2,100.
 */
export const MECHANICAL_DESIGN_PRICE_USD = 2_100;

/**
 * Shape returned by `model`.
 */
export type MechanicalHeroArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the mechanical-design service exo.
 *
 * @returns A discoverable exo with a `model` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeMechanicalDesignService() {
  return makeDiscoverableExo(
    'MechanicalDesignService',
    {
      async model(_spec: string): Promise<MechanicalHeroArtifact> {
        const svg = renderMechanicalHero({
          providerLabel: MECHANICAL_DESIGN_PROVIDER_TAG,
        });
        return harden({
          kind: 'svg',
          data: svg,
          fromService: MECHANICAL_DESIGN_PROVIDER_TAG,
          metadata: {
            title: 'LSUR — mechanical case render',
            summary:
              'Stylized 3D hero shot of the LSUR enclosure. Material, ' +
              'wall thickness, mass, drop-test rating, IP rating, and ' +
              'mic-port spec annotated.',
          },
        });
      },
    },
    {
      model: {
        description:
          'Produce a 3D enclosure render from a concept sketch and dimensions.',
        args: {
          spec: {
            type: 'string',
            description:
              'Concept sketch handle + dimensions, in plain English.',
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping an inline SVG hero render.',
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

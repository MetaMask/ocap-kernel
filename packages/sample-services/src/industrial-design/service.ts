import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

/**
 * Natural-language description registered with the matcher.
 *
 * Follows the capability-description discipline from the orchestration
 * demo plan section 6: opening verb ("Sketch"), domain nouns ("concept",
 * "industrial design", "sketch", "form factor"), input/output sentence,
 * capped at ~50 words.
 */
export const INDUSTRIAL_DESIGN_SERVICE_DESCRIPTION =
  'Sketch an industrial design concept for a consumer-electronics product. ' +
  'Takes a functional spec (text) and returns a line-drawing concept sketch ' +
  'showing the overall form factor, button layout, and labelled features.';

/**
 * Provider tag used to dedup registrations under (peerId, providerTag).
 * The stub tag is distinct from the future per-provider tags that will
 * appear when alternative industrial-design providers are added.
 */
export const INDUSTRIAL_DESIGN_PROVIDER_TAG = 'industrial-design-stub';

/**
 * Advisory per-invocation price. Placeholder near the bottom of the
 * design-phase band (plan section 6 gives the industrial-design band as
 * 800 — 2,400 USD).
 */
export const INDUSTRIAL_DESIGN_PRICE_USD = 1_200;

/**
 * Shape returned by `generate`. Stays loose at this stage: a single
 * artifact descriptor with a `kind` discriminator and a string `data`
 * payload. The shape will tighten once demo-display lands the artifact
 * panel and we know exactly what it expects.
 */
export type IndustrialDesignArtifact = {
  kind: 'json' | 'svg';
  data: string;
  fromService: string;
  metadata?: {
    title?: string;
    summary?: string;
  };
};

/**
 * Build the stub industrial-design service exo.
 *
 * V0 placeholder: `generate(spec)` returns a JSON artifact echoing the
 * spec so demo-display has something concrete to render. The real SVG
 * template lands in a later commit (plan section 7.1).
 *
 * @returns A discoverable exo with a `generate` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeIndustrialDesignService() {
  return makeDiscoverableExo(
    'IndustrialDesignService',
    {
      async generate(spec: string): Promise<IndustrialDesignArtifact> {
        return harden({
          kind: 'json',
          data: JSON.stringify({
            placeholder: true,
            spec,
            providerTag: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          }),
          fromService: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          metadata: {
            title: 'Industrial design concept (placeholder)',
            summary:
              'Stub artifact — real SVG concept sketch lands in a later commit.',
          },
        });
      },
    },
    {
      generate: {
        description:
          'Produce an industrial design concept sketch from a functional spec.',
        args: {
          spec: {
            type: 'string',
            description:
              'Functional spec for the product, in plain English ' +
              '(features, form factor hints, brand notes).',
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor. V0 returns a JSON placeholder; later ' +
            'commits return an SVG line drawing.',
          properties: {
            kind: {
              type: 'string',
              description: "Artifact kind: 'json' or 'svg'.",
            },
            data: {
              type: 'string',
              description:
                'JSON-encoded payload (V0) or SVG source (later commits).',
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

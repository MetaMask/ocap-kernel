import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderConceptSketch } from './template.ts';

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
  'Takes a functional spec (text) and returns a line-drawing concept showing ' +
  'form factor, control layout, and labelled features. Price covers up to ' +
  'three revisions of the same concept on request.';

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
 * Build the industrial-design service exo.
 *
 * `generate(spec)` renders the LSUR concept-sketch SVG with a few
 * tokens substituted per-call (revision label, OLED clock, battery
 * life, IR protocol set), so each invocation produces a recognizably
 * different artifact without the demo feeling like canned playback.
 * The `spec` argument is currently advisory: the agent passes the
 * functional spec text it built for the inventor, but V0 doesn't
 * incorporate it into the rendered output. A later iteration can
 * use it to drive richer per-call variation.
 *
 * @returns A discoverable exo with a `generate` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeIndustrialDesignService() {
  // Counter for coherent revision numbering. Each generate() call
  // emits A1, A2, A3, … rather than randomly picking a letter+digit
  // — the audience reads consecutive sketches as a progressing
  // iteration, not unrelated revisions.
  let revCounter = 0;
  return makeDiscoverableExo(
    'IndustrialDesignService',
    {
      async generate(_spec: string): Promise<IndustrialDesignArtifact> {
        revCounter += 1;
        const svg = renderConceptSketch({
          providerLabel: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          revLabel: `A${revCounter}`,
        });
        return harden({
          kind: 'svg',
          data: svg,
          fromService: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          metadata: {
            title: 'LSUR — concept sketch',
            summary:
              'Hand-drawn industrial-design pass: voice centerpiece, ' +
              'isolated power/mute, vol/channel rockers, transport row, ' +
              'OLED status, IR transmitter, MEMS mic.',
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
            'Artifact descriptor wrapping an inline SVG line drawing of ' +
            'the proposed industrial-design pass.',
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

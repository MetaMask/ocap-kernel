import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderConceptSketch } from './template.ts';
import {
  assertPayment,
  makeReviser,
  PAYMENT_ARG_SCHEMA,
  USD_TO_CENTS,
} from '../vat-lib/index.ts';
import type { Money, Reviser } from '../vat-lib/index.ts';

/**
 * Natural-language description registered with the matcher.
 *
 * Follows the capability-description discipline from the orchestration
 * demo plan section 6: opening verb ("Sketch"), domain nouns ("concept",
 * "industrial design", "sketch", "form factor"), input/output sentence,
 * capped at ~50 words.
 */
export const INDUSTRIAL_DESIGN_SERVICE_DESCRIPTION =
  'Sketch an industrial design concept for a new product entering ' +
  'manufacture. Takes a functional spec (text) and returns two things: ' +
  'a line-drawing concept showing form factor, control layout, and ' +
  'labelled features (~$1,200 per concept), plus a `reviser` object ' +
  'reference the buyer holds directly and calls `revise(feedback)` on ' +
  'for up to two follow-up revisions at no additional charge.';

/**
 * Provider tag used to dedup registrations under (peerId, providerTag).
 * The stub tag is distinct from the future per-provider tags that will
 * appear when alternative industrial-design providers are added.
 */
export const INDUSTRIAL_DESIGN_PROVIDER_TAG =
  'sunnyvale-industrial-design-services';

/**
 * Advisory per-invocation price. Placeholder near the bottom of the
 * design-phase band (plan section 6 gives the industrial-design band as
 * 800 — 2,400 USD).
 */
export const INDUSTRIAL_DESIGN_PRICE_USD = 1_200;

/**
 * Number of free revisions each purchase grants the buyer via the
 * returned reviser reference. Two revisions after the initial paid
 * draft → three total artifacts per concept.
 */
export const INDUSTRIAL_DESIGN_REVISIONS_ALLOWED = 2;

/**
 * Shape returned by `generate`. Includes both the initial concept
 * sketch and the reviser capability that grants free follow-up
 * revisions.
 */
export type IndustrialDesignArtifact = {
  kind: 'json' | 'svg';
  data: string;
  fromService: string;
  metadata?: {
    title?: string;
    summary?: string;
  };
  /**
   * Per-purchase reviser capability. Returned as a live remotable
   * reference; the buyer holds it directly and calls
   * `revise(feedback)` on it (no payment argument) to receive the
   * next revision. Budget is `INDUSTRIAL_DESIGN_REVISIONS_ALLOWED`
   * free revisions; the reviser throws once exhausted.
   */
  reviser?: Reviser<IndustrialDesignArtifact>;
};

/**
 * Build the industrial-design service exo.
 *
 * `generate(spec, payment)` renders the initial concept sketch and
 * mints a per-purchase reviser capability. The reviser holds its own
 * revision counter closed over in module scope; each `revise(feedback)`
 * call returns a new artifact (rev2, rev3, ...) at no additional
 * charge. The `spec` argument is currently advisory: the agent passes
 * the functional spec text it built for the inventor, but V0 doesn't
 * incorporate it into the rendered output. A later iteration can use
 * it to drive richer per-call variation.
 *
 * @returns A discoverable exo with a `generate` method.
 */
export function makeIndustrialDesignService(): unknown {
  // Sequentially assigned purchase id, used to make each reviser exo's
  // name unique and to give the audience-facing dashboard a coherent
  // "which purchase is this" tag.
  let purchaseCounter = 0;

  // Strong references to every reviser we've minted, so the kernel
  // doesn't collect them between issuance and the buyer's first
  // `revise` call. The wallet-vat OBJECT_DELETED bug (see
  // `packages/orchestration-demo-vats/src/wallet/index.ts`) taught us
  // that returning a remotable to the caller does not by itself keep
  // it alive across the async gap.
  const revisers = new Set<unknown>();

  return makeDiscoverableExo(
    'IndustrialDesignService',
    {
      async generate(
        _spec: string,
        payment: Money,
      ): Promise<IndustrialDesignArtifact> {
        await assertPayment(
          payment,
          INDUSTRIAL_DESIGN_PRICE_USD * USD_TO_CENTS,
          `${INDUSTRIAL_DESIGN_PROVIDER_TAG}.generate`,
        );
        purchaseCounter += 1;
        const purchaseId = `sale-${purchaseCounter}`;

        const initialSvg = renderConceptSketch({
          providerLabel: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          revLabel: 'A1',
          variant: 'rev1',
        });

        // Mint a fresh reviser exo for this purchase. Each `revise`
        // call renders the rev2 variant with an incremented label so
        // subsequent revisions read as A2, A3, … in the dashboard.
        const reviser = makeReviser<IndustrialDesignArtifact>({
          name: `${INDUSTRIAL_DESIGN_PROVIDER_TAG}-${purchaseId}-reviser`,
          remaining: INDUSTRIAL_DESIGN_REVISIONS_ALLOWED,
          onRevise: (revNumber, _feedback) => {
            const revSvg = renderConceptSketch({
              providerLabel: INDUSTRIAL_DESIGN_PROVIDER_TAG,
              revLabel: `A${revNumber}`,
              variant: 'rev2',
            });
            return {
              kind: 'svg',
              data: revSvg,
              fromService: INDUSTRIAL_DESIGN_PROVIDER_TAG,
              metadata: {
                title: `LAUR — concept sketch rev A${revNumber}`,
                summary:
                  'Revised industrial-design pass incorporating the ' +
                  'buyer feedback: d-pad replacing channel rocker, IR ' +
                  'moved to top edge, back-6s/fwd-30s transport, more ' +
                  'curved body.',
              },
            };
          },
        });
        revisers.add(reviser);

        return harden({
          kind: 'svg',
          data: initialSvg,
          fromService: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — concept sketch',
            summary:
              'Hand-drawn industrial-design pass: voice centerpiece, ' +
              'isolated power/mute, vol/channel rockers, transport row, ' +
              'OLED status, IR transmitter, MEMS mic.',
          },
          reviser,
        });
      },
    },
    {
      generate: {
        description:
          'Produce an industrial design concept sketch from a functional ' +
          'spec, and mint a per-purchase reviser reference that grants ' +
          `up to ${INDUSTRIAL_DESIGN_REVISIONS_ALLOWED} follow-up ` +
          'revisions at no additional charge. The reviser is returned ' +
          'inline as `reviser` on the artifact — an object reference ' +
          'the buyer calls `revise(feedback)` on directly.',
        args: {
          spec: {
            type: 'string',
            description:
              'Functional spec for the product, in plain English ' +
              '(features, form factor hints, brand notes).',
          },
          payment: PAYMENT_ARG_SCHEMA,
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping an inline SVG line drawing of ' +
            'the proposed industrial-design pass, plus a `reviser` ' +
            'object reference for follow-up revisions.',
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
              type: 'string',
              description:
                'Reviser capability minted for this purchase. A live ' +
                'object reference the buyer holds; the discovery ' +
                'plugin auto-registers it as a service and surfaces ' +
                'its nickname here. Call `service_call` on the ' +
                'nickname with method `revise(feedback)` — no payment ' +
                `required, up to ${INDUSTRIAL_DESIGN_REVISIONS_ALLOWED} ` +
                'revisions per purchase.',
            },
          },
          required: ['kind', 'data', 'fromService', 'reviser'],
        },
      },
    },
  );
}

import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';
import type { ContactPoint } from '@metamask/service-discovery-types';

import { renderConceptSketch } from './template.ts';
import {
  assertPayment,
  issueRevisionCapability,
  PAYMENT_ARG_SCHEMA,
  USD_TO_CENTS,
} from '../vat-lib/index.ts';
import type { Money } from '../vat-lib/index.ts';

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
  'labelled features (~$1,200 per concept), plus a `reviseUrl` ocap ' +
  'the buyer redeems to request up to two follow-up revisions at no ' +
  'additional charge.';

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
 * returned reviser ocap. Two revisions after the initial paid draft →
 * three total artifacts per concept.
 */
export const INDUSTRIAL_DESIGN_REVISIONS_ALLOWED = 2;

/**
 * Shape returned by `generate`. Includes both the initial concept
 * sketch and the ocap URL for the reviser capability that grants free
 * follow-up revisions.
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
   * Ocap URL for a reviser capability minted specifically for this
   * purchase. Redeem via `service_initiate_contact` and call
   * `revise(feedback)` on the resulting handle. Budget is
   * `INDUSTRIAL_DESIGN_REVISIONS_ALLOWED` free revisions; the reviser
   * throws once exhausted.
   */
  reviseUrl?: string;
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
 * @param options - Construction options.
 * @param options.issueUrl - Closure the vat root passes down to let the
 *   service mint ocap URLs for reviser ContactPoints. Provided this way
 *   (rather than by handing the whole `ocapURLIssuerService` in) so
 *   the service source reads clearly and the URL machinery stays in
 *   the vat root where it's already wired.
 * @returns A discoverable exo with a `generate` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeIndustrialDesignService(options: {
  issueUrl: (endpoint: ContactPoint) => Promise<string>;
}) {
  const { issueUrl } = options;

  // Sequentially assigned purchase id, used to make each reviser exo's
  // name unique and to give the audience-facing dashboard a coherent
  // "which purchase is this" tag.
  let purchaseCounter = 0;

  // Strong references to every reviser we've minted, so the kernel
  // doesn't collect them between issuance and the buyer's first
  // `revise` call. The wallet-vat OBJECT_DELETED bug (see
  // `packages/orchestration-demo-vats/src/wallet/index.ts`) taught us
  // that ocap-URL issuance alone is not sufficient to keep an exo
  // alive.
  const revisionAnchors = new Set<unknown>();

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

        // Mint a fresh reviser exo for this purchase. `onRevise` runs
        // inside the reviser when the buyer calls `revise(feedback)`;
        // it renders the rev2 variant with an incremented label so
        // subsequent revisions read as A2, A3, … in the dashboard.
        const { reviseUrl, anchor } = await issueRevisionCapability({
          providerTag: INDUSTRIAL_DESIGN_PROVIDER_TAG,
          purchaseId,
          remaining: INDUSTRIAL_DESIGN_REVISIONS_ALLOWED,
          description:
            `Reviser for the industrial-design concept just delivered ` +
            `by ${INDUSTRIAL_DESIGN_PROVIDER_TAG} (${purchaseId}). ` +
            `${INDUSTRIAL_DESIGN_REVISIONS_ALLOWED} revisions ` +
            `remaining, no additional charge; the paid ` +
            `\`generate\` call already covered them. Redeem this URL ` +
            `via \`service_initiate_contact\` and call \`revise(feedback)\` ` +
            `to receive the next pass.`,
          onRevise: (revNumber, _feedback): IndustrialDesignArtifact => {
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
          issueUrl,
        });
        revisionAnchors.add(anchor);

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
          reviseUrl,
        });
      },
    },
    {
      generate: {
        description:
          'Produce an industrial design concept sketch from a functional ' +
          'spec, and mint a per-purchase reviser ocap that grants up to ' +
          `${INDUSTRIAL_DESIGN_REVISIONS_ALLOWED} follow-up revisions at ` +
          'no additional charge. The reviser URL is returned inline as ' +
          '`reviseUrl` on the artifact; redeem it via ' +
          '`service_initiate_contact` and call `revise(feedback)`.',
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
            'the proposed industrial-design pass, plus a `reviseUrl` ' +
            'ocap for follow-up revisions.',
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
            reviseUrl: {
              type: 'string',
              description:
                'Ocap URL for the reviser capability minted for this ' +
                'purchase. Redeem via `service_initiate_contact` and ' +
                'call `revise(feedback)` — no payment required, up to ' +
                `${INDUSTRIAL_DESIGN_REVISIONS_ALLOWED} revisions per ` +
                'purchase.',
            },
          },
          required: ['kind', 'data', 'fromService', 'reviseUrl'],
        },
      },
    },
  );
}

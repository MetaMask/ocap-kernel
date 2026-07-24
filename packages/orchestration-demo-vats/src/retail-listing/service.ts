import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderListing } from './template.ts';
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
 * verb "List" per plan §6 retail-listing capability discipline.
 */
export const RETAIL_LISTING_SERVICE_DESCRIPTION =
  'List a physical product for online retail sale. Takes a product ' +
  'brief and returns a marketplace listing draft including title, ' +
  'marketing copy, pricing tier, shipping options, returns policy, ' +
  'and storefront image requirements (~$200 per listing, covers up ' +
  'to two revisions).';

export const RETAIL_LISTING_PROVIDER_TAG = 'marketplace-direct';

/**
 * Advisory per-invocation price (USD). Plan §6 retail-listing is
 * a nominal $200 setup; we use that here.
 */
export const RETAIL_LISTING_PRICE_USD = 200;

/**
 * Number of free revisions each purchase grants the buyer via the
 * returned reviser reference.
 */
export const RETAIL_LISTING_REVISIONS_ALLOWED = 2;

export type RetailListingArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Per-purchase reviser capability. Present only on the paid call's
   * return.
   */
  reviser?: Reviser<RetailListingArtifact>;
};

/**
 * Build the retail-listing service exo.
 *
 * @returns A discoverable exo with a `list` method.
 */
export function makeRetailListingService(): unknown {
  let purchaseCounter = 0;
  const revisers = new Set<unknown>();

  return makeDiscoverableExo(
    'RetailListingService',
    {
      async list(
        _spec: string,
        payment: Money,
      ): Promise<RetailListingArtifact> {
        await assertPayment(
          payment,
          RETAIL_LISTING_PRICE_USD * USD_TO_CENTS,
          `${RETAIL_LISTING_PROVIDER_TAG}.list`,
        );
        purchaseCounter += 1;
        const purchaseId = `sale-${purchaseCounter}`;

        const markdown = renderListing({
          providerLabel: RETAIL_LISTING_PROVIDER_TAG,
        });

        const reviser = makeReviser<RetailListingArtifact>({
          name: `${RETAIL_LISTING_PROVIDER_TAG}-${purchaseId}-reviser`,
          remaining: RETAIL_LISTING_REVISIONS_ALLOWED,
          onRevise: (revNumber, _feedback) => {
            const revMarkdown = renderListing({
              providerLabel: RETAIL_LISTING_PROVIDER_TAG,
            });
            return {
              kind: 'markdown',
              data: revMarkdown,
              fromService: RETAIL_LISTING_PROVIDER_TAG,
              metadata: {
                title: `LAUR — retail listing rev ${revNumber}`,
                summary:
                  'Revised marketplace listing incorporating the buyer ' +
                  'feedback: copy / pricing / image spec adjustments.',
              },
            };
          },
        });
        revisers.add(reviser);

        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: RETAIL_LISTING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — retail listing',
            summary:
              'Marketplace listing draft: storefront copy, pricing, ' +
              'shipping, warranty, image requirements, marketplace fees.',
          },
          reviser,
        });
      },
    },
    {
      list: {
        description:
          'Produce a retail listing draft from a product brief, and mint ' +
          'a per-purchase reviser reference that grants up to ' +
          `${RETAIL_LISTING_REVISIONS_ALLOWED} free follow-up revisions.`,
        args: {
          spec: {
            type: 'string',
            description:
              'Product brief in plain English (target market, ' +
              'positioning, headline features, intended price band).',
          },
          payment: PAYMENT_ARG_SCHEMA,
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown retail listing, plus ' +
            'a `reviser` object reference for follow-up revisions.',
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
            reviser: {
              type: 'interface',
              description:
                'Reviser object minted for this purchase. Its ' +
                '`revise(feedback)` method produces the next revision ' +
                'at no additional charge, up to ' +
                `${RETAIL_LISTING_REVISIONS_ALLOWED} revisions per ` +
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

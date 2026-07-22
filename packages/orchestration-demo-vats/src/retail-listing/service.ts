import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderListing } from './template.ts';
import {
  assertPayment,
  PAYMENT_ARG_SCHEMA,
  USD_TO_CENTS,
} from '../vat-lib/index.ts';
import type { Money } from '../vat-lib/index.ts';

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

export type RetailListingArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the retail-listing service exo.
 *
 * @returns A discoverable exo with a `list` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeRetailListingService() {
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
        const markdown = renderListing({
          providerLabel: RETAIL_LISTING_PROVIDER_TAG,
        });
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
        });
      },
    },
    {
      list: {
        description: 'Produce a retail listing draft from a product brief.',
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
            'Artifact descriptor wrapping a markdown retail listing.',
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

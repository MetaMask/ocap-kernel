import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderFulfillmentPlan } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Arrange" per the producer/contractor capability discipline.
 */
export const LOGISTICS_SERVICE_DESCRIPTION =
  'Arrange warehousing and direct-to-buyer shipping for a physical ' +
  'product. Takes a product brief and returns a fulfillment plan ' +
  'covering warehouse of record, per-unit storage cost, pick-and-' +
  'pack labor, carrier rates by zone, returns handling, and the ' +
  'integration steps to wire the operation into a storefront. ' +
  'Handles both small trial-distribution runs (hand-curated list of ' +
  'beta users, no marketplace integration) and full storefront ' +
  'fulfillment; the brief tells the operator which mode to plan for. ' +
  'Price covers up to two revisions of the same plan on request.';

export const LOGISTICS_PROVIDER_TAG = 'pacific-fulfillment';

/**
 * Advisory per-invocation price (USD). Flat setup fee for producing
 * the fulfillment plan; the per-order operational costs the plan
 * cites are billed against actual order volume by the operator and
 * are not authorized here.
 */
export const LOGISTICS_PRICE_USD = 300;

export type LogisticsArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the logistics-fulfillment service exo.
 *
 * @returns A discoverable exo with an `arrange` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeLogisticsService() {
  return makeDiscoverableExo(
    'LogisticsService',
    {
      async arrange(spec: string): Promise<LogisticsArtifact> {
        // The agent's brief is plain English. We sniff for "trial" /
        // "beta" / "pilot" keywords to decide whether to render the
        // small-batch trial-distribution variant or the
        // full-storefront variant. Mis-classification just renders
        // the wrong-flavoured plan; nothing breaks.
        const lower = typeof spec === 'string' ? spec.toLowerCase() : '';
        const mode =
          lower.includes('trial') ||
          lower.includes('beta') ||
          lower.includes('pilot')
            ? 'trial'
            : 'production';
        const markdown = renderFulfillmentPlan({
          providerLabel: LOGISTICS_PROVIDER_TAG,
          mode,
        });
        const title =
          mode === 'trial'
            ? 'LAUR — trial distribution plan'
            : 'LAUR — fulfillment plan';
        const summary =
          mode === 'trial'
            ? 'Trial distribution plan: hand-pack a small batch, ' +
              'ship to a curated beta list, no marketplace integration.'
            : 'Fulfillment plan: warehouse of record, storage and ' +
              'pick-pack rates, carrier zones, returns handling, ' +
              'and storefront integration.';
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: LOGISTICS_PROVIDER_TAG,
          metadata: {
            title,
            summary,
          },
        });
      },
    },
    {
      arrange: {
        description:
          'Produce a fulfillment plan for warehousing and direct-to-' +
          'buyer shipping of a physical product.',
        args: {
          spec: {
            type: 'string',
            description:
              'Fulfillment brief, in plain English (product summary ' +
              'or handle, batch size, target markets, marketplace ' +
              'integration target).',
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown fulfillment plan.',
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

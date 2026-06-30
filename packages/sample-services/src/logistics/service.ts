import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderFulfillmentPlan } from './template.ts';
import { formatUsd } from '../vat-lib/index.ts';

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
 * Advisory per-invocation price (USD) for the smallest tier. The
 * actual setup fee returned in the plan now scales with the
 * volume tier the brief describes — see `template.ts`. This
 * constant is the prototype-tier baseline kept for back-compat
 * with anything that imports it.
 */
export const LOGISTICS_PRICE_USD = 300;

/**
 * Default batch size when the brief doesn't name one. 15 matches
 * the prototype trial-distribution engagement in Stage 2.
 */
const DEFAULT_BATCH_QUANTITY = 15;

export type LogisticsArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Ocap URL of pacific-fulfillment's receive-shipment endpoint.
   * Returned on `arrange` so the agent can thread it through to
   * assembly-coop.shipFinishedUnits: the assembler then ships the
   * finished units directly into the fulfillment operator via ocap.
   */
  receiveShipmentUrl?: string;
};

/**
 * Build the logistics-fulfillment service exo.
 *
 * @param options - Construction options.
 * @param options.getReceiveShipmentUrl - Closure returning the URL of
 *   pacific-fulfillment's receive-shipment endpoint. Set by the vat
 *   root after the URL is issued at bootstrap.
 * @returns A discoverable exo with an `arrange` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeLogisticsService(options: {
  getReceiveShipmentUrl: () => string;
}) {
  const { getReceiveShipmentUrl } = options;
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
        const mode: 'trial' | 'production' =
          lower.includes('trial') ||
          lower.includes('beta') ||
          lower.includes('pilot')
            ? 'trial'
            : 'production';
        const { markdown, profile, setupFeeUsd, trialBatchLaborUsd } =
          renderFulfillmentPlan({
            providerLabel: LOGISTICS_PROVIDER_TAG,
            mode,
            brief: typeof spec === 'string' ? spec : '',
            defaultQuantity: DEFAULT_BATCH_QUANTITY,
          });
        const title =
          mode === 'trial'
            ? 'LAUR — trial distribution plan'
            : 'LAUR — fulfillment plan';
        const summary =
          mode === 'trial'
            ? `Trial distribution plan at ${profile.tierLabel}: hand-pack a ` +
              `${profile.quantity.toLocaleString()}-unit batch, ship to a ` +
              `curated beta list, no marketplace integration. Setup fee ` +
              `${formatUsd(setupFeeUsd)} (charged on plan acceptance); ` +
              `hand-pack labor ${formatUsd(
                trialBatchLaborUsd ?? 0,
              )} billed at the build stage.`
            : `Fulfillment plan at ${profile.tierLabel}: sized for ` +
              `${profile.quantity.toLocaleString()} units across the initial ` +
              `inventory cycle, with warehouse of record, storage and ` +
              `pick-pack rates, carrier zones, returns handling, and ` +
              `storefront integration. Setup fee ${formatUsd(setupFeeUsd)} ` +
              `(charged on plan acceptance); ongoing operational costs ` +
              `billed against actual order traffic.`;
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: LOGISTICS_PROVIDER_TAG,
          metadata: {
            title,
            summary,
          },
          receiveShipmentUrl: getReceiveShipmentUrl(),
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

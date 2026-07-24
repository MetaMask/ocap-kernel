import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderFulfillmentPlan } from './template.ts';
import {
  assertPayment,
  formatUsd,
  makeReviser,
  PAYMENT_ARG_SCHEMA,
  REVISE_METHOD_SCHEMA,
  USD_TO_CENTS,
} from '../vat-lib/index.ts';
import type { Money, Reviser } from '../vat-lib/index.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Arrange" per the producer/contractor capability discipline.
 */
export const LOGISTICS_SERVICE_DESCRIPTION =
  'Arrange warehousing and direct-to-buyer shipping for a physical ' +
  'product. Takes a product brief and returns a fulfillment plan ' +
  'covering warehouse of record, per-unit storage cost, pick-and-' +
  'pack labor, carrier rates by zone, returns handling, and the ' +
  'integration steps to wire the operation into a storefront ' +
  '(~$300 planning fee for the prototype tier; larger tiers priced ' +
  'in the returned plan; covers up to two revisions). Handles both ' +
  'small trial-distribution runs (hand-curated list of beta users, ' +
  'no marketplace integration) and full storefront fulfillment; the ' +
  'brief tells the operator which mode to plan for.';

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
 * Number of free revisions each purchase grants the buyer via the
 * returned reviser reference.
 */
export const LOGISTICS_REVISIONS_ALLOWED = 2;

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
  /**
   * Per-purchase reviser capability. Present only on the paid call's
   * return.
   */
  reviser?: Reviser<LogisticsArtifact>;
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
export function makeLogisticsService(options: {
  getReceiveShipmentUrl: () => string;
}): unknown {
  const { getReceiveShipmentUrl } = options;
  let purchaseCounter = 0;
  const revisers = new Set<unknown>();

  /**
   * Classify a brief into trial / production mode by sniffing for
   * keywords. Reused by both the paid call and its revisions.
   *
   * @param spec - The brief text.
   * @returns The inferred mode.
   */
  function classifyMode(spec: string): 'trial' | 'production' {
    const lower = spec.toLowerCase();
    return lower.includes('trial') ||
      lower.includes('beta') ||
      lower.includes('pilot')
      ? 'trial'
      : 'production';
  }

  /**
   * Compose a summary line consistent with the mode / profile / fees
   * returned by the template. Reused by paid + revision paths.
   *
   * @param options0 - Composition inputs.
   * @param options0.mode - Trial or production.
   * @param options0.profile - Volume-tier profile.
   * @param options0.profile.tierLabel - Human-readable tier name.
   * @param options0.profile.quantity - Batch size for that tier.
   * @param options0.setupFeeUsd - Setup fee amount.
   * @param options0.trialBatchLaborUsd - Optional trial-batch labor.
   * @param options0.revNumber - Revision number, or undefined for the
   *   paid initial delivery.
   * @returns The composed summary text.
   */
  function makeSummary(options0: {
    mode: 'trial' | 'production';
    profile: { tierLabel: string; quantity: number };
    setupFeeUsd: number;
    trialBatchLaborUsd: number | undefined;
    revNumber?: number;
  }): string {
    const { mode, profile, setupFeeUsd, trialBatchLaborUsd, revNumber } =
      options0;
    const prefix = revNumber === undefined ? '' : `(rev ${revNumber}) `;
    return mode === 'trial'
      ? `${prefix}Trial distribution plan at ${profile.tierLabel}: hand-pack a ` +
          `${profile.quantity.toLocaleString()}-unit batch, ship to a ` +
          `curated beta list, no marketplace integration. Setup fee ` +
          `${formatUsd(setupFeeUsd)} (charged on plan acceptance); ` +
          `hand-pack labor ${formatUsd(
            trialBatchLaborUsd ?? 0,
          )} billed at the build stage.`
      : `${prefix}Fulfillment plan at ${profile.tierLabel}: sized for ` +
          `${profile.quantity.toLocaleString()} units across the initial ` +
          `inventory cycle, with warehouse of record, storage and ` +
          `pick-pack rates, carrier zones, returns handling, and ` +
          `storefront integration. Setup fee ${formatUsd(setupFeeUsd)} ` +
          `(charged on plan acceptance); ongoing operational costs ` +
          `billed against actual order traffic.`;
  }

  return makeDiscoverableExo(
    'LogisticsService',
    {
      async arrange(spec: string, payment: Money): Promise<LogisticsArtifact> {
        // `arrange` has no separate quote step, so it charges the
        // advertised flat setup fee (LOGISTICS_PRICE_USD). This
        // matches the trial-mode setup-fee schedule exactly; for
        // production mode the returned plan may quote a higher
        // tier-scaled setup fee that a hypothetical future `commit`
        // step would collect. For the current demo — which always
        // exercises trial mode — the two numbers coincide.
        await assertPayment(
          payment,
          LOGISTICS_PRICE_USD * USD_TO_CENTS,
          `${LOGISTICS_PROVIDER_TAG}.arrange`,
        );
        purchaseCounter += 1;
        const purchaseId = `sale-${purchaseCounter}`;

        const brief = typeof spec === 'string' ? spec : '';
        const mode = classifyMode(brief);
        const { markdown, profile, setupFeeUsd, trialBatchLaborUsd } =
          renderFulfillmentPlan({
            providerLabel: LOGISTICS_PROVIDER_TAG,
            mode,
            brief,
            defaultQuantity: DEFAULT_BATCH_QUANTITY,
          });
        const title =
          mode === 'trial'
            ? 'LAUR — trial distribution plan'
            : 'LAUR — fulfillment plan';
        const summary = makeSummary({
          mode,
          profile,
          setupFeeUsd,
          trialBatchLaborUsd,
        });

        // Reviser closes over the original brief and mode so revisions
        // stay coherent with the paid engagement rather than re-
        // classifying from an unrelated feedback string.
        const reviser = makeReviser<LogisticsArtifact>({
          name: `${LOGISTICS_PROVIDER_TAG}-${purchaseId}-reviser`,
          remaining: LOGISTICS_REVISIONS_ALLOWED,
          onRevise: (revNumber, _feedback) => {
            const rendered = renderFulfillmentPlan({
              providerLabel: LOGISTICS_PROVIDER_TAG,
              mode,
              brief,
              defaultQuantity: DEFAULT_BATCH_QUANTITY,
            });
            return {
              kind: 'markdown',
              data: rendered.markdown,
              fromService: LOGISTICS_PROVIDER_TAG,
              metadata: {
                title: `${title} rev ${revNumber}`,
                summary: makeSummary({
                  mode,
                  profile: rendered.profile,
                  setupFeeUsd: rendered.setupFeeUsd,
                  trialBatchLaborUsd: rendered.trialBatchLaborUsd,
                  revNumber,
                }),
              },
            };
          },
        });
        revisers.add(reviser);

        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: LOGISTICS_PROVIDER_TAG,
          metadata: {
            title,
            summary,
          },
          receiveShipmentUrl: getReceiveShipmentUrl(),
          reviser,
        });
      },
    },
    {
      arrange: {
        description:
          'Produce a fulfillment plan for warehousing and direct-to-' +
          'buyer shipping of a physical product, and mint a per-' +
          'purchase reviser reference that grants up to ' +
          `${LOGISTICS_REVISIONS_ALLOWED} free follow-up revisions.`,
        args: {
          spec: {
            type: 'string',
            description:
              'Fulfillment brief, in plain English (product summary ' +
              'or handle, batch size, target markets, marketplace ' +
              'integration target).',
          },
          payment: PAYMENT_ARG_SCHEMA,
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown fulfillment plan, ' +
            'plus a `reviser` object reference for follow-up revisions.',
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
                `${LOGISTICS_REVISIONS_ALLOWED} revisions per purchase.`,
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

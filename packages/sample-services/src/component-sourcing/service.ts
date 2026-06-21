import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderBom } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Source" per plan §6 component-sourcing capability discipline.
 */
export const COMPONENT_SOURCING_SERVICE_DESCRIPTION =
  'Source components and execute purchase orders for an electronic ' +
  'product. Two-step delivery: `source` returns a priced bill of ' +
  'materials markdown with part numbers, distributors, lead times, ' +
  'and unit prices (~$400 sourcing fee); on customer approval, ' +
  '`purchase` places the actual parts order with the cited ' +
  'distributors and returns a purchase confirmation, charging the ' +
  'quoted batch total. Sourcing fee covers up to two BOM revisions.';

export const COMPONENT_SOURCING_PROVIDER_TAG = 'shenzhen-direct';

/**
 * Advisory per-method prices (USD). `source` is a flat sourcing fee
 * for producing the BOM. `purchase` is the batch parts cost itself,
 * pinned to the canonical 15-unit profile so the agent's wallet
 * charge after the inventor approves the BOM matches what the
 * audience saw in the document.
 */
export const COMPONENT_SOURCING_PRICE_USD = 400;
export const COMPONENT_SOURCING_PURCHASE_PRICE_USD = 961.5;

export type ComponentSourcingArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the component-sourcing service exo.
 *
 * @returns A discoverable exo with a `source` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeComponentSourcingService() {
  return makeDiscoverableExo(
    'ComponentSourcingService',
    {
      async source(_spec: string): Promise<ComponentSourcingArtifact> {
        const markdown = renderBom({
          providerLabel: COMPONENT_SOURCING_PROVIDER_TAG,
        });
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: COMPONENT_SOURCING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — bill of materials',
            summary:
              'Priced BOM for a prototype batch: components, ' +
              'distributors, lead times, and per-unit totals.',
          },
        });
      },
      async purchase(_approval: unknown): Promise<ComponentSourcingArtifact> {
        const total = COMPONENT_SOURCING_PURCHASE_PRICE_USD;
        const totalLabel = `$${total.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
        const data =
          `# Parts purchase confirmation\n\n` +
          `Vendor: ${COMPONENT_SOURCING_PROVIDER_TAG}\n` +
          `Order: components for a 15-unit prototype batch\n` +
          `Total: ${totalLabel}\n` +
          `Estimated lead time: 14 days\n` +
          `Ship to: manufacturer of record (assembly-coop unless ` +
          `otherwise noted)\n\n` +
          `Order accepted. The distributor will consolidate parts ` +
          `and ship to the manufacturer on the lead-time schedule. ` +
          `PCB fabrication is a separate engagement with the ` +
          `inventor's PCB house.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: COMPONENT_SOURCING_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — parts purchase confirmation',
            summary:
              `Parts order placed with ${COMPONENT_SOURCING_PROVIDER_TAG}: ` +
              `${totalLabel} for the 15-unit batch, 14-day lead time.`,
          },
        });
      },
    },
    {
      source: {
        description:
          'Round 1: produce a priced bill of materials from a ' +
          'schematic and a target batch size.',
        args: {
          spec: {
            type: 'string',
            description:
              'Sourcing brief, in plain English (schematic summary ' +
              'or handle, batch size, distributor preferences).',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping a markdown BOM document.',
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
      purchase: {
        description:
          'Round 2: place the actual parts purchase order with the ' +
          'distributors cited in the round-1 BOM. The wallet charge ' +
          `for this call is the batch total ($${COMPONENT_SOURCING_PURCHASE_PRICE_USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
          'for the canonical 15-unit profile); the agent should ' +
          'invoke this only after the inventor approves the BOM.',
        args: {
          approval: {
            type: 'object',
            description:
              'Approval object. Currently unused (the stub treats any ' +
              'invocation as approval); kept as an explicit argument so ' +
              "the agent has somewhere to surface the inventor's " +
              'authorization payload when a real provider needs it.',
            properties: {},
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown purchase receipt.',
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

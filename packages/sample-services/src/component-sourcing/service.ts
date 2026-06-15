import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderBom } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Source" per plan §6 component-sourcing capability discipline.
 */
export const COMPONENT_SOURCING_SERVICE_DESCRIPTION =
  'Source components and produce a priced bill of materials for a ' +
  'consumer-electronics product. Takes a schematic (or schematic ' +
  'handle) and returns a BOM markdown table with part numbers, ' +
  'distributors, lead times, and unit prices for a prototype batch. ' +
  'Price covers up to two revisions of the same BOM on request.';

export const COMPONENT_SOURCING_PROVIDER_TAG = 'shenzhen-direct';

/**
 * Advisory per-invocation price (USD). Plan §6 component-sourcing
 * has no fixed band (varies by BOM size); $400 is a placeholder
 * sourcing fee for a prototype-scale run.
 */
export const COMPONENT_SOURCING_PRICE_USD = 400;

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
    },
    {
      source: {
        description:
          'Produce a priced bill of materials from a schematic and ' +
          'a target batch size.',
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
    },
  );
}

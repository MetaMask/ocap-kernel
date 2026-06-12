import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderPcbLayout } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Lay out" per plan §6 pcb-layout capability discipline.
 */
export const PCB_LAYOUT_SERVICE_DESCRIPTION =
  'Lay out a printed circuit board for a consumer-electronics product. ' +
  'Takes a schematic and case dimensions (text) and returns a top-view ' +
  'PCB image with components placed, copper traces, and silkscreen ' +
  'labels. Price covers up to two revisions of the same layout on request.';

export const PCB_LAYOUT_PROVIDER_TAG = 'pcb-foundry-compact';

/**
 * Advisory per-invocation price (USD). Plan §6 pcb-layout band is
 * 600 – 1,800; pcb-foundry-compact is the budget option at $600.
 */
export const PCB_LAYOUT_PRICE_USD = 600;

/**
 * Shape returned by `layout`.
 */
export type PcbLayoutArtifact = {
  kind: 'svg';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the pcb-layout service exo.
 *
 * @returns A discoverable exo with a `layout` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makePcbLayoutService() {
  return makeDiscoverableExo(
    'PcbLayoutService',
    {
      async layout(_spec: string): Promise<PcbLayoutArtifact> {
        const svg = renderPcbLayout({
          providerLabel: PCB_LAYOUT_PROVIDER_TAG,
        });
        return harden({
          kind: 'svg',
          data: svg,
          fromService: PCB_LAYOUT_PROVIDER_TAG,
          metadata: {
            title: 'LSUR — PCB top view',
            summary:
              'Stylized PCB top-view: MCU QFN, mic, OLED connector, key ' +
              'switches with pads, IR driver block, battery clips, USB-C, ' +
              'mounting holes, suggestive copper traces.',
          },
        });
      },
    },
    {
      layout: {
        description:
          'Produce a PCB top-view layout from a schematic and case dimensions.',
        args: {
          spec: {
            type: 'string',
            description:
              'Schematic handle + case dimensions, in plain English.',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping an inline SVG layout.',
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

import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderBringUpNotes } from './template.ts';

/**
 * Natural-language description registered with the matcher. The
 * provider is positioned as a small engineering-prototype shop —
 * distinct from assembly-coop (which handles Testing-stage 15-unit
 * runs and would also handle Stage-3 production volumes) so the
 * audience can see Stage-1 hardware-debug work happening at a
 * different vendor than the Testing-stage production build.
 */
export const BENCH_BUILD_SERVICE_DESCRIPTION =
  'Build and bench-test engineering prototypes for a new electronic ' +
  'device. Takes a PCB layout and a parts list, hand-solders one or ' +
  'two units from distributor shelf stock, flashes the supplied ' +
  'firmware, and returns bring-up notes covering power-rail check, ' +
  'peripheral verification, and measured latency / range / power ' +
  'numbers from the bench. Intended as the engineering-prototype ' +
  'step before committing to a small-batch production run.';

export const BENCH_BUILD_PROVIDER_TAG = 'proto-pros';

/**
 * Advisory per-invocation price (USD). Flat fee covering the small
 * setup, the hand-soldering labor, and the parts pass-through for a
 * 1-2 unit engineering prototype. Cheap relative to the design
 * services because the build itself is small; the value is in the
 * bring-up notes the inventor uses to decide whether to commit to
 * Testing-stage production.
 */
export const BENCH_BUILD_PRICE_USD = 200;

export type BenchBuildArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the bench-build service exo.
 *
 * @returns A discoverable exo with a `build` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeBenchBuildService() {
  return makeDiscoverableExo(
    'BenchBuildService',
    {
      async build(_spec: string): Promise<BenchBuildArtifact> {
        const markdown = renderBringUpNotes({
          providerLabel: BENCH_BUILD_PROVIDER_TAG,
        });
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: BENCH_BUILD_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — engineering prototype bring-up notes',
            summary:
              'Bench-build of 1-2 hand-soldered units: power-rail ' +
              'check, peripheral verification, measured voice ' +
              'latency / IR range / deep-sleep current, suggested ' +
              'firmware revision before the 15-unit run.',
          },
        });
      },
    },
    {
      build: {
        description:
          'Hand-solder one or two engineering prototype units from a ' +
          'PCB layout, flash the supplied firmware, run a bench bring-' +
          'up sweep, and return notes.',
        args: {
          spec: {
            type: 'string',
            description:
              'Build brief in plain English: PCB layout handle, ' +
              'firmware handle (or fenced source), any specific bench ' +
              'measurements the inventor wants captured.',
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown bring-up notes document.',
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

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
  'device. Two-step delivery: `engage` returns a brief engagement ' +
  "letter and a receive-shipment ocap URL so the customer's PCB " +
  'house can deliver a handful of sample boards (no charge — engage ' +
  'is the setup handshake). On board arrival, `build` sources parts ' +
  'directly from distributor shelf stock, hand-solders one or two ' +
  'units, flashes the supplied firmware, and returns bring-up notes ' +
  'covering power-rail check, peripheral verification, and measured ' +
  'latency / range / power numbers from the bench. `build` charges ' +
  'labor + pass-through parts cost in a single invoice. Intended as ' +
  'the engineering-prototype step before committing to a small-batch ' +
  'production run.';

export const BENCH_BUILD_PROVIDER_TAG = 'proto-pros';

/**
 * Labor cost (USD). Flat fee covering setup, hand-soldering, and the
 * bench-bring-up sweep for a 1-2 unit engineering prototype.
 */
export const BENCH_BUILD_LABOR_PRICE_USD = 200;

/**
 * Pass-through parts cost (USD) for the 1-2 unit engineering build.
 * proto-pros sources these directly from distributor shelf stock and
 * passes the cost through on the same invoice. PCBs are supplied
 * separately by pcb-wizards as part of the `layout` engagement (a
 * handful of sample boards ship to proto-pros at no additional
 * charge), so this number is parts only.
 */
export const BENCH_BUILD_PARTS_PRICE_USD = 50;

/**
 * Total advisory per-invocation price (USD). The customer-facing
 * invoice is the sum of labor + parts pass-through. proto-pros's
 * bring-up notes itemize the two lines.
 */
export const BENCH_BUILD_PRICE_USD =
  BENCH_BUILD_LABOR_PRICE_USD + BENCH_BUILD_PARTS_PRICE_USD;

export type BenchBuildArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
  /**
   * Receive-shipment ocap URL. Set by `engage` so the agent can
   * thread it through to pcb-wizards.shipSampleBoards.
   */
  receiveShipmentUrl?: string;
};

/**
 * Build the bench-build service exo.
 *
 * @param options - Construction options.
 * @param options.getReceiveShipmentUrl - Closure returning the URL of
 *   proto-pros's receive-shipment endpoint. Set by the vat root
 *   after the URL is issued at bootstrap.
 * @returns A discoverable exo with `engage` and `build` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeBenchBuildService(options: {
  getReceiveShipmentUrl: () => string;
}) {
  const { getReceiveShipmentUrl } = options;
  return makeDiscoverableExo(
    'BenchBuildService',
    {
      async engage(_brief: string): Promise<BenchBuildArtifact> {
        const data =
          `# Engagement letter — engineering prototype\n\n` +
          `Vendor: ${BENCH_BUILD_PROVIDER_TAG}\n` +
          `Scope: 1-2 hand-soldered engineering prototypes.\n` +
          `Parts: sourced by us directly from distributor shelf stock.\n` +
          `Bare boards: shipped to us by the customer's PCB house.\n` +
          `Invoice on completion: ` +
          `$${BENCH_BUILD_LABOR_PRICE_USD} labor + ` +
          `$${BENCH_BUILD_PARTS_PRICE_USD} pass-through parts = ` +
          `$${BENCH_BUILD_PRICE_USD} total.\n\n` +
          `Engagement is no-charge — billing happens on \`build\` ` +
          `delivery. Pass the receive-shipment URL below to the ` +
          `customer's PCB house so the sample boards land at our ` +
          `shop; \`build\` proceeds once they arrive.\n`;
        return harden({
          kind: 'markdown',
          data,
          fromService: BENCH_BUILD_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — proto-pros engagement letter',
            summary:
              `Engagement confirmed with ${BENCH_BUILD_PROVIDER_TAG}: ` +
              `1-2 units, parts sourced by them, sample boards inbound ` +
              `from PCB house via receive-shipment ocap. No charge — ` +
              `the $${BENCH_BUILD_PRICE_USD} invoice lands on \`build\`.`,
          },
          receiveShipmentUrl: getReceiveShipmentUrl(),
        });
      },
      async build(_spec: string): Promise<BenchBuildArtifact> {
        const { markdown, firmwareRevisionFlagged } = renderBringUpNotes({
          providerLabel: BENCH_BUILD_PROVIDER_TAG,
          laborPriceUsd: BENCH_BUILD_LABOR_PRICE_USD,
          partsPriceUsd: BENCH_BUILD_PARTS_PRICE_USD,
        });
        // Derive the summary from the actual revision outcome so the
        // agent's slim-form view tells the truth: either a firmware
        // revision was flagged or the build was clean. A static
        // "suggested firmware revision" phrase let the agent
        // confabulate a flagged item even when none existed.
        const revisionPhrase = firmwareRevisionFlagged
          ? 'one suggested firmware revision before the 15-unit run flagged'
          : 'no firmware revisions flagged; build behaved per spec';
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: BENCH_BUILD_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — engineering prototype bring-up notes',
            summary:
              `Bench-build of 1-2 hand-soldered units: power-rail ` +
              `check, peripheral verification, measured voice latency ` +
              `/ IR range / deep-sleep current. ${revisionPhrase}. ` +
              `Invoice: $${BENCH_BUILD_LABOR_PRICE_USD} labor + ` +
              `$${BENCH_BUILD_PARTS_PRICE_USD} parts = ` +
              `$${BENCH_BUILD_PRICE_USD} total.`,
          },
        });
      },
    },
    {
      engage: {
        description:
          'Round 1: confirm the engagement and return a receive-' +
          "shipment ocap URL so the customer's PCB house can ship a " +
          'few sample boards to proto-pros. No wallet charge — billing ' +
          'happens on `build`.',
        args: {
          brief: {
            type: 'string',
            description:
              'Engagement brief in plain English: what proto-pros is ' +
              'being asked to bench-build, any specific measurements ' +
              "the inventor cares about, and the customer's PCB " +
              'house if it matters.',
          },
        },
        returns: {
          type: 'object',
          description:
            'Artifact descriptor wrapping a markdown engagement letter.',
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
      build: {
        description:
          'Round 2: hand-solder one or two engineering prototype ' +
          'units from a PCB layout, flash the supplied firmware, run ' +
          'a bench bring-up sweep, and return notes. Invoke after ' +
          "`engage` and after the customer's PCB house has shipped " +
          'sample boards via the receive-shipment URL.',
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

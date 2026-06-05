import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import { renderFirmwareSpec } from './template.ts';

/**
 * Natural-language description registered with the matcher. Opening
 * verb "Specify" per plan §6 firmware-spec capability discipline.
 */
export const FIRMWARE_SPEC_SERVICE_DESCRIPTION =
  'Specify firmware for a consumer-electronics product. Takes a ' +
  'functional spec (text) and returns a markdown document describing ' +
  'the boot sequence, state machine, IR protocols, button handling, ' +
  'power management, and OTA strategy.';

export const FIRMWARE_SPEC_PROVIDER_TAG = 'firmware-foundry';

/**
 * Advisory per-invocation price (USD). Plan §6 firmware-spec band
 * is 1,000 – 3,000; firmware-foundry is the budget option at $1,000.
 */
export const FIRMWARE_SPEC_PRICE_USD = 1_000;

/**
 * Shape returned by `specify`.
 */
export type FirmwareSpecArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Build the firmware-spec service exo.
 *
 * @returns A discoverable exo with a `specify` method.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeFirmwareSpecService() {
  return makeDiscoverableExo(
    'FirmwareSpecService',
    {
      async specify(_spec: string): Promise<FirmwareSpecArtifact> {
        const markdown = renderFirmwareSpec();
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: FIRMWARE_SPEC_PROVIDER_TAG,
          metadata: {
            title: 'LSUR — firmware specification',
            summary:
              'Eight-section markdown: boot, state machine, IR, voice, ' +
              'buttons, power management, OTA, out-of-scope.',
          },
        });
      },
    },
    {
      specify: {
        description:
          'Produce a firmware specification document from a functional spec.',
        args: {
          spec: {
            type: 'string',
            description:
              'Functional spec for the product, in plain English ' +
              '(features, hardware constraints, power budget).',
          },
        },
        returns: {
          type: 'object',
          description: 'Artifact descriptor wrapping a markdown firmware spec.',
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

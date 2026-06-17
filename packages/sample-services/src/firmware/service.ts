import { makeDiscoverableExo } from '@metamask/kernel-utils/discoverable';

import {
  renderFirmwareImplementation,
  renderFirmwareSpec,
} from './template.ts';
import type { FirmwareImplementationInputs } from './template.ts';

/**
 * Natural-language description registered with the matcher. Covers
 * both methods on the provider so the agent's discovery query reads
 * an end-to-end story.
 */
export const FIRMWARE_SERVICE_DESCRIPTION =
  'Specify and implement firmware for an embedded consumer-electronics ' +
  'product. Two-step delivery: `specify` returns a markdown firmware ' +
  'specification (~$1,000); on inventor approval, `implement` returns ' +
  'the firmware source itself (~$5,000), optionally incorporating any ' +
  'conditional-approval changes the inventor attaches to the request. ' +
  'Price covers up to two revisions of either artifact on request.';

export const FIRMWARE_PROVIDER_TAG = 'firmware-foundry';

/**
 * Advisory per-call prices (USD). The matcher sees the headline
 * total; the per-method breakdown is documented in the method
 * descriptions so the agent narrates each charge as it lands.
 */
export const FIRMWARE_SPEC_PRICE_USD = 1_000;
export const FIRMWARE_IMPLEMENTATION_PRICE_USD = 5_000;
export const FIRMWARE_PRICE_USD =
  FIRMWARE_SPEC_PRICE_USD + FIRMWARE_IMPLEMENTATION_PRICE_USD;

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
 * Shape returned by `implement` on successful acceptance.
 */
export type FirmwareImplementationArtifact = {
  kind: 'markdown';
  data: string;
  fromService: string;
  metadata?: { title?: string; summary?: string };
};

/**
 * Shape returned by `implement`. The stub always sets
 * `accepted: true`, but the result shape carries the renegotiation
 * indicator so the API itself is honest about the possibility — and
 * the agent's narration reads the same way whether the stub or a real
 * provider stands behind it.
 */
export type FirmwareImplementationResult = {
  accepted: boolean;
  firmware?: FirmwareImplementationArtifact;
  declineReason?: string;
};

/**
 * Extract a short rev-label hint from a spec artifact's markdown. The
 * spec doesn't currently embed a rev marker, so we fall back to
 * letting the implementation render pick its own rev label.
 *
 * @param specMarkdown - The previously-returned spec markdown.
 * @returns The rev label if present, otherwise `undefined`.
 */
function extractSpecRev(specMarkdown?: string): string | undefined {
  if (typeof specMarkdown !== 'string') {
    return undefined;
  }
  const match = /rev\s+([A-F]\d)/iu.exec(specMarkdown);
  return match ? match[1]?.toUpperCase() : undefined;
}

/**
 * Build the firmware service exo. Exposes `specify` (round 1) and
 * `implement` (round 2) — see `FIRMWARE_SERVICE_DESCRIPTION` for the
 * two-step protocol.
 *
 * @returns A discoverable exo with `specify` and `implement` methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeFirmwareService() {
  return makeDiscoverableExo(
    'FirmwareService',
    {
      async specify(_spec: string): Promise<FirmwareSpecArtifact> {
        const markdown = renderFirmwareSpec();
        return harden({
          kind: 'markdown',
          data: markdown,
          fromService: FIRMWARE_PROVIDER_TAG,
          metadata: {
            title: 'LAUR — firmware specification',
            summary:
              'Eight-section markdown: boot, state machine, IR, voice, ' +
              'buttons, power management, OTA, out-of-scope.',
          },
        });
      },

      async implement(approval: {
        specHandle: string;
        spec?: string;
        changes?: string;
      }): Promise<FirmwareImplementationResult> {
        const specRev = extractSpecRev(approval.spec);
        const inputs: FirmwareImplementationInputs = {};
        if (typeof approval.changes === 'string') {
          inputs.changes = approval.changes;
        }
        const source = renderFirmwareImplementation(inputs, specRev);
        const hasChanges =
          typeof approval.changes === 'string' &&
          approval.changes.trim().length > 0;
        const summary = hasChanges
          ? 'C source for the keypad FSM + IR + voice gating, ' +
            'incorporating the inventor-requested changes.'
          : 'C source for the keypad FSM + IR + voice gating.';
        const trailingNewline = source.endsWith('\n') ? '' : '\n';
        const data = `\`\`\`c\n${source}${trailingNewline}\`\`\`\n`;
        return harden({
          accepted: true,
          firmware: {
            kind: 'markdown',
            data,
            fromService: FIRMWARE_PROVIDER_TAG,
            metadata: {
              title: 'LAUR — firmware (laur_main.c)',
              summary,
            },
          },
        });
      },
    },
    {
      specify: {
        description:
          'Round 1 of the two-step firmware delivery. Produces a ' +
          `markdown firmware specification for $${FIRMWARE_SPEC_PRICE_USD} ` +
          'covering boot, state machine, peripheral I/O, power, and ' +
          'update/recovery. The inventor reviews the spec and then ' +
          'either approves it unconditionally or with proposed changes; ' +
          'either way, the agent then calls `implement` to commission ' +
          'the source.',
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
      implement: {
        description:
          'Round 2 of the two-step firmware delivery. Costs ' +
          `$${FIRMWARE_IMPLEMENTATION_PRICE_USD}. Takes the spec handle ` +
          'from round 1 plus an optional `changes` string describing the ' +
          "inventor's conditional-approval edits to the spec. Returns a " +
          'result object that indicates acceptance (`accepted: true`) ' +
          'and includes the firmware source artifact; a real provider ' +
          'could instead set `accepted: false` and `declineReason` to ' +
          'renegotiate, but this stub always accepts and folds any ' +
          "supplied changes into the source's header comment.",
        args: {
          approval: {
            type: 'object',
            description:
              "Approval payload: the spec handle from round 1, the spec's " +
              'markdown content (used to lift the rev label), and any ' +
              'conditional changes the inventor wants incorporated.',
            properties: {
              specHandle: {
                type: 'string',
                description: 'Artifact handle from the round-1 `specify` call.',
              },
              spec: {
                type: 'string',
                description:
                  'Optional spec markdown (the agent typically passes the ' +
                  'just-recorded spec verbatim) so the implementation can ' +
                  'lift the rev label and stay aligned.',
              },
              changes: {
                type: 'string',
                description:
                  'Optional natural-language conditional-approval changes ' +
                  'the inventor wants folded into the implementation. ' +
                  'Omit for unconditional approval.',
              },
            },
            required: ['specHandle'],
          },
        },
        returns: {
          type: 'object',
          description:
            'Acceptance result: `accepted` flag, the firmware artifact ' +
            'when accepted, optional `declineReason` when not.',
          properties: {
            accepted: {
              type: 'boolean',
              description:
                'Whether the provider accepted the (possibly conditional) ' +
                'approval and is delivering the implementation.',
            },
            firmware: {
              type: 'object',
              description:
                'Artifact descriptor wrapping the firmware source as ' +
                'markdown with a fenced code block. Present only when ' +
                '`accepted` is true.',
              properties: {
                kind: {
                  type: 'string',
                  description:
                    "Artifact kind. Always 'markdown' for this service.",
                },
                data: {
                  type: 'string',
                  description:
                    'Markdown source containing the firmware in a fenced ' +
                    'code block.',
                },
                fromService: {
                  type: 'string',
                  description:
                    'Provider tag of the service that produced this.',
                },
              },
              required: ['kind', 'data', 'fromService'],
            },
            declineReason: {
              type: 'string',
              description:
                'Why the provider declined; present only when `accepted` ' +
                'is false.',
            },
          },
          required: ['accepted'],
        },
      },
    },
  );
}

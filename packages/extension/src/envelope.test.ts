import { describe, it, expect } from 'vitest';

import {
  capTpEnveloper,
  commandEnveloper,
  EnvelopeLabel,
  isStreamEnvelope,
  makeStreamEnvelopeHandler,
} from './envelope.js';
import { Command } from './message.js';

const contentFixtures = {
  command: { id: '1', message: { type: Command.Evaluate, data: '1 + 1' } },
  capTp: { id: '4', message: { type: 'CTP_CALL', epoch: 0 } },
};

describe('envelope', () => {
  describe('isStreamEnvelope', () => {
    it('returns true for valid messages', () => {
      expect(
        isStreamEnvelope({
          label: EnvelopeLabel.Command,
          content: {
            id: '1',
            message: { type: 'evaluate', data: '1 + 1' },
          },
        }),
      ).toBe(true);
    });

    it.each`
      exportName            | enveloper           | content
      ${'commandEnveloper'} | ${commandEnveloper} | ${contentFixtures.command}
      ${'capTpEnveloper'}   | ${capTpEnveloper}   | ${contentFixtures.capTp}
    `(
      'returns true for valid contents wrapped by $enveloper.label',
      ({ enveloper, content }) => {
        expect(isStreamEnvelope(enveloper.wrap(content))).toBe(true);
      },
    );

    it.each`
      envelope
      ${{}}
      ${{ label: EnvelopeLabel.Command }}
      ${{ label: EnvelopeLabel.CapTp }}
      ${{ label: EnvelopeLabel.Command, content: contentFixtures.capTp }}
      ${{ label: 'unknown', content: [] }}
    `('returns false for invalid envelopes: $envelope', ({ envelope }) => {
      expect(isStreamEnvelope(envelope)).toBe(false);
    });
  });

  describe('StreamEnvelopeHandler', () => {
    const testEnvelopeHandlers = {
      command: async () => EnvelopeLabel.Command,
      capTp: async () => EnvelopeLabel.CapTp,
    };
    const testErrorHandler = (problem: unknown): never => {
      throw new Error(`TEST ${String(problem)}`);
    };
    const handler = makeStreamEnvelopeHandler(
      testEnvelopeHandlers,
      testErrorHandler,
    );

    it.each`
      enveloper           | message
      ${commandEnveloper} | ${contentFixtures.command}
      ${capTpEnveloper}   | ${contentFixtures.capTp}
    `('handles valid StreamEnvelopes', async ({ enveloper, message }) => {
      expect(await handler(enveloper.wrap(message))).toStrictEqual(
        enveloper.label,
      );
    });

    it('routes invalid envelopes to supplied error handler', async () => {
      await expect(handler({ label: 'unknown', content: [] })).rejects.toThrow(
        /TEST Stream envelope handler received unexpected value/u,
      );
    });

    it('routes valid stream envelopes with an unhandled label to the error handler', async () => {
      const commandHandler = makeStreamEnvelopeHandler(
        { command: testEnvelopeHandlers.command },
        testErrorHandler,
      );
      await expect(
        commandHandler(capTpEnveloper.wrap(contentFixtures.capTp)),
      ).rejects.toThrow(
        /TEST Stream envelope handler received an envelope with known but unexpected label/u,
      );
    });
  });

  describe('envelopeKit', () => {
    it.each`
      enveloper           | envelope
      ${commandEnveloper} | ${contentFixtures.capTp}
      ${capTpEnveloper}   | ${contentFixtures.command}
    `(
      'throws when unwrapping a malformed envelope',
      ({ enveloper, envelope }) => {
        expect(() => enveloper.unwrap(envelope)).toThrow(
          /Expected envelope labelled/u,
        );
      },
    );
  });
});

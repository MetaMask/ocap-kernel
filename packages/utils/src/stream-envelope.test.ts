import { describe, it, expect } from 'vitest';

import {
  wrapCapTp,
  wrapStreamCommand,
  makeStreamEnvelopeHandler,
} from './stream-envelope.js';
import type { CapTpMessage, VatMessage } from './types.js';
import { CommandMethod } from './types.js';

describe('StreamEnvelopeHandler', () => {
  const commandContent: VatMessage = {
    id: '1',
    payload: { type: CommandMethod.Evaluate, data: '1 + 1' },
  };
  const capTpContent: CapTpMessage = {
    type: 'CTP_CALL',
    epoch: 0,
    // Our assumptions about the form of a CapTpMessage are weak.
    unreliableKey: Symbol('unreliableValue'),
  };

  const commandLabel = wrapStreamCommand(commandContent).label;
  const capTpLabel = wrapCapTp(capTpContent).label;

  const testEnvelopeHandlers = {
    command: async () => commandLabel,
    capTp: async () => capTpLabel,
  };

  const testErrorHandler = (problem: unknown): never => {
    throw new Error(`TEST ${String(problem)}`);
  };

  it.each`
    wrapper              | content           | label
    ${wrapStreamCommand} | ${commandContent} | ${commandLabel}
    ${wrapCapTp}         | ${capTpContent}   | ${capTpLabel}
  `('handles valid StreamEnvelopes', async ({ wrapper, content, label }) => {
    const handler = makeStreamEnvelopeHandler(
      testEnvelopeHandlers,
      testErrorHandler,
    );
    expect(await handler.handle(wrapper(content))).toStrictEqual(label);
  });

  it('routes invalid envelopes to default error handler', async () => {
    const handler = makeStreamEnvelopeHandler(testEnvelopeHandlers);
    await expect(
      // @ts-expect-error label is intentionally unknown
      handler.handle({ label: 'unknown', content: [] }),
    ).rejects.toThrow(/^Stream envelope handler received unexpected value/u);
  });

  it('routes invalid envelopes to supplied error handler', async () => {
    const handler = makeStreamEnvelopeHandler(
      testEnvelopeHandlers,
      testErrorHandler,
    );
    await expect(
      // @ts-expect-error label is intentionally unknown
      handler.handle({ label: 'unknown', content: [] }),
    ).rejects.toThrow(
      /^TEST Stream envelope handler received unexpected value/u,
    );
  });

  it('routes valid stream envelopes with an unhandled label to the error handler', async () => {
    const handler = makeStreamEnvelopeHandler(
      { command: testEnvelopeHandlers.command },
      testErrorHandler,
    );
    await expect(handler.handle(wrapCapTp(capTpContent))).rejects.toThrow(
      /^TEST Stream envelope handler received an envelope with known but unexpected label/u,
    );
  });
});

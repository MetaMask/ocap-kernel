import { describe, expect, it } from 'vitest';

import { makeStreamEnvelopeHandler } from './envelope-handler.js';
import {
  barContent,
  fooContent,
  isStreamEnvelope,
  Label,
  streamEnveloper,
} from '../test/envelope-kit-fixtures.js';

describe('StreamEnvelopeHandler', () => {
  const testEnvelopeHandlers = {
    foo: async () => Label.Foo,
    bar: async () => Label.Bar,
  };

  const testErrorHandler = (problem: unknown): never => {
    throw new Error(`TEST ${String(problem)}`);
  };

  it.each`
    wrapper                     | content       | label
    ${streamEnveloper.foo.wrap} | ${fooContent} | ${Label.Foo}
    ${streamEnveloper.bar.wrap} | ${barContent} | ${Label.Bar}
  `('handles valid StreamEnvelopes', async ({ wrapper, content, label }) => {
    const handler = makeStreamEnvelopeHandler(
      streamEnveloper,
      isStreamEnvelope,
      testEnvelopeHandlers,
      testErrorHandler,
    );
    console.debug(wrapper(content));
    expect(await handler.handle(wrapper(content))).toStrictEqual(label);
  });

  it('routes invalid envelopes to default error handler', async () => {
    const handler = makeStreamEnvelopeHandler(
      streamEnveloper,
      isStreamEnvelope,
      testEnvelopeHandlers,
    );
    await expect(
      // @ts-expect-error label is intentionally unknown
      handler.handle({ label: 'unknown', content: [] }),
    ).rejects.toThrow(/^Stream envelope handler received unexpected value/u);
  });

  it('routes invalid envelopes to supplied error handler', async () => {
    const handler = makeStreamEnvelopeHandler(
      streamEnveloper,
      isStreamEnvelope,
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
      streamEnveloper,
      isStreamEnvelope,
      { foo: testEnvelopeHandlers.foo },
      testErrorHandler,
    );
    await expect(
      handler.handle(streamEnveloper.bar.wrap(barContent)),
    ).rejects.toThrow(
      /^TEST Stream envelope handler received an envelope with known but unexpected label/u,
    );
  });
});

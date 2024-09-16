import { describe, expect, it } from 'vitest';

import { makeStreamEnvelopeKit } from './envelope-kit.js';
import type { Bar, ContentMap, Foo, labels } from './envelope-test-fixtures.js';
import {
  inferNumber,
  inferString,
  makeStreamEnvelopeHandler,
} from './envelope-test-fixtures.js';

describe('makeStreamEnvelopeKit', () => {
  it.each`
    property
    ${'streamEnveloper'}
    ${'isStreamEnvelope'}
    ${'makeStreamEnvelopeHandler'}
  `('has the expected property: $property', ({ property }) => {
    const streamEnvelopeKit = makeStreamEnvelopeKit<typeof labels, ContentMap>({
      foo: (value: unknown): value is Foo => true,
      bar: (value: unknown): value is Bar => true,
    });
    expect(streamEnvelopeKit).toHaveProperty(property);
  });

  /* eslint-disable @typescript-eslint/no-unused-expressions */
  // eslint-disable-next-line vitest/expect-expect
  it('causes a typescript error when supplying typeguard keys not matching the label type', () => {
    // @ts-expect-error the bar key is missing
    makeStreamEnvelopeKit<typeof labels, ContentMap>({
      foo: (value: unknown): value is Foo => true,
    });
    makeStreamEnvelopeKit<typeof labels, ContentMap>({
      foo: (value: unknown): value is Foo => true,
      bar: (value: unknown): value is Bar => true,
      // @ts-expect-error the qux key is not included in labels
      qux: (value: unknown): value is 'qux' => false,
    });
  });
  /* eslint-enable @typescript-eslint/no-unused-expressions */

  describe('makeStreamEnvelopeHandler', () => {
    /* eslint-disable @typescript-eslint/no-unused-expressions */
    // eslint-disable-next-line vitest/expect-expect
    it('provides proper typescript inferences', () => {
      // all label arguments are optional
      makeStreamEnvelopeHandler({});
      // bar is optional
      makeStreamEnvelopeHandler({
        foo: async (content) => {
          inferNumber(content.a);
          // @ts-expect-error a is not a string
          inferString(content.a);
          // @ts-expect-error b is not a number
          inferNumber(content.b);
          inferString(content.b);
          // @ts-expect-error c is undefined
          value.content.c;
        },
      });
      // keys not included in labels are forbidden
      makeStreamEnvelopeHandler({
        // @ts-expect-error the qux key is not included in labels
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qux: async (content: any) => content,
      });
    });
    /* eslint-enable @typescript-eslint/no-unused-expressions */
  });
});

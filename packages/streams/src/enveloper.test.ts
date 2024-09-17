import { describe, expect, it } from 'vitest';
import { barContent, fooContent, inferBoolean, inferNumber, inferString, Label, streamEnveloper } from './envelope-test-fixtures.js';

describe('StreamEnveloper', () => {
  describe('check', () => {
    it.each`
      enveloper              | envelope
      ${streamEnveloper.foo} | ${{ label: 'foo', content: fooContent }}
      ${streamEnveloper.bar} | ${{ label: 'bar', content: barContent }}
      ${streamEnveloper.bar} | ${{ label: 'bar', content: barContent, extra: 'value' }}
    `(
      'returns true for valid envelopes: $envelope',
      ({ enveloper, envelope }) => {
        expect(enveloper.check(envelope)).toBe(true);
      },
    );

    it.each`
      enveloper              | content
      ${streamEnveloper.foo} | ${fooContent}
      ${streamEnveloper.bar} | ${barContent}
    `(
      'returns true for content wrapped by its enveloper: $content',
      ({ enveloper, content }) => {
        expect(enveloper.check(enveloper.wrap(content))).toBe(true);
      },
    );

    it.each`
      enveloper              | value
      ${streamEnveloper.foo} | ${null}
      ${streamEnveloper.foo} | ${true}
      ${streamEnveloper.foo} | ${[]}
      ${streamEnveloper.foo} | ${{}}
      ${streamEnveloper.foo} | ${fooContent}
      ${streamEnveloper.foo} | ${{ id: '0xcafebeef' }}
      ${streamEnveloper.foo} | ${{ label: 'foo', content: barContent }}
      ${streamEnveloper.bar} | ${{ label: 'Bar', content: barContent }}
    `(
      'returns false for invalid envelopes: $value',
      ({ enveloper, value }) => {
        expect(enveloper.check(value)).toBe(false);
      },
    );

    /* eslint-disable @typescript-eslint/no-unused-expressions */
    // eslint-disable-next-line vitest/expect-expect
    it('provides proper typescript inferences', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const envelope: any = null;
      // eslint-disable-next-line vitest/no-conditional-in-test
      if (streamEnveloper.foo.check(envelope)) {
        inferNumber(envelope.content.a);
        // @ts-expect-error a is not a string
        inferString(envelope.content.a);
        // @ts-expect-error b is not a number
        inferNumber(envelope.content.b);
        inferString(envelope.content.b);
        // @ts-expect-error c is not defined
        envelope.content.c;
        switch (envelope.label) {
          case Label.Foo:
            expect(envelope.label).toMatch(Label.Foo);
            break;
          // @ts-expect-error label is Label.Foo
          case Label.Bar: // unreachable
            // @ts-expect-error label is inferred to be never
            envelope.label.length;
            break;
          default: // unreachable
            // @ts-expect-error label is inferred to be never
            envelope.label.length;
        }
      }

      // eslint-disable-next-line vitest/no-conditional-in-test
      if (streamEnveloper.bar.check(envelope)) {
        // @ts-expect-error a is not defined
        envelope.content.a;
        // @ts-expect-error b is not defined
        envelope.content.b;
        inferBoolean(envelope.content.c);
        switch (envelope.label) {
          // @ts-expect-error label is Label.Bar
          case Label.Foo: // unreachable
            // @ts-expect-error label is inferred to be never
            envelope.label.length;
            break;
          case Label.Bar:
            expect(envelope.label).toMatch(Label.Bar);
            break;
          default: // unreachable
            // @ts-expect-error label is inferred to be never
            envelope.label.length;
        }
      }
    });
    /* eslint-enable @typescript-eslint/no-unused-expressions */
  });

  describe('wrap', () => {
    it.each`
      enveloper              | content
      ${streamEnveloper.foo} | ${fooContent}
      ${streamEnveloper.bar} | ${barContent}
    `(
      'is inverse to unwrap from the same enveloper: $enveloper',
      ({ enveloper, content }) => {
        expect(enveloper.unwrap(enveloper.wrap(content))).toStrictEqual(
          content,
        );
      },
    );

    // eslint-disable-next-line vitest/expect-expect
    it('provides proper typescript inferences', () => {
      streamEnveloper.foo.wrap(fooContent);
      // @ts-expect-error foo rejects barContent
      streamEnveloper.foo.wrap(barContent);
      // @ts-expect-error bar rejects fooContent
      streamEnveloper.bar.wrap(fooContent);
      streamEnveloper.bar.wrap(barContent);
    });
  });

  describe('unwrap', () => {
    it.each`
      enveloper              | envelope
      ${streamEnveloper.foo} | ${{ content: fooContent }}
      ${streamEnveloper.foo} | ${{ label: Label.Bar, content: fooContent }}
    `(
      'throws if passed an envelope with the wrong label: $envelope',
      ({ enveloper, envelope }) => {
        expect(() => enveloper.unwrap(envelope)).toThrow(
          /^Expected envelope labelled "foo" but got /u,
        );
      },
    );

    /* eslint-disable @typescript-eslint/no-unused-expressions */
    // eslint-disable-next-line vitest/expect-expect
    it('provides proper typescript inferences', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const envelope: any = null;
      try {
        const content = streamEnveloper.foo.unwrap(envelope);

        inferNumber(content.a);
        // @ts-expect-error a is not a string
        inferString(content.a);
        // @ts-expect-error b is not a number
        inferNumber(content.b);
        inferString(content.b);
        // @ts-expect-error c is undefined
        content.c;
      } catch {
        undefined;
      }

      try {
        // @ts-expect-error envelope was already inferred to be Envelope<Label.Foo, Foo>
        content = streamEnveloper.bar.unwrap(envelope);
      } catch {
        undefined;
      }
    });
    /* eslint-enable @typescript-eslint/no-unused-expressions */
  });

  describe('label', () => {
    it.each`
      enveloper              | label
      ${streamEnveloper.foo} | ${Label.Foo}
      ${streamEnveloper.bar} | ${Label.Bar}
    `('has the right label: $label', ({ enveloper, label }) => {
      expect(enveloper.label).toBe(label);
    });

    /* eslint-disable @typescript-eslint/no-unused-expressions */
    // eslint-disable-next-line vitest/expect-expect
    it('provides proper typescript inferences', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fooEnveloper: any = streamEnveloper.foo;
      const inferFooEnveloper = (
        enveloper: typeof streamEnveloper.foo,
      ): unknown => enveloper;
      const inferBarEnveloper = (
        enveloper: typeof streamEnveloper.bar,
      ): unknown => enveloper;

      type Enveloper = (typeof streamEnveloper)[keyof typeof streamEnveloper];
      const ambiguousEnveloper = fooEnveloper as Enveloper;

      switch (ambiguousEnveloper.label) {
        case Label.Foo:
          inferFooEnveloper(ambiguousEnveloper);
          // @ts-expect-error label = Label.Foo implies ambiguousEnveloper is a FooEnveloper
          inferBarEnveloper(ambiguousEnveloper);
          break;
        case Label.Bar:
          // @ts-expect-error label = Label.Bar implies ambiguousEnveloper is a BarEnveloper
          inferFooEnveloper(ambiguousEnveloper);
          inferBarEnveloper(ambiguousEnveloper);
          break;
        default: // unreachable
          // @ts-expect-error label options are exhausted
          ambiguousEnveloper.label;
      }
    });
    /* eslint-enable @typescript-eslint/no-unused-expressions */
  });
});
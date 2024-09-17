import { describe, expect, it } from 'vitest';

import { makeStreamEnvelopeKit } from './envelope-kit.js';
import type {
  Bar,
  ContentMap,
  Foo,
  labels,
} from '../test/envelope-kit-fixtures.js';
import {
  makeStreamEnvelopeHandler as kitMakeStreamEnvelopeHandler,
  isStreamEnvelope,
  Label,
  streamEnveloper,
  fooContent,
  barContent,
} from '../test/envelope-kit-fixtures.js';

const inferNumber = (value: number): number => value;
const inferString = (value: string): string => value;
const inferBoolean = (value: boolean): boolean => value;

describe('makeStreamEnvelopeKit', () => {
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

  describe('kitted makeStreamEnvelopeHandler', () => {
    it('provides proper typescript inferences', () => {
      // all label arguments are optional
      kitMakeStreamEnvelopeHandler({});
      // bar is optional
      kitMakeStreamEnvelopeHandler({
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
      kitMakeStreamEnvelopeHandler({
        // @ts-expect-error the qux key is not included in labels
        qux: async (content: any) => content,
      });
    });
  });
});

describe('isStreamEnvelope', () => {
  it('provides proper typescript inferences', () => {
    const value: any = null;
    if (isStreamEnvelope(value)) {
      switch (value.label) {
        case Label.Foo:
          inferNumber(value.content.a);
          // @ts-expect-error a is not a string
          inferString(value.content.a);
          // @ts-expect-error b is not a number
          inferNumber(value.content.b);
          inferString(value.content.b);
          // @ts-expect-error c is undefined
          value.content.c;
          break;
        case Label.Bar:
          // @ts-expect-error a is undefined
          value.content.a;
          // @ts-expect-error a is undefined
          value.content.b;
          inferBoolean(value.content.c);
          break;
        default: // unreachable
          // @ts-expect-error label options are exhausted
          value.label;
      }
    }
  });
});

describe('StreamEnveloper', () => {
  describe('check', () => {
    it('provides proper typescript inferences', () => {
      const envelope: any = null;
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
  });

  describe('wrap', () => {
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
    it('provides proper typescript inferences', () => {
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
  });

  describe('label', () => {
    it('provides proper typescript inferences', () => {
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
  });
});

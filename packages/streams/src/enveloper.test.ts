import { describe, expect, it } from 'vitest';

import {
  barContent,
  fooContent,
  Label,
  streamEnveloper,
} from '../test/envelope-kit-fixtures.js';

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
    `('returns false for invalid envelopes: $value', ({ enveloper, value }) => {
      expect(enveloper.check(value)).toBe(false);
    });
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
  });

  describe('label', () => {
    it.each`
      enveloper              | label
      ${streamEnveloper.foo} | ${Label.Foo}
      ${streamEnveloper.bar} | ${Label.Bar}
    `('has the right label: $label', ({ enveloper, label }) => {
      expect(enveloper.label).toBe(label);
    });
  });
});

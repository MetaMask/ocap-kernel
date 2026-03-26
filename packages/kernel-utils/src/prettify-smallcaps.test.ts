import { describe, it, expect } from 'vitest';

import { prettifySmallcaps } from './prettify-smallcaps.ts';

describe('prettifySmallcaps', () => {
  it('decodes a plain string', () => {
    expect(prettifySmallcaps({ body: '#"0xca46b9"', slots: [] })).toBe(
      '0xca46b9',
    );
  });

  it('decodes a number', () => {
    expect(prettifySmallcaps({ body: '#42', slots: [] })).toBe(42);
  });

  it('decodes null', () => {
    expect(prettifySmallcaps({ body: '#null', slots: [] })).toBeNull();
  });

  it('decodes a boolean', () => {
    expect(prettifySmallcaps({ body: '#true', slots: [] })).toBe(true);
  });

  it('replaces a remotable slot reference', () => {
    expect(prettifySmallcaps({ body: '#"$0"', slots: ['ko12'] })).toBe(
      '<ko12>',
    );
  });

  it('replaces a remotable slot reference with interface name', () => {
    expect(
      prettifySmallcaps({ body: '#"$0.Alleged: MyObj"', slots: ['ko12'] }),
    ).toBe('<ko12> (Alleged: MyObj)');
  });

  it('replaces a promise slot reference', () => {
    expect(prettifySmallcaps({ body: '#"&0"', slots: ['kp42'] })).toBe(
      '<kp42>',
    );
  });

  it('decodes an object with mixed values', () => {
    expect(
      prettifySmallcaps({
        body: '#{"name":"$0.Alleged: MyObj","count":42}',
        slots: ['ko12'],
      }),
    ).toStrictEqual({ name: '<ko12> (Alleged: MyObj)', count: 42 });
  });

  it('decodes nested arrays and objects', () => {
    expect(
      prettifySmallcaps({
        body: '#{"items":["$0","$1"],"meta":{"ref":"&2"}}',
        slots: ['ko1', 'ko2', 'kp3'],
      }),
    ).toStrictEqual({
      items: ['<ko1>', '<ko2>'],
      meta: { ref: '<kp3>' },
    });
  });

  it('strips smallcaps escape prefix from strings', () => {
    expect(prettifySmallcaps({ body: '#"!$0"', slots: ['ko1'] })).toBe('$0');
  });

  it('strips double escape prefix', () => {
    expect(prettifySmallcaps({ body: '#"!!hello"', slots: [] })).toBe('!hello');
  });

  it('leaves non-slot strings unchanged', () => {
    expect(
      prettifySmallcaps({ body: '#{"text":"hello world"}', slots: [] }),
    ).toStrictEqual({ text: 'hello world' });
  });

  it('handles missing slot index gracefully', () => {
    expect(prettifySmallcaps({ body: '#"$5"', slots: ['ko1'] })).toBe('<?5>');
  });

  it('throws if body does not start with #', () => {
    expect(() => prettifySmallcaps({ body: '"hello"', slots: [] })).toThrow(
      "Expected body to start with '#'",
    );
  });

  it('decodes a non-negative bigint', () => {
    expect(prettifySmallcaps({ body: '#"+7"', slots: [] })).toBe('7n');
  });

  it('decodes a negative bigint', () => {
    expect(prettifySmallcaps({ body: '#"-7"', slots: [] })).toBe('-7n');
  });

  it('decodes #undefined', () => {
    expect(prettifySmallcaps({ body: '#"#undefined"', slots: [] })).toBe(
      '[undefined]',
    );
  });

  it('decodes #NaN', () => {
    expect(prettifySmallcaps({ body: '#"#NaN"', slots: [] })).toBe('[NaN]');
  });

  it('decodes #Infinity', () => {
    expect(prettifySmallcaps({ body: '#"#Infinity"', slots: [] })).toBe(
      '[Infinity]',
    );
  });

  it('decodes #-Infinity', () => {
    expect(prettifySmallcaps({ body: '#"#-Infinity"', slots: [] })).toBe(
      '[-Infinity]',
    );
  });

  it('decodes a symbol', () => {
    expect(prettifySmallcaps({ body: '#"%foo"', slots: [] })).toBe(
      '[Symbol: foo]',
    );
  });

  it('decodes a tagged value', () => {
    expect(
      prettifySmallcaps({
        body: '#{"#tag":"match:any","payload":"#undefined"}',
        slots: [],
      }),
    ).toStrictEqual({ '[Tagged: match:any]': '[undefined]' });
  });

  it('decodes an error', () => {
    expect(
      prettifySmallcaps({
        body: '#{"#error":"boom","name":"TypeError"}',
        slots: [],
      }),
    ).toBe('[TypeError: boom]');
  });

  it('decodes an error without name', () => {
    expect(
      prettifySmallcaps({
        body: '#{"#error":"something broke"}',
        slots: [],
      }),
    ).toBe('[Error: something broke]');
  });

  it('unescapes record keys', () => {
    expect(
      prettifySmallcaps({
        body: '#{"!#foo":"bar","normal":"baz"}',
        slots: [],
      }),
    ).toStrictEqual({ '#foo': 'bar', normal: 'baz' });
  });
});

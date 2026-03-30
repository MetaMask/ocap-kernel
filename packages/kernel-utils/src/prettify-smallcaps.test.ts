import { describe, it, expect } from 'vitest';

import { prettifySmallcaps } from './prettify-smallcaps.ts';

describe('prettifySmallcaps', () => {
  it.each([
    ['plain string', '#"0xca46b9"', [], '0xca46b9'],
    ['number', '#42', [], 42],
    ['null', '#null', [], null],
    ['boolean', '#true', [], true],
  ])('decodes a %s', (_label, body, slots, expected) => {
    expect(prettifySmallcaps({ body, slots })).toStrictEqual(expected);
  });

  it.each([
    ['remotable', '#"$0"', ['ko12'], '<ko12>'],
    [
      'remotable with iface',
      '#"$0.Alleged: MyObj"',
      ['ko12'],
      '<ko12> (Alleged: MyObj)',
    ],
    ['promise', '#"&0"', ['kp42'], '<kp42>'],
    ['missing slot index', '#"$5"', ['ko1'], '<?5>'],
  ])('replaces a %s slot reference', (_label, body, slots, expected) => {
    expect(prettifySmallcaps({ body, slots })).toBe(expected);
  });

  it.each([
    ['escaped string (!)', '#"!$0"', '$0'],
    ['double escape (!!)', '#"!!hello"', '!hello'],
    ['non-negative bigint (+)', '#"+7"', '7n'],
    ['negative bigint (-)', '#"-7"', '-7n'],
    ['#undefined', '#"#undefined"', '[undefined]'],
    ['#NaN', '#"#NaN"', '[NaN]'],
    ['#Infinity', '#"#Infinity"', '[Infinity]'],
    ['#-Infinity', '#"#-Infinity"', '[-Infinity]'],
    ['symbol (%)', '#"%foo"', '[Symbol: foo]'],
  ])('decodes %s', (_label, body, expected) => {
    expect(prettifySmallcaps({ body, slots: [] })).toBe(expected);
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

  it('leaves non-slot strings unchanged', () => {
    expect(
      prettifySmallcaps({ body: '#{"text":"hello world"}', slots: [] }),
    ).toStrictEqual({ text: 'hello world' });
  });

  it('decodes a tagged value', () => {
    expect(
      prettifySmallcaps({
        body: '#{"#tag":"match:any","payload":"#undefined"}',
        slots: [],
      }),
    ).toStrictEqual({ '[Tagged: match:any]': '[undefined]' });
  });

  it.each([
    ['with name', '#{"#error":"boom","name":"TypeError"}', '[TypeError: boom]'],
    [
      'without name',
      '#{"#error":"something broke"}',
      '[Error: something broke]',
    ],
  ])('decodes an error %s', (_label, body, expected) => {
    expect(prettifySmallcaps({ body, slots: [] })).toBe(expected);
  });

  it('unescapes record keys', () => {
    expect(
      prettifySmallcaps({
        body: '#{"!#foo":"bar","normal":"baz"}',
        slots: [],
      }),
    ).toStrictEqual({ '#foo': 'bar', normal: 'baz' });
  });

  it('throws if body does not start with #', () => {
    expect(() => prettifySmallcaps({ body: '"hello"', slots: [] })).toThrow(
      "Expected body to start with '#'",
    );
  });
});

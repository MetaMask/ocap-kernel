import { describe, it, expect } from 'vitest';

import { prettifyCapData } from './prettify-capdata.ts';

describe('prettifyCapData', () => {
  it('decodes a plain string', () => {
    expect(prettifyCapData({ body: '#"0xca46b9"', slots: [] })).toBe(
      '0xca46b9',
    );
  });

  it('decodes a number', () => {
    expect(prettifyCapData({ body: '#42', slots: [] })).toBe(42);
  });

  it('decodes null', () => {
    expect(prettifyCapData({ body: '#null', slots: [] })).toBeNull();
  });

  it('decodes a boolean', () => {
    expect(prettifyCapData({ body: '#true', slots: [] })).toBe(true);
  });

  it('replaces a remotable slot reference', () => {
    expect(prettifyCapData({ body: '#"$0"', slots: ['ko12'] })).toBe('<ko12>');
  });

  it('replaces a remotable slot reference with interface name', () => {
    expect(
      prettifyCapData({ body: '#"$0.Alleged: MyObj"', slots: ['ko12'] }),
    ).toBe('<ko12> (Alleged: MyObj)');
  });

  it('replaces a promise slot reference', () => {
    expect(prettifyCapData({ body: '#"&0"', slots: ['kp42'] })).toBe('<kp42>');
  });

  it('decodes an object with mixed values', () => {
    expect(
      prettifyCapData({
        body: '#{"name":"$0.Alleged: MyObj","count":42}',
        slots: ['ko12'],
      }),
    ).toStrictEqual({ name: '<ko12> (Alleged: MyObj)', count: 42 });
  });

  it('decodes nested arrays and objects', () => {
    expect(
      prettifyCapData({
        body: '#{"items":["$0","$1"],"meta":{"ref":"&0"}}',
        slots: ['ko1', 'ko2', 'kp3'],
      }),
    ).toStrictEqual({
      items: ['<ko1>', '<ko2>'],
      meta: { ref: '<ko1>' },
    });
  });

  it('leaves non-slot strings unchanged', () => {
    expect(
      prettifyCapData({ body: '#{"text":"hello world"}', slots: [] }),
    ).toStrictEqual({ text: 'hello world' });
  });

  it('handles missing slot index gracefully', () => {
    expect(prettifyCapData({ body: '#"$5"', slots: ['ko1'] })).toBe('<?5>');
  });

  it('throws if body does not start with #', () => {
    expect(() => prettifyCapData({ body: '"hello"', slots: [] })).toThrow(
      "Expected body to start with '#'",
    );
  });
});

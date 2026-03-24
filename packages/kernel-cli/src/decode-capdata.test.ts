import { describe, it, expect } from 'vitest';

import { decodeCapData } from './decode-capdata.ts';

describe('decodeCapData', () => {
  it('decodes a plain string', () => {
    expect(decodeCapData({ body: '#"0xca46b9"', slots: [] })).toBe('0xca46b9');
  });

  it('decodes a number', () => {
    expect(decodeCapData({ body: '#42', slots: [] })).toBe(42);
  });

  it('decodes null', () => {
    expect(decodeCapData({ body: '#null', slots: [] })).toBeNull();
  });

  it('decodes a boolean', () => {
    expect(decodeCapData({ body: '#true', slots: [] })).toBe(true);
  });

  it('replaces a remotable slot reference', () => {
    expect(decodeCapData({ body: '#"$0"', slots: ['ko12'] })).toBe('<ko12>');
  });

  it('replaces a remotable slot reference with interface name', () => {
    expect(
      decodeCapData({ body: '#"$0.Alleged: MyObj"', slots: ['ko12'] }),
    ).toBe('<ko12> (Alleged: MyObj)');
  });

  it('replaces a promise slot reference', () => {
    expect(decodeCapData({ body: '#"&0"', slots: ['kp42'] })).toBe('<kp42>');
  });

  it('decodes an object with mixed values', () => {
    expect(
      decodeCapData({
        body: '#{"name":"$0.Alleged: MyObj","count":42}',
        slots: ['ko12'],
      }),
    ).toStrictEqual({ name: '<ko12> (Alleged: MyObj)', count: 42 });
  });

  it('decodes nested arrays and objects', () => {
    expect(
      decodeCapData({
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
      decodeCapData({ body: '#{"text":"hello world"}', slots: [] }),
    ).toStrictEqual({ text: 'hello world' });
  });

  it('handles missing slot index gracefully', () => {
    expect(decodeCapData({ body: '#"$5"', slots: ['ko1'] })).toBe('<?5>');
  });

  it('throws if body does not start with #', () => {
    expect(() => decodeCapData({ body: '"hello"', slots: [] })).toThrow(
      "Expected body to start with '#'",
    );
  });
});

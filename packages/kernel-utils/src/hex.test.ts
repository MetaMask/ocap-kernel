import { describe, it, expect } from 'vitest';

import { fromHex, toHex } from './hex.ts';

describe('hex utilities', () => {
  describe('toHex', () => {
    it('converts empty array to empty string', () => {
      const result = toHex(new Uint8Array([]));
      expect(result).toBe('');
    });

    it('converts single byte values correctly', () => {
      expect(toHex(new Uint8Array([0]))).toBe('00');
      expect(toHex(new Uint8Array([1]))).toBe('01');
      expect(toHex(new Uint8Array([15]))).toBe('0f');
      expect(toHex(new Uint8Array([16]))).toBe('10');
      expect(toHex(new Uint8Array([255]))).toBe('ff');
    });

    it('pads single-digit hex values with leading zero', () => {
      expect(toHex(new Uint8Array([0]))).toBe('00');
      expect(toHex(new Uint8Array([5]))).toBe('05');
      expect(toHex(new Uint8Array([10]))).toBe('0a');
      expect(toHex(new Uint8Array([15]))).toBe('0f');
    });

    it('does not pad double-digit hex values', () => {
      expect(toHex(new Uint8Array([16]))).toBe('10');
      expect(toHex(new Uint8Array([255]))).toBe('ff');
      expect(toHex(new Uint8Array([170]))).toBe('aa');
    });

    it('converts multi-byte arrays correctly', () => {
      expect(toHex(new Uint8Array([0, 255]))).toBe('00ff');
      expect(toHex(new Uint8Array([1, 2, 3]))).toBe('010203');
      expect(toHex(new Uint8Array([255, 0, 128]))).toBe('ff0080');
    });

    it('converts all byte values correctly', () => {
      const allBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i += 1) {
        allBytes[i] = i;
      }
      const result = toHex(allBytes);
      expect(result).toHaveLength(512); // 256 bytes * 2 hex chars
      expect(result).toMatch(/^[0-9a-f]{512}$/u);
    });

    it('handles large arrays', () => {
      const largeArray = new Uint8Array(1000);
      for (let i = 0; i < 1000; i += 1) {
        largeArray[i] = i % 256;
      }
      const result = toHex(largeArray);
      expect(result).toHaveLength(2000); // 1000 bytes * 2 hex chars
    });
  });

  describe('fromHex', () => {
    it('converts empty string to 32 zero bytes', () => {
      const result = fromHex('');
      expect(result).toHaveLength(32);
      expect(result.every((byte) => byte === 0)).toBe(true);
    });

    it('converts short hex strings and pads with zeros', () => {
      const result = fromHex('ff');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(255);
      expect(result[1]).toBe(0);
      expect(result.slice(1).every((byte) => byte === 0)).toBe(true);
    });

    it('converts single hex digit correctly', () => {
      const result = fromHex('a');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(10); // 0xa = 10
      expect(result.slice(1).every((byte) => byte === 0)).toBe(true);
    });

    it('converts two-character hex strings', () => {
      const result = fromHex('ff00');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(255);
      expect(result[1]).toBe(0);
      expect(result.slice(2).every((byte) => byte === 0)).toBe(true);
    });

    it('converts full 64-character hex string', () => {
      const hexString =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = fromHex(hexString);
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(0x01);
      expect(result[1]).toBe(0x23);
      expect(result[2]).toBe(0x45);
      expect(result[31]).toBe(0xef);
    });

    it('converts various hex values correctly', () => {
      const result = fromHex('00ff80');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(0x00);
      expect(result[1]).toBe(0xff);
      expect(result[2]).toBe(0x80);
      expect(result.slice(3).every((byte) => byte === 0)).toBe(true);
    });

    it('handles odd-length hex strings', () => {
      const result = fromHex('abc');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(0xab);
      expect(result[1]).toBe(0x0c); // 'c' is treated as '0c'
      expect(result.slice(2).every((byte) => byte === 0)).toBe(true);
    });

    it('handles uppercase hex strings', () => {
      const result = fromHex('ABCDEF');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(0xab);
      expect(result[1]).toBe(0xcd);
      expect(result[2]).toBe(0xef);
      expect(result.slice(3).every((byte) => byte === 0)).toBe(true);
    });

    it('handles mixed case hex strings', () => {
      const result = fromHex('aBcD');
      expect(result).toHaveLength(32);
      expect(result[0]).toBe(0xab);
      expect(result[1]).toBe(0xcd);
      expect(result.slice(2).every((byte) => byte === 0)).toBe(true);
    });

    it('handles exactly 64 characters', () => {
      const hexString = 'f'.repeat(64);
      const result = fromHex(hexString);
      expect(result).toHaveLength(32);
      expect(result.every((byte) => byte === 255)).toBe(true);
    });

    it('round-trips correctly with toHex', () => {
      const original = new Uint8Array([0, 1, 255, 128, 42, 16]);
      const hexString = toHex(original);
      const converted = fromHex(hexString);

      // Compare the first bytes (original length)
      expect(converted.slice(0, original.length)).toStrictEqual(original);
      // Rest should be zeros
      expect(converted.slice(original.length).every((byte) => byte === 0)).toBe(
        true,
      );
    });

    it('round-trips full 32-byte array', () => {
      const original = new Uint8Array(32);
      for (let i = 0; i < 32; i += 1) {
        original[i] = i * 8;
      }
      const hexString = toHex(original);
      const converted = fromHex(hexString);
      expect(converted).toStrictEqual(original);
    });
  });
});

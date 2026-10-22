import { describe, expect, it } from 'vitest';

import {
  bytesMatchIntegrity,
  parseIntegrityMetadata,
} from './subresource-integrity.ts';

// The digests of `landed`, which is the body every case below checks against.
const SHA256 = 'eO4Sxl1Ae6BpTfkQxrgVk4v2EZ9yiL1yCkjJjhGvV7w=';
const SHA384 =
  'BzfpFjm8VePMhoplOScWHHmr9mK0pq8+9eMwbLdn/kNNOo/sJuvyFAH8EbfUZ1pz';
const SHA512 =
  '/WP9o53KurTHJ4rql4UaN6JkP9KbZN0hjdcXgkhQUJRrZZJ3YGPrVXQZItUilpNBzTYdAX1qONrclS0/J0JW2A==';
// The same, base64url and unpadded — the spelling a caller may equally write.
const SHA512_URL =
  '_WP9o53KurTHJ4rql4UaN6JkP9KbZN0hjdcXgkhQUJRrZZJ3YGPrVXQZItUilpNBzTYdAX1qONrclS0_J0JW2A';
// A digest of something else: `redirecting`, the body of a redirect hop.
const OTHER_SHA256 = 'etTf+nmjsDY8FN+ggw4Pdq7I90HT0Yr84x9CY6XgiLY=';

const landed = new TextEncoder().encode('landed');

/**
 * Check bytes against metadata as a caller of both functions together does.
 *
 * @param metadata - The integrity metadata to check against.
 * @param bytes - The body to check.
 * @returns Whether the bytes match, or `undefined` where the metadata names no
 * digest to check them against.
 */
const matches = async (
  metadata: string,
  bytes: Uint8Array = landed,
): Promise<boolean | undefined> => {
  const check = parseIntegrityMetadata(metadata);
  return check && (await bytesMatchIntegrity(bytes, check));
};

describe('parseIntegrityMetadata', () => {
  it.each([
    ['the empty metadata that means no digest was asked for', ''],
    ['an algorithm SRI is not defined over', 'md5-1B2M2Y8AsgTpgAmY7PhCfg=='],
    ['an algorithm carrying no digest', 'sha256'],
    ['a name that merely starts like one', 'sha2560-abc'],
    ['whitespace alone', ' \t\n'],
  ])('reads %s as nothing to check', (_case, metadata) => {
    expect(parseIntegrityMetadata(metadata)).toBeUndefined();
  });

  it('reads an algorithm and its digest', () => {
    expect(parseIntegrityMetadata(`sha256-${SHA256}`)).toStrictEqual({
      algorithm: 'SHA-256',
      values: [SHA256],
    });
  });

  it.each([
    ['space', ' '],
    ['tab', '\t'],
    ['newline', '\n'],
    ['form feed', '\f'],
    ['carriage return', '\r'],
  ])('separates digests on a %s', (_name, gap) => {
    expect(
      parseIntegrityMetadata(`sha256-${OTHER_SHA256}${gap}sha256-${SHA256}`),
    ).toStrictEqual({
      algorithm: 'SHA-256',
      values: [OTHER_SHA256, SHA256],
    });
  });

  it.each([
    ['the strongest named last', `sha256-${SHA256} sha512-${SHA512}`],
    ['the strongest named first', `sha512-${SHA512} sha256-${SHA256}`],
    ['all three named', `sha384-${SHA384} sha512-${SHA512} sha256-${SHA256}`],
  ])('keeps only the strongest algorithm with %s', (_case, metadata) => {
    expect(parseIntegrityMetadata(metadata)).toStrictEqual({
      algorithm: 'SHA-512',
      values: [SHA512],
    });
  });

  it('reads past the options SRI defines no use for', () => {
    expect(parseIntegrityMetadata(`sha256-${SHA256}?foo=bar`)).toStrictEqual({
      algorithm: 'SHA-256',
      values: [SHA256],
    });
  });
});

describe('bytesMatchIntegrity', () => {
  it.each([
    ['sha256', `sha256-${SHA256}`],
    ['sha384', `sha384-${SHA384}`],
    ['sha512', `sha512-${SHA512}`],
  ])('matches a %s digest of the bytes', async (_algorithm, metadata) => {
    expect(await matches(metadata)).toBe(true);
  });

  it.each([
    ['base64url', `sha512-${SHA512_URL}`],
    ['unpadded base64', `sha256-${SHA256.replace('=', '')}`],
  ])('matches a digest written as %s', async (_spelling, metadata) => {
    expect(await matches(metadata)).toBe(true);
  });

  it('matches when any digest for the algorithm does', async () => {
    expect(await matches(`sha256-${OTHER_SHA256} sha256-${SHA256}`)).toBe(true);
  });

  it.each([
    ['a digest of other bytes', `sha256-${OTHER_SHA256}`],
    ['a value that is not a digest at all', 'sha256-not-base64'],
    ['a digest of the right length for another algorithm', `sha256-${SHA512}`],
  ])('does not match %s', async (_case, metadata) => {
    expect(await matches(metadata)).toBe(false);
  });

  it('holds the bytes to the strongest algorithm, weaker matches notwithstanding', async () => {
    // Only the sha512 is checked, and it is a digest of something else.
    expect(
      await matches(`sha256-${SHA256} sha512-${OTHER_SHA256.repeat(2)}`),
    ).toBe(false);
  });

  it('does not match bytes for an empty body', async () => {
    expect(await matches(`sha256-${SHA256}`, new Uint8Array())).toBe(false);
  });
});

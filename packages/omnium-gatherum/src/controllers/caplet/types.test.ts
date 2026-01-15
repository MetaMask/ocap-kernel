import { describe, it, expect } from 'vitest';

import {
  isCapletId,
  isSemVer,
  isCapletManifest,
  assertCapletManifest,
} from './types.ts';

describe('isCapletId', () => {
  it.each([
    ['com.example.test', true],
    ['simple', true],
    ['bitcoin-signer', true],
    ['test_caplet', true],
    ['My-Caplet', true],
    ['123', true],
    ['a.b.c.d', true],
  ])('validates "%s" as %s', (value, expected) => {
    expect(isCapletId(value)).toBe(expected);
  });

  it.each([
    ['', false], // Empty
    ['has space', false], // Whitespace
    ['has\ttab', false], // Tab
    ['has\nnewline', false], // Newline
    ['café', false], // Non-ASCII
    ['🎉', false], // Emoji
    [123, false], // Not a string
    [null, false],
    [undefined, false],
    [{}, false],
  ])('rejects %s', (value, expected) => {
    expect(isCapletId(value)).toBe(expected);
  });
});

describe('isSemVer', () => {
  it.each([
    ['1.0.0', true],
    ['0.0.1', true],
    ['10.20.30', true],
    ['1.0.0-alpha', true],
    ['1.0.0-alpha.1', true],
    ['0.0.0', true],
    ['999.999.999', true],
    ['1.2.3-0', true],
  ])('validates "%s" as %s', (value, expected) => {
    expect(isSemVer(value)).toBe(expected);
  });

  it.each([
    ['1.0', false],
    ['1', false],
    ['v1.0.0', false], // No 'v' prefix
    ['1.0.0.0', false],
    ['', false],
    ['not-a-version', false],
    ['1.0.0+build.123', false], // Build metadata not supported (semver strips it)
    ['1.0.0-beta+build', false], // Build metadata not supported
    [123, false],
    [null, false],
    [undefined, false],
  ])('rejects %s', (value, expected) => {
    expect(isSemVer(value)).toBe(expected);
  });
});

describe('isCapletManifest', () => {
  const validManifest = {
    id: 'com.example.test',
    name: 'Test Caplet',
    version: '1.0.0',
    bundleSpec: 'https://example.com/bundle.json',
    requestedServices: ['keyring'],
    providedServices: ['signer'],
  };

  it('validates a complete manifest', () => {
    expect(isCapletManifest(validManifest)).toBe(true);
  });

  it('validates a manifest with empty service arrays', () => {
    const manifest = {
      ...validManifest,
      requestedServices: [],
      providedServices: [],
    };
    expect(isCapletManifest(manifest)).toBe(true);
  });

  it('rejects manifest with invalid id', () => {
    expect(isCapletManifest({ ...validManifest, id: 'has space' })).toBe(false);
  });

  it('rejects manifest with invalid version', () => {
    expect(isCapletManifest({ ...validManifest, version: '1.0' })).toBe(false);
  });

  it('rejects manifest missing required field', () => {
    const { name: _name, ...missingName } = validManifest;
    expect(isCapletManifest(missingName)).toBe(false);
  });

  it('rejects null', () => {
    expect(isCapletManifest(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isCapletManifest('string')).toBe(false);
  });
});

describe('assertCapletManifest', () => {
  const validManifest = {
    id: 'com.example.test',
    name: 'Test Caplet',
    version: '1.0.0',
    bundleSpec: 'https://example.com/bundle.json',
    requestedServices: [],
    providedServices: [],
  };

  it('does not throw for valid manifest', () => {
    expect(() => assertCapletManifest(validManifest)).not.toThrow();
  });

  it('throws for invalid manifest', () => {
    expect(() => assertCapletManifest({ id: '' })).toThrow(
      'Invalid CapletManifest',
    );
  });

  it('throws for null', () => {
    expect(() => assertCapletManifest(null)).toThrow('Invalid CapletManifest');
  });
});

import '@ocap/test-utils/mock-endoify';
import { describe, expect, it } from 'vitest';

import { isValidBundleUrl } from './utils.js';

describe('isValidBundleUrl', () => {
  it.each([
    ['http://example.com/file.bundle', true, 'valid HTTP URL with .bundle'],
    [
      'https://example.com/path/file.bundle',
      true,
      'valid HTTPS URL with path and .bundle',
    ],
    [
      'http://localhost:3000/file.bundle',
      true,
      'valid localhost URL with port',
    ],
    ['file:///path/to/file.bundle', true, 'valid file URL'],
    ['', false, 'empty string'],
    [undefined, false, 'undefined input'],
    ['not-a-url', false, 'invalid URL format'],
    ['http://example.com/file', false, 'missing .bundle extension'],
    ['http://example.com/file.BUNDLE', true, 'uppercase .BUNDLE extension'],
    ['http://example.com/file.bundle/', false, 'trailing slash after .bundle'],
    [
      'http://example.com/bundle/file',
      false,
      'bundle in path but not extension',
    ],
    [
      'http://example.com/file.bundle?param=value',
      true,
      'query parameters after .bundle',
    ],
    ['http://example.com/file.bundle#hash', true, 'hash after .bundle'],
    [
      'https://example.com/path/to/my-vat.bundle',
      true,
      'complex path with hyphens',
    ],
    ['https://subdomain.example.com/file.bundle', true, 'URL with subdomain'],
  ] as const)('%s -> %s (%s)', (input, expected, _description) => {
    expect(isValidBundleUrl(input)).toBe(expected);
  });
});

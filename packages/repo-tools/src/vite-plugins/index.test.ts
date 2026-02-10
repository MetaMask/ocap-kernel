import { describe, expect, it } from 'vitest';

import * as indexModule from './index.ts';

describe('index', () => {
  it('has the expected exports', () => {
    // VatBundle is a type-only export, not visible at runtime
    expect(Object.keys(indexModule).sort()).toStrictEqual([
      'bundleVat',
      'bundleVats',
      'deduplicateAssets',
      'extensionDev',
      'htmlTrustedPrelude',
      'jsTrustedPrelude',
      'moveHtmlFilesToRoot',
      'watchInternalPackages',
    ]);
  });
});

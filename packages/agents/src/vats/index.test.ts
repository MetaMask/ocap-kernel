import { describe, it, expect } from 'vitest';

import { getBundleSpec } from './index.ts';

describe('getBundleSpec', () => {
  it.each(['ollama', 'user'])(
    'should return a valid bundle spec for %s',
    (bundleName) => {
      const bundleSpec = getBundleSpec(bundleName);
      expect(typeof bundleSpec).toBe('string');
      expect(bundleSpec).toMatch(/^file:\/\//u);
      expect(bundleSpec).toMatch(new RegExp(`${bundleName}\\.bundle$`, 'u'));
    },
  );
});

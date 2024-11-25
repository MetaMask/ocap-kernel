import { describe, it, expect } from 'vitest';

import { getTestBundles } from '../test/bundles.js';
import { exists } from '../test/file.js';

describe('[meta]', async () => {
  const { testBundleNames, testBundleSpecs } = await getTestBundles();

  it('at least one test bundle is configured', () => {
    expect(testBundleNames.length).toBeGreaterThan(0);
  });

  it.each(testBundleSpecs)(
    'test bundles have expectations: $script',
    async ({ expected }) => {
      expect(await exists(expected)).toBe(true);
    },
  );
});

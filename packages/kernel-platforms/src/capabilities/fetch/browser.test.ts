import { describe, expect, it, vi, beforeEach } from 'vitest';

import { capabilityFactory } from './browser.ts';
import type { FetchConfig } from './types.ts';

describe('fetch browser capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('capabilityFactory', () => {
    it('creates fetch capability', () => {
      const config: FetchConfig = { allowedHosts: ['example.test'] };
      const fetchCapability = capabilityFactory(config);

      expect(typeof fetchCapability).toBe('function');
    });
  });
});

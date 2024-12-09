import '@ocap/shims/endoify';
import { delay } from '@ocap/utils';
import { describe, it, expect } from 'vitest';

import { withTimeout } from './utils.js';

describe('utils', async () => {
  describe('withTimeout', () => {
    it('times out within the specified duration', async () => {
      const duration = 300;
      const delta = 100;
      const timeout = withTimeout(new Promise(() => undefined), duration);
      await delay(duration + delta);
      await expect(async () => await timeout).rejects.toThrow(/timed out/u);
    });
  });
});

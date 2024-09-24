import { describe, expect, it } from 'vitest';

import { makeDoneKit } from './done.js';

describe('makeDoneKit', () => {
  describe('setDone', () => {
    it('is idempotent', async () => {
      let count = 0;
      const { setDone } = makeDoneKit(async () => {
        count += 1;
      });
      await setDone();
      await setDone();
      expect(count).toBe(1);
    });
  });

  describe('onDone', () => {
    it('is optional', () => {
      expect(makeDoneKit).not.toThrow();
    });
  });
});

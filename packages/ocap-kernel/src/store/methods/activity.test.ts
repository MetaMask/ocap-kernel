import { describe, it, expect } from 'vitest';

import { getActivityMethods } from './activity.ts';
import { makeMapKVStore } from '../../../test/storage.ts';

describe('getActivityMethods', () => {
  describe('detectWake', () => {
    it('returns false when no lastActiveTime exists', () => {
      const kv = makeMapKVStore();
      const { detectWake } = getActivityMethods(kv);

      expect(detectWake()).toBe(false);
    });

    it('returns true when gap exceeds threshold', () => {
      const kv = makeMapKVStore();
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1_000;
      kv.set('lastActiveTime', String(twoHoursAgo));

      const { detectWake } = getActivityMethods(kv);

      expect(detectWake()).toBe(true);
    });

    it('returns false when gap is within threshold', () => {
      const kv = makeMapKVStore();
      const tenMinutesAgo = Date.now() - 10 * 60 * 1_000;
      kv.set('lastActiveTime', String(tenMinutesAgo));

      const { detectWake } = getActivityMethods(kv);

      expect(detectWake()).toBe(false);
    });

    it('records current time as lastActiveTime after detection', () => {
      const kv = makeMapKVStore();

      const { detectWake } = getActivityMethods(kv);

      const before = Date.now();
      detectWake();
      const after = Date.now();

      const stored = kv.get('lastActiveTime');
      expect(stored).toBeDefined();
      const timestamp = Number(stored);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('returns false when lastActiveTime is corrupted', () => {
      const kv = makeMapKVStore();
      kv.set('lastActiveTime', 'not-a-number');

      const { detectWake } = getActivityMethods(kv);

      expect(detectWake()).toBe(false);
    });

    it('returns false on second call after wake detection', () => {
      const kv = makeMapKVStore();
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1_000;
      kv.set('lastActiveTime', String(twoHoursAgo));

      const { detectWake } = getActivityMethods(kv);

      expect(detectWake()).toBe(true);
      // Second call should see the freshly written timestamp
      expect(detectWake()).toBe(false);
    });
  });

  describe('recordLastActiveTime', () => {
    it('records current time as lastActiveTime', () => {
      const kv = makeMapKVStore();
      const { recordLastActiveTime } = getActivityMethods(kv);

      const before = Date.now();
      recordLastActiveTime();
      const after = Date.now();

      const stored = kv.get('lastActiveTime');
      expect(stored).toBeDefined();
      const timestamp = Number(stored);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('overwrites previous lastActiveTime', () => {
      const kv = makeMapKVStore();
      kv.set('lastActiveTime', '12345');

      const { recordLastActiveTime } = getActivityMethods(kv);
      recordLastActiveTime();

      expect(Number(kv.get('lastActiveTime'))).not.toBe(12345);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getPinMethods } from './pinned.ts';
import { getRefCountMethods } from './refcount.ts';

// Mock the dependencies
vi.mock('./refcount.ts', () => ({
  getRefCountMethods: vi.fn(),
}));

describe('getPinMethods', () => {
  const mockKv = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  const mockIncrementRefCount = vi.fn();
  const mockDecrementRefCount = vi.fn();
  let methods: ReturnType<typeof getPinMethods>;

  beforeEach(() => {
    vi.resetAllMocks();
    (getRefCountMethods as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        incrementRefCount: mockIncrementRefCount,
        decrementRefCount: mockDecrementRefCount,
      },
    );
    mockKv.get.mockImplementation((key) => {
      if (key === 'pinnedObjects') {
        return 'ko1,ko2,ko3';
      }
      return undefined;
    });
    // @ts-expect-error - We don't need to provide a full StoreContext for testing
    methods = getPinMethods({ kv: mockKv });
  });

  describe('pinObject', () => {
    it('should pin an object by adding it to the pinned objects list', () => {
      methods.pinObject('ko4');
      expect(mockIncrementRefCount).toHaveBeenCalledWith('ko4', 'pin');
      expect(mockKv.set).toHaveBeenCalledWith(
        'pinnedObjects',
        'ko1,ko2,ko3,ko4',
      );
    });

    it('should not pin an already pinned object', () => {
      methods.pinObject('ko2');
      expect(mockIncrementRefCount).not.toHaveBeenCalled();
      expect(mockKv.set).not.toHaveBeenCalled();
    });
  });

  describe('unpinObject', () => {
    it('should unpin an object by removing it from the pinned objects list', () => {
      methods.unpinObject('ko2');
      expect(mockDecrementRefCount).toHaveBeenCalledWith('ko2', 'unpin');
      expect(mockKv.set).toHaveBeenCalledWith('pinnedObjects', 'ko1,ko3');
    });

    it('should not unpin an object that is not pinned', () => {
      methods.unpinObject('ko4');
      expect(mockDecrementRefCount).not.toHaveBeenCalled();
      expect(mockKv.set).not.toHaveBeenCalled();
    });
  });

  describe('getPinnedObjects', () => {
    it('should return all pinned objects', () => {
      const pinnedObjects = methods.getPinnedObjects();
      expect(pinnedObjects).toStrictEqual(['ko1', 'ko2', 'ko3']);
    });

    it('should return an empty array if no objects are pinned', () => {
      mockKv.get.mockReturnValue('');
      const pinnedObjects = methods.getPinnedObjects();
      expect(pinnedObjects).toStrictEqual([]);
    });
  });

  describe('isObjectPinned', () => {
    it('should return true if the object is pinned', () => {
      const isPinned = methods.isObjectPinned('ko2');
      expect(isPinned).toBe(true);
    });

    it('should return false if the object is not pinned', () => {
      const isPinned = methods.isObjectPinned('ko4');
      expect(isPinned).toBe(false);
    });
  });
});

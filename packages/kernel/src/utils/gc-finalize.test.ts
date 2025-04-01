import { delay } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { makeGCAndFinalize } from './gc-finalize.ts';

const gcAndFinalize = makeGCAndFinalize();

describe('Garbage Collection', () => {
  it('should clean up unreachable objects', async () => {
    // Set up a WeakRef to track an object
    let obj = { test: 'value' };
    const weakRef = new WeakRef(obj);
    expect(weakRef.deref()).toBe(obj);
    // @ts-expect-error - Remove the reference to the object
    obj = null;
    expect(weakRef.deref()).toBeDefined();
    await gcAndFinalize();
    expect(weakRef.deref()).toBeUndefined();
  });

  it('should trigger FinalizationRegistry callbacks', async () => {
    // Set up a finalization registry with a callback
    const finalizationCallback = vi.fn();
    const registry = new FinalizationRegistry(finalizationCallback);
    // Register an object for finalization
    let obj = { test: 'finalize me' };
    registry.register(obj, 'test token');
    // Remove reference to the object
    // @ts-expect-error - Null assignment
    obj = null;
    // Trigger garbage collection
    await gcAndFinalize();
    // Wait a bit more to ensure finalization callbacks run
    await delay(50);
    // The callback should have been called at least once
    expect(finalizationCallback).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    // Create a custom implementation with a failing GC function
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(vi.fn());
    const mockGcFunction = vi.fn().mockImplementation(() => {
      throw new Error('GC failed');
    });
    // Mock globalThis.gc
    const originalGc = globalThis.gc;
    globalThis.gc = mockGcFunction;
    // Create a new gcAndFinalize with our mocked environment
    const customGcAndFinalize = makeGCAndFinalize();
    // Should not throw despite GC failing
    expect(await customGcAndFinalize()).toBeUndefined();
    // Should log warning
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'GC operation failed:',
      expect.any(Error),
    );
    // Restore original gc
    // Using Object.defineProperty to avoid race condition
    Object.defineProperty(globalThis, 'gc', {
      value: originalGc,
      writable: true,
      configurable: true,
    });
    consoleWarnSpy.mockRestore();
  });

  it('should run multiple GC passes', async () => {
    // Mock the GC function to verify multiple calls
    const mockGcFunction = vi.fn();
    // Mock globalThis.gc
    const originalGc = globalThis.gc;
    globalThis.gc = mockGcFunction;
    // Create a new gcAndFinalize with our mocked environment
    const customGcAndFinalize = makeGCAndFinalize();
    await customGcAndFinalize();
    // Should call GC function twice
    expect(mockGcFunction).toHaveBeenCalledTimes(2);
    // Restore original gc
    Object.defineProperty(globalThis, 'gc', {
      value: originalGc,
      writable: true,
      configurable: true,
    });
  });

  it('should work with circular references', async () => {
    // Create objects with circular references
    type CircularObj = { name: string; ref: CircularObj | null };
    const objA: CircularObj = { name: 'A', ref: null };
    let objB: CircularObj = { name: 'B', ref: null };
    objA.ref = objB;
    objB.ref = objA;
    // Create a weak reference to track objB
    const weakRef = new WeakRef(objB);
    expect(weakRef.deref()).toBe(objB);
    // Break circular reference and remove our reference
    objA.ref = null;
    // @ts-expect-error - Null assignment
    objB = null;
    expect(weakRef.deref()).toBeDefined();
    await gcAndFinalize();
    expect(weakRef.deref()).toBeUndefined();
  });
});

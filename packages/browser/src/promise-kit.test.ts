import { makePromiseKitMock } from '@ocap/test-utils';
import { vi, describe, it, beforeAll, expect, afterEach, beforeEach } from 'vitest';

declare global {
 var jest: {};
}

vi.mock('@endo/promise-kit', () => makePromiseKitMock());
    
describe('promise-kit', () => {
  const expectedMockImpl: string = `
  () => {
    let resolve, reject;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    return { promise, resolve, reject };
  }
  `.trim();

  beforeAll(() => {
    vi.useFakeTimers();

    const _jest = globalThis.jest;
  
    globalThis.jest = {
      ...globalThis.jest,
      advanceTimersByTime: vi.advanceTimersByTime.bind(vi)
    };
  
    return () => void (globalThis.jest = _jest);
  });

  beforeEach(() => {
    vi.resetModules();
  })

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grabs the expected kit from mock factory', () => {
    const { makePromiseKit } = makePromiseKitMock();
    expect(makePromiseKit.toString()).toStrictEqual(expectedMockImpl);
  });

  it('can mock the call from a directly mocked import', async () => {
    vi.doMock('@endo/promise-kit', () => makePromiseKitMock());
    const { makePromiseKit } = await import('@endo/promise-kit');
    expect(makePromiseKit.toString()).toStrictEqual(expectedMockImpl);
  });

  it('mocks with the default __mocks__ implemenation', async () => {
    vi.doMock('@endo/promise-kit');
    const { makePromiseKit } = await import('@endo/promise-kit');
    expect(makePromiseKit.toString()).toStrictEqual(expectedMockImpl);
  });

  it('can mock the call from a transitively mocked import', async () => {
    vi.resetModules();
    vi.doMock('@endo/promise-kit', () => makePromiseKitMock());
    const { makePromiseKit } = await import('./promise-kit.js');
    expect(makePromiseKit.toString()).toStrictEqual(expectedMockImpl);
  })

  it('is mocked by vi.mock', async ({ expect }) => {
    console.log('TEST LOG');
    const { makePromiseKit } = await import('@endo/promise-kit');
    console.log('makePromiseKit:', makePromiseKit.toString());
    const { delayedDecision } = await import('./promise-kit.js') as {
      delayedDecision: (args: boolean) => Promise<void>;
    };
    const decision = delayedDecision(true);
    expect(decision).toBeInstanceOf(Promise);
    await Promise.all([
      vi.advanceTimersToNextTimerAsync(),
      decision,
    ]);
    expect(true).toBe(true);
  });
});

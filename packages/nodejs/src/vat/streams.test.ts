import '@ocap/repo-tools/test-utils/mock-endoify';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const synchronize = vi.fn().mockResolvedValue(true);

  return {
    synchronize,
    NodeWorkerDuplexStream: vi.fn(() => ({ synchronize })),
    split: vi.fn((a) => [a, a]),
    parentPort: {},
  };
});

const doMockParentPort = (value: unknown): void => {
  vi.doMock('node:worker_threads', () => ({
    parentPort: value,
  }));
};

vi.mock('@metamask/streams', () => ({
  NodeWorkerDuplexStream: mocks.NodeWorkerDuplexStream,
  split: mocks.split,
}));

describe('vat/streams', () => {
  beforeEach(vi.resetModules);

  describe('getPort', () => {
    it('returns a port', async () => {
      doMockParentPort(mocks.parentPort);
      vi.resetModules();

      const { getPort } = await import('./streams.ts');
      const port = getPort();

      expect(port).toStrictEqual(mocks.parentPort);
    }, 10_000);

    it('throws if parentPort is not defined', async () => {
      doMockParentPort(undefined);
      vi.resetModules();

      const { getPort } = await import('./streams.ts');

      expect(getPort).toThrow(/parentPort/u);
    }, 10_000);
  });

  describe('makeStreams', () => {
    it('returns two NodeWorkerDuplexStreams', async () => {
      doMockParentPort(mocks.parentPort);
      vi.resetModules();

      const { makeStreams } = await import('./streams.ts');
      const { kernelStream, loggerStream } = await makeStreams();

      expect(kernelStream).toHaveProperty('synchronize', mocks.synchronize);
      expect(loggerStream).toHaveProperty('synchronize', mocks.synchronize);
    });
  });
});

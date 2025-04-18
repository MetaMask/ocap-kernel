import '@ocap/test-utils/mock-endoify';

import { describe, expect, it, vi } from 'vitest';

const doMockParentPort = (value: unknown): void => {
  vi.doMock('node:worker_threads', () => ({
    parentPort: value,
  }));
  vi.resetModules();
};

vi.mock('@ocap/streams', () => ({
  NodeWorkerDuplexStream: vi.fn(),
}));

describe('getPort', () => {
  it('returns a port', async () => {
    const mockParentPort = {};
    doMockParentPort(mockParentPort);

    const { getPort } = await import('./streams.ts');
    const port = getPort();

    expect(port).toStrictEqual(mockParentPort);
  }, 4000); // Extra time is needed when running yarn test from monorepo root.

  it('throws if parentPort is not defined', async () => {
    doMockParentPort(undefined);

    const { getPort } = await import('./streams.ts');

    expect(getPort).toThrow(/parentPort/u);
  });
});

describe('makeKernelStream', () => {
  it('returns a NodeWorkerDuplexStream', async () => {
    doMockParentPort(new MessageChannel().port1);

    const { NodeWorkerDuplexStream } = await import('@ocap/streams');
    const { makeKernelStream } = await import('./streams.ts');
    const kernelStream = makeKernelStream();
    expect(kernelStream).toBeInstanceOf(NodeWorkerDuplexStream);
  });
});

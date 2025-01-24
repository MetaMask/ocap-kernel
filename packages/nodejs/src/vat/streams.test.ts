import '@ocap/test-utils/mock-endoify';

import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const doMockParentPort = (value: unknown) => {
  vi.doMock('node:worker_threads', () => ({
    parentPort: value,
  }));
  vi.resetModules();
};

vi.mock('@ocap/kernel', async () => {
  return { isVatCommand: vi.fn(() => true) };
});

vi.mock('@ocap/streams', () => ({
  NodeWorkerDuplexStream: vi.fn(),
}));

describe('getPort', () => {
  it('returns a port', async () => {
    const mockParentPort = {};
    doMockParentPort(mockParentPort);

    const { getPort } = await import('./streams.js');
    const port = getPort();

    expect(port).toStrictEqual(mockParentPort);
  }, 4000); // Extra time is needed when running yarn test from monorepo root.

  it('throws if parentPort is not defined', async () => {
    doMockParentPort(undefined);

    const { getPort } = await import('./streams.js');

    expect(getPort).toThrow(/parentPort/u);
  });
});

describe('makeCommandStream', () => {
  it('returns a NodeWorkerDuplexStream', async () => {
    doMockParentPort(new MessageChannel().port1);

    const { NodeWorkerDuplexStream } = await import('@ocap/streams');
    const { makeCommandStream } = await import('./streams.js');
    const commandStream = makeCommandStream();
    expect(commandStream).toBeInstanceOf(NodeWorkerDuplexStream);
  });
});

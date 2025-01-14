import '@ocap/shims/endoify';

import { describe, expect, it, vi } from 'vitest';

describe('getPort', () => {
  it('returns a port', async () => {
    const mockParentPort = {};
    vi.doMock('node:worker_threads', () => ({
      parentPort: mockParentPort,
    }));
    vi.resetModules();

    const { getPort } = await import('./make-multiplexer.js');

    const port = getPort();

    expect(port).toStrictEqual(mockParentPort);
  });

  it('throws if parentPort is not defined', async () => {
    vi.doMock('node:worker_threads', () => ({
      parentPort: undefined,
    }));
    vi.resetModules();

    const { getPort } = await import('./make-multiplexer.js');

    expect(getPort).toThrow(/parentPort/u);
  });
});

describe('makeMultiplexer', () => {
  it('returns a NodeWorkerMultiplexer', async () => {
    vi.doMock('node:worker_threads', () => ({
      parentPort: new MessageChannel().port1,
    }));
    vi.resetModules();
    const { NodeWorkerMultiplexer } = await import('@ocap/streams');
    const { makeMultiplexer } = await import('./make-multiplexer.js');
    const multiplexer = makeMultiplexer('v0');
    expect(multiplexer).toBeInstanceOf(NodeWorkerMultiplexer);
  });
});

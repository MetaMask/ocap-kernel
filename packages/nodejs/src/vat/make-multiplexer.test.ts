import '@ocap/shims/endoify';

import { describe, expect, it, vi } from 'vitest';

import type {
  getPort as getPortImpl,
  makeMultiplexer as makeMultiplexerImpl,
} from './make-multiplexer.js';

type GetPort = typeof getPortImpl;
type MakeMultiplexer = typeof makeMultiplexerImpl;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const doMockParentPort = (value: unknown) => {
  vi.doMock('node:worker_threads', () => ({
    parentPort: value,
  }));
  vi.resetModules();
};

describe('getPort', () => {
  it(
    'returns a port',
    async () => {
      const mockParentPort = {};
      doMockParentPort(mockParentPort);

      const { getPort } = await vi.importActual('./make-multiplexer.js');
      const port = (getPort as GetPort)();

      expect(port).toStrictEqual(mockParentPort);
    },
    {
      // Extra time is needed when running yarn test from monorepo root.
      timeout: 5000,
    },
  );

  it('throws if parentPort is not defined', async () => {
    doMockParentPort(undefined);

    const { getPort } = await vi.importActual('./make-multiplexer.js');

    expect(getPort).toThrow(/parentPort/u);
  });
});

describe('makeMultiplexer', () => {
  it('returns a NodeWorkerMultiplexer', async () => {
    doMockParentPort(new MessageChannel().port1);
    const { NodeWorkerMultiplexer } = await vi.importActual('@ocap/streams');
    const { makeMultiplexer } = await vi.importActual('./make-multiplexer.js');
    const multiplexer = (makeMultiplexer as MakeMultiplexer)();
    expect(multiplexer).toBeInstanceOf(NodeWorkerMultiplexer);
  });
});

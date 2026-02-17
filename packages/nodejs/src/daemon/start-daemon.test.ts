import { vi, describe, it, expect, afterEach } from 'vitest';

import { startDaemon } from './start-daemon.ts';
import type { DaemonHandle } from './start-daemon.ts';

// Mock makeKernel to avoid real kernel creation
vi.mock('../kernel/make-kernel.ts', () => ({
  makeKernel: vi.fn().mockResolvedValue({
    initIdentity: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getSystemSubclusterRoot: vi.fn().mockReturnValue('ko-root'),
    queueMessage: vi.fn().mockResolvedValue({ body: '"d-1"', slots: [] }),
  }),
}));

// Mock kunser to deserialise the capdata returned by queueMessage
vi.mock('@metamask/ocap-kernel', async () => {
  const actual = await vi.importActual<typeof import('@metamask/ocap-kernel')>(
    '@metamask/ocap-kernel',
  );
  return { ...actual, kunser: vi.fn().mockReturnValue('d-1') };
});

// Mock filesystem operations
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

describe('startDaemon', () => {
  let handle: DaemonHandle | undefined;

  afterEach(async () => {
    if (handle) {
      const toClose = handle;
      handle = undefined;
      await toClose.close();
    }
  });

  it('creates kernel with IO-based system subcluster config', async () => {
    const { makeKernel } = await import('../kernel/make-kernel.ts');
    const mockedMakeKernel = vi.mocked(makeKernel);

    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      systemConsoleBundleSpec: 'http://localhost/bundle',
      systemConsoleName: 'my-console',
      socketPath: tmpSocket,
    });

    expect(mockedMakeKernel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemSubclusters: [
          {
            name: 'my-console',
            config: {
              bootstrap: 'my-console',
              io: {
                console: {
                  type: 'socket',
                  path: tmpSocket,
                },
              },
              services: ['kernelFacet', 'console'],
              vats: {
                'my-console': {
                  bundleSpec: 'http://localhost/bundle',
                  parameters: { name: 'my-console' },
                },
              },
            },
          },
        ],
      }),
    );
  });

  it('returns socket path, selfRef, and close function', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      systemConsoleBundleSpec: 'http://localhost/bundle',
      socketPath: tmpSocket,
    });

    expect(handle.socketPath).toBe(tmpSocket);
    expect(handle.selfRef).toBe('d-1');
    expect(typeof handle.close).toBe('function');
    expect(handle.kernel).toBeDefined();
  });

  it('issues a self-ref via getSystemSubclusterRoot and queueMessage', async () => {
    const { makeKernel } = await import('../kernel/make-kernel.ts');
    const mockedMakeKernel = vi.mocked(makeKernel);

    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      systemConsoleBundleSpec: 'http://localhost/bundle',
      systemConsoleName: 'my-console',
      socketPath: tmpSocket,
    });

    const mockKernel = await mockedMakeKernel.mock.results[0]!.value;
    expect(mockKernel.getSystemSubclusterRoot).toHaveBeenCalledWith(
      'my-console',
    );
    expect(mockKernel.queueMessage).toHaveBeenCalledWith(
      'ko-root',
      'issueRef',
      ['ko-root', true],
    );
  });

  it('calls kernel.stop on close', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      systemConsoleBundleSpec: 'http://localhost/bundle',
      socketPath: tmpSocket,
    });

    const { stop } = handle.kernel;
    const toClose = handle;
    handle = undefined;
    await toClose.close();

    expect(stop).toHaveBeenCalled();
  });
});

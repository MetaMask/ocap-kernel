import { vi, describe, it, expect, afterEach } from 'vitest';

import { startDaemon } from './start-daemon.ts';
import type { DaemonHandle } from './start-daemon.ts';

// Mock makeKernel to avoid real kernel creation
vi.mock('../kernel/make-kernel.ts', () => ({
  makeKernel: vi.fn().mockResolvedValue({
    initIdentity: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }),
}));

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

  it('returns socket path and close function', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      systemConsoleBundleSpec: 'http://localhost/bundle',
      socketPath: tmpSocket,
    });

    expect(handle.socketPath).toBe(tmpSocket);
    expect(typeof handle.close).toBe('function');
    expect(handle.kernel).toBeDefined();
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

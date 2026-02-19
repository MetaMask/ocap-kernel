import { vi, describe, it, expect, afterEach } from 'vitest';

import { startDaemon } from './start-daemon.ts';
import type { DaemonHandle } from './start-daemon.ts';

const { mockRpcServerClose } = vi.hoisted(() => ({
  mockRpcServerClose: vi.fn().mockResolvedValue(undefined),
}));

// Mock RPC socket server to avoid real socket creation
vi.mock('./rpc-socket-server.ts', () => ({
  startRpcSocketServer: vi.fn().mockResolvedValue({
    close: mockRpcServerClose,
  }),
}));

const mockKernel = {
  stop: vi.fn().mockResolvedValue(undefined),
};

const mockKernelDatabase = {
  executeQuery: vi.fn().mockReturnValue([]),
};

describe('startDaemon', () => {
  let handle: DaemonHandle | undefined;

  afterEach(async () => {
    if (handle) {
      const toClose = handle;
      handle = undefined;
      await toClose.close();
    }
    vi.clearAllMocks();
  });

  it('starts RPC socket server with kernel and database', async () => {
    const { startRpcSocketServer } = await import('./rpc-socket-server.ts');
    const mockedStartRpc = vi.mocked(startRpcSocketServer);

    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      socketPath: tmpSocket,
      kernel: mockKernel as never,
      kernelDatabase: mockKernelDatabase as never,
    });

    expect(mockedStartRpc).toHaveBeenCalledWith({
      socketPath: tmpSocket,
      kernel: mockKernel,
      kernelDatabase: mockKernelDatabase,
    });
  });

  it('returns socket path, kernel, and close function', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      socketPath: tmpSocket,
      kernel: mockKernel as never,
      kernelDatabase: mockKernelDatabase as never,
    });

    expect(handle.socketPath).toBe(tmpSocket);
    expect(handle.kernel).toBe(mockKernel);
    expect(typeof handle.close).toBe('function');
  });

  it('closes RPC server and stops kernel on close', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon({
      socketPath: tmpSocket,
      kernel: mockKernel as never,
      kernelDatabase: mockKernelDatabase as never,
    });

    const toClose = handle;
    handle = undefined;
    await toClose.close();

    expect(mockRpcServerClose).toHaveBeenCalled();
    expect(mockKernel.stop).toHaveBeenCalled();
  });
});

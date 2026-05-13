import { vi, describe, it, expect, afterEach } from 'vitest';

import { startDaemon } from './start-daemon.ts';
import type { DaemonHandle } from './start-daemon.ts';

const { mockRpcServerClose, mockStreamServerClose } = vi.hoisted(() => ({
  mockRpcServerClose: vi.fn().mockResolvedValue(undefined),
  mockStreamServerClose: vi.fn().mockResolvedValue(undefined),
}));

// Mock socket servers to avoid real socket creation
vi.mock('./rpc-socket-server.ts', () => ({
  startRpcSocketServer: vi.fn().mockResolvedValue({
    close: mockRpcServerClose,
  }),
}));
vi.mock('./stream-socket-server.ts', () => ({
  startStreamSocketServer: vi.fn().mockResolvedValue({
    close: mockStreamServerClose,
  }),
}));

const mockKernel = {
  stop: vi.fn().mockResolvedValue(undefined),
};

const mockKernelDatabase = {
  executeQuery: vi.fn().mockReturnValue([]),
};

const mockChannelFactory = {
  createChannel: vi.fn().mockResolvedValue('ocap://test'),
};

const mockSessionRegistry = {
  createSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn().mockReturnValue([]),
  getChannelByUrl: vi.fn(),
};

const makeTestOptions = (socketPath: string) => ({
  socketPath,
  streamSocketPath: `${socketPath}-stream`,
  kernel: mockKernel as never,
  kernelDatabase: mockKernelDatabase as never,
  channelFactory: mockChannelFactory,
  sessionRegistry: mockSessionRegistry,
});

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

    handle = await startDaemon(makeTestOptions(tmpSocket));

    expect(mockedStartRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        socketPath: tmpSocket,
        kernel: mockKernel,
        kernelDatabase: mockKernelDatabase,
        channelFactory: mockChannelFactory,
        sessionRegistry: mockSessionRegistry,
      }),
    );
  });

  it('returns socket path, kernel, and close function', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon(makeTestOptions(tmpSocket));

    expect(handle.socketPath).toBe(tmpSocket);
    expect(handle.kernel).toBe(mockKernel);
    expect(typeof handle.close).toBe('function');
  });

  it('closes both servers and stops kernel on close', async () => {
    const tmpSocket = `/tmp/daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`;

    handle = await startDaemon(makeTestOptions(tmpSocket));

    const toClose = handle;
    handle = undefined;
    await toClose.close();

    expect(mockRpcServerClose).toHaveBeenCalled();
    expect(mockStreamServerClose).toHaveBeenCalled();
    expect(mockKernel.stop).toHaveBeenCalled();
  });
});

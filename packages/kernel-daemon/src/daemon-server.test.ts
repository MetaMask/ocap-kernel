import { Logger } from '@metamask/logger';
import { createServer } from 'node:net';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createDaemonServer } from './daemon-server.ts';
import type { RpcDispatcher } from './daemon-server.ts';

vi.mock('node:net', () => ({
  createServer: vi.fn(),
}));

describe('createDaemonServer', () => {
  const mockServer = {
    listen: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(createServer).mockReturnValue(mockServer as never);
  });

  it('creates a server and listens on the socket file', () => {
    const rpcDispatcher: RpcDispatcher = {
      assertHasMethod: vi.fn(),
      execute: vi.fn(),
    };
    const logger = new Logger('test');
    const onShutdown = vi.fn();

    const server = createDaemonServer({
      rpcDispatcher,
      logger,
      onShutdown,
    });

    expect(createServer).toHaveBeenCalled();
    expect(server).toBe(mockServer);
    expect(mockServer.listen).toHaveBeenCalled();
  });
});

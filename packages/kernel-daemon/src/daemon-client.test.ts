import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { connectToDaemon, sendShutdown } from './daemon-client.ts';

vi.mock('@metamask/kernel-rpc-methods', () => {
  const MockRpcClient = vi.fn();
  MockRpcClient.prototype.handleResponse = vi.fn();
  MockRpcClient.prototype.call = vi.fn();
  return { RpcClient: MockRpcClient };
});

vi.mock('node:net', () => ({
  createConnection: vi.fn(),
}));

const makeMockSocket = () => {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    removeAllListeners: vi.fn(),
  });
};

const mockMethodSpecs = {
  getStatus: { method: 'getStatus' },
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('daemon-client', () => {
  let mockSocket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    mockSocket = makeMockSocket();
    vi.mocked(createConnection).mockReturnValue(mockSocket as never);
  });

  describe('connectToDaemon', () => {
    it('resolves with a daemon connection on successful connect', async () => {
      const connectionPromise = connectToDaemon(
        mockMethodSpecs,
        mockLogger as never,
      );
      mockSocket.emit('connect');
      const connection = await connectionPromise;

      expect(connection.client).toBeDefined();
      expect(connection.close).toBeInstanceOf(Function);
      expect(connection.socket).toBe(mockSocket);
    });

    it('rejects when connection fails', async () => {
      const connectionPromise = connectToDaemon(
        mockMethodSpecs,
        mockLogger as never,
      );
      mockSocket.emit('error', new Error('ENOENT'));

      await expect(connectionPromise).rejects.toThrow(
        'Failed to connect to daemon: ENOENT',
      );
    });

    it('removes all listeners and destroys socket on close', async () => {
      const connectionPromise = connectToDaemon(
        mockMethodSpecs,
        mockLogger as never,
      );
      mockSocket.emit('connect');
      const connection = await connectionPromise;

      connection.close();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe('sendShutdown', () => {
    it('sends shutdown command and resolves on response', async () => {
      const shutdownPromise = sendShutdown();
      mockSocket.emit('connect');

      expect(mockSocket.write).toHaveBeenCalledWith(
        expect.stringContaining('"method":"shutdown"'),
      );

      // Simulate response
      mockSocket.emit(
        'data',
        Buffer.from('{"jsonrpc":"2.0","id":"shutdown-1","result":true}\n'),
      );

      await shutdownPromise;
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('rejects when connection fails', async () => {
      const shutdownPromise = sendShutdown();
      mockSocket.emit('error', new Error('ECONNREFUSED'));

      await expect(shutdownPromise).rejects.toThrow(
        'Failed to connect to daemon: ECONNREFUSED',
      );
    });
  });
});

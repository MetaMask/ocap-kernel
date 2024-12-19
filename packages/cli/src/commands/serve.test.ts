import '@ocap/shims/endoify';

import { makeCounter } from '@ocap/utils';
import { createServer } from 'http';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import serveMiddleware from 'serve-handler';
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

import { getServer } from './serve.js';
import { defaultConfig } from '../config.js';

vi.mock('http', () => ({
  createServer: vi.fn((handler) => ({
    listen: vi.fn((_port, handle) => handle()),
    close: vi.fn((handle) => handle()),
    address: vi.fn(() => ({ port: 3000 })),
    handler,
  })),
}));

vi.mock('serve-handler', () => ({
  default: vi.fn(),
}));

vi.mock('@metamask/snaps-utils/node', () => ({
  logError: vi.fn(),
}));

describe('serve', () => {
  const getServerPort = makeCounter(defaultConfig.server.port);

  describe('getServer', () => {
    it('returns an object with a listen property', () => {
      const server = getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });
      expect(server).toHaveProperty('listen');
    });

    it('throws if dir is not specified', () => {
      expect(() => getServer({ server: { port: getServerPort() } })).toThrow(
        /dir/u,
      );
    });

    it('creates server with correct middleware configuration', () => {
      const port = getServerPort();
      getServer({
        server: { port },
        dir: '/test/dir',
      });
      expect(createServer).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('path validation', () => {
    it('allows .bundle files', async () => {
      getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });

      const mockRequest = {
        url: '/test.bundle',
        headers: { host: 'localhost:3000' },
      } as IncomingMessage;

      const mockResponse = {
        statusCode: 200,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const handler = (createServer as unknown as Mock).mock.calls[0]?.[0];
      await handler?.(mockRequest, mockResponse);
      expect(mockResponse.statusCode).not.toBe(404);
      expect(serveMiddleware).toHaveBeenCalled();
    });

    it('rejects non-bundle files', async () => {
      getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });

      const mockRequest = {
        url: '/test.js',
        headers: { host: 'localhost:3000' },
      } as IncomingMessage;

      const mockResponse = {
        statusCode: 200,
        end: vi.fn(),
      } as unknown as ServerResponse;

      const handler = (createServer as unknown as Mock).mock.calls[0]?.[0];
      await handler(mockRequest, mockResponse);
      expect(mockResponse.statusCode).toBe(404);
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe('server listen', () => {
    it('handles listen errors', async () => {
      vi.mocked(createServer).mockReturnValueOnce({
        listen: vi.fn(() => {
          throw new Error('Listen failed');
        }),
        close: vi.fn(),
        address: vi.fn(),
      } as unknown as Server);
      const server = getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });
      await expect(server.listen()).rejects.toThrow('Listen failed');
    });

    it('resolves with port and close function', async () => {
      const server = getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });
      const result = await server.listen();
      expect(result).toHaveProperty('port', 3000);
      expect(result).toHaveProperty('close');
      expect(typeof result.close).toBe('function');
    });
  });

  describe('error handling', () => {
    it('handles server errors with 500 status', async () => {
      getServer({
        server: { port: getServerPort() },
        dir: '/test/dir',
      });

      const mockRequest = {
        url: '/test.bundle',
        headers: { host: 'localhost:3000' },
      } as IncomingMessage;

      const mockResponse = {
        statusCode: 200,
        end: vi.fn(),
        setHeader: vi.fn(),
        writeHead: vi.fn(),
      } as unknown as ServerResponse;

      vi.mocked(serveMiddleware).mockImplementationOnce(() => {
        throw new Error('Server error');
      });

      const handler = (createServer as unknown as Mock).mock.calls[0]?.[0];
      await handler(mockRequest, mockResponse);
      expect(mockResponse.statusCode).toBe(500);
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });
});

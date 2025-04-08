import { jsonrpc2 } from '@metamask/utils';
import { describe, it, vi, expect } from 'vitest';

import { RpcClient } from './RpcClient.ts';
import { getMethods } from '../test/methods.ts';

describe('RpcClient', () => {
  describe('constructor', () => {
    it('should create a new RpcClient', () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      expect(client).toBeInstanceOf(RpcClient);
    });
  });

  describe('call', () => {
    it('should call a method', async () => {
      const sendMessage = vi.fn();
      const client = new RpcClient(getMethods(), sendMessage, 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test:1', {
        jsonrpc: jsonrpc2,
        id: 'test:1',
        result: null,
      });

      expect(sendMessage).toHaveBeenCalledWith({
        jsonrpc: jsonrpc2,
        id: 'test:1',
        method: 'method1',
        params: ['test'],
      });
      expect(await resultP).toBeNull();
    });

    it('should throw an error for error responses', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test:1', {
        jsonrpc: jsonrpc2,
        id: 'test:1',
        error: {
          code: -32000,
          message: 'test error',
        },
      });

      await expect(resultP).rejects.toThrow('test error');
    });

    it('should throw an error for invalid results', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test:1', {
        jsonrpc: jsonrpc2,
        id: 'test:1',
        result: 42,
      });
      await expect(resultP).rejects.toThrow(
        'Invalid result: Expected the literal `null`, but received: 42',
      );
    });

    it('should throw an error for invalid responses', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test:1', 'invalid');
      await expect(resultP).rejects.toThrow('Invalid JSON-RPC response:');
    });
  });

  describe('handleResponse', () => {
    it('should log an error if the message id is not found', () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const logError = vi.spyOn(console, 'error');
      client.handleResponse('test:1', 'test');
      expect(logError).toHaveBeenCalledWith(
        'No unresolved message with id "test:1".',
      );
    });
  });

  describe('rejectAll', () => {
    it('should reject all unresolved messages', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const p1 = client.call('method1', ['test']);
      const p2 = client.call('method1', ['test']);
      client.rejectAll(new Error('test error'));
      await expect(p1).rejects.toThrow('test error');
      await expect(p2).rejects.toThrow('test error');
    });
  });
});

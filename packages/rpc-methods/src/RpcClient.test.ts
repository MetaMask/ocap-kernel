import { jsonrpc2 } from '@metamask/utils';
import type { Logger } from '@ocap/logger';
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
      client.handleResponse('test1', {
        jsonrpc: jsonrpc2,
        id: 'test1',
        result: null,
      });

      expect(sendMessage).toHaveBeenCalledWith({
        jsonrpc: jsonrpc2,
        id: 'test1',
        method: 'method1',
        params: ['test'],
      });
      expect(await resultP).toBeNull();
    });

    it('should throw an error for error responses', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test1', {
        jsonrpc: jsonrpc2,
        id: 'test1',
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
      client.handleResponse('test1', {
        jsonrpc: jsonrpc2,
        id: 'test1',
        result: 42,
      });
      await expect(resultP).rejects.toThrow(
        'Invalid result: Expected the literal `null`, but received: 42',
      );
    });

    it('should throw an error for invalid responses', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const resultP = client.call('method1', ['test']);
      client.handleResponse('test1', 'invalid');
      await expect(resultP).rejects.toThrow('Invalid JSON-RPC response:');
    });
  });

  describe('notify', () => {
    it('should call a notification method', async () => {
      const sendMessage = vi.fn(async () => Promise.resolve());
      const client = new RpcClient(getMethods(), sendMessage, 'test');
      await client.notify('method3', ['test']);
      expect(sendMessage).toHaveBeenCalledWith({
        jsonrpc: jsonrpc2,
        method: 'method3',
        params: ['test'],
      });
    });

    it('should log an error if the message fails to send', async () => {
      const logger = makeLogger('[test]');
      const sendMessage = vi.fn(async () =>
        Promise.reject(new Error('test error')),
      );
      const client = new RpcClient(getMethods(), sendMessage, 'test', logger);
      const logError = vi.spyOn(logger, 'error');
      await client.notify('method3', ['test']);
      expect(logError).toHaveBeenCalledWith(
        'Failed to send notification',
        new Error('test error'),
      );
    });
  });

  describe('callAndGetId', () => {
    it('should call a method and return the id', async () => {
      const client = new RpcClient(getMethods(), vi.fn(), 'test');
      const callP = client.callAndGetId('method1', ['test']);
      client.handleResponse('test1', {
        jsonrpc: jsonrpc2,
        id: 'test1',
        result: null,
      });
      const [id, result] = await callP;
      expect(id).toBe('test1');
      expect(result).toBeNull();
    });
  });

  describe('handleResponse', () => {
    it('calls logger.debug if the message id is not found', () => {
      const logger = { debug: vi.fn() } as unknown as Logger;
      const client = new RpcClient(getMethods(), vi.fn(), 'test', logger);
      client.handleResponse('test1', 'test');
      expect(logger.debug).toHaveBeenCalledWith(
        'Received response with unexpected id "test1".',
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

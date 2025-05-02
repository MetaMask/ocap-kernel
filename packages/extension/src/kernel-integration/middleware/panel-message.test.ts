import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';
import type { JsonRpcRequest } from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createPanelMessageMiddleware } from './panel-message.ts';

const { mockAssertHasMethod, mockExecute } = vi.hoisted(() => ({
  mockAssertHasMethod: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@metamask/kernel-rpc-methods', () => ({
  RpcService: class MockRpcService {
    assertHasMethod = mockAssertHasMethod;

    execute = mockExecute;
  },
}));

vi.mock('../handlers/index.ts', () => ({
  handlers: {
    testMethod1: { method: 'testMethod1' },
    testMethod2: { method: 'testMethod2' },
  },
}));

describe('createPanelMessageMiddleware', () => {
  let mockKernel: Kernel;
  let mockKernelDatabase: KernelDatabase;
  let engine: JsonRpcEngine;

  beforeEach(() => {
    // Set up mocks
    mockKernel = {} as Kernel;
    mockKernelDatabase = {} as KernelDatabase;

    // Create a new JSON-RPC engine with our middleware
    engine = new JsonRpcEngine();
    engine.push(createPanelMessageMiddleware(mockKernel, mockKernelDatabase));
  });

  it('should handle successful command execution', async () => {
    // Set up the mock to return a successful result
    const expectedResult = { success: true, data: 'test data' };
    mockExecute.mockResolvedValueOnce(expectedResult);

    // Create a request
    const request = {
      id: 1,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: { foo: 'bar' },
    } as JsonRpcRequest;

    // Process the request
    const response = await engine.handle(request);

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 1,
      jsonrpc: '2.0',
      result: expectedResult,
    });

    // Verify the middleware called execute with the right parameters
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', { foo: 'bar' });
  });

  it('should handle command execution with empty params', async () => {
    // Set up the mock to return a successful result
    mockExecute.mockResolvedValueOnce(null);

    // Create a request with no params
    const request = {
      id: 2,
      jsonrpc: '2.0',
      method: 'testMethod2',
      params: [],
    } as JsonRpcRequest;

    // Process the request
    const response = await engine.handle(request);

    // Verify the middleware called execute with the right parameters
    expect(mockExecute).toHaveBeenCalledWith('testMethod2', []);

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 2,
      jsonrpc: '2.0',
      result: null,
    });
  });

  it('should handle command execution errors', async () => {
    // Set up the mock to throw an error
    const error = new Error('Test error');
    mockExecute.mockRejectedValueOnce(error);

    // Create a request
    const request = {
      id: 3,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: { foo: 'bar' },
    } as JsonRpcRequest;

    // Process the request
    const response = await engine.handle(request);

    // Verify the middleware called execute
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', { foo: 'bar' });

    // Verify the response contains the error
    expect(response).toStrictEqual({
      id: 3,
      jsonrpc: '2.0',
      error: expect.objectContaining({
        code: -32603, // Internal error
        data: expect.objectContaining({
          cause: expect.objectContaining({
            message: 'Test error',
          }),
        }),
      }),
    });
  });

  it('should handle array params', async () => {
    // Set up the mock to return a successful result
    mockExecute.mockResolvedValueOnce({ result: 'array processed' });

    // Create a request with array params
    const request = {
      id: 4,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: ['item1', 'item2'],
    } as JsonRpcRequest;

    // Process the request
    const response = await engine.handle(request);

    // Verify the middleware called execute with the array params
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', ['item1', 'item2']);

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 4,
      jsonrpc: '2.0',
      result: { result: 'array processed' },
    });
  });

  it('should handle requests without params', async () => {
    // Set up the mock to return a successful result
    mockExecute.mockResolvedValueOnce({ status: 'ok' });

    // Create a request without params
    const request = {
      id: 5,
      jsonrpc: '2.0',
      method: 'testMethod2',
      // No params field
    } as JsonRpcRequest;

    // Process the request
    const response = await engine.handle(request);

    // Verify the middleware called execute with undefined params
    expect(mockExecute).toHaveBeenCalledWith('testMethod2', undefined);

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 5,
      jsonrpc: '2.0',
      result: { status: 'ok' },
    });
  });

  it('rejects unknown methods', async () => {
    const request = {
      id: 6,
      jsonrpc: '2.0',
      method: 'unknownMethod',
    } as JsonRpcRequest;

    mockAssertHasMethod.mockImplementation(() => {
      throw new Error('The method does not exist / is not available.');
    });

    const response = await engine.handle(request);

    expect(mockExecute).not.toHaveBeenCalled();

    // Verify the response contains the error
    expect(response).toStrictEqual({
      id: 6,
      jsonrpc: '2.0',
      error: expect.objectContaining({
        code: -32603, // Internal error
        data: expect.objectContaining({
          cause: expect.objectContaining({
            message: 'The method does not exist / is not available.',
          }),
        }),
      }),
    });
  });
});

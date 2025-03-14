import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcRequest } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createPanelMessageMiddleware } from './panel-message.ts';

const { mockRegister, mockExecute } = vi.hoisted(() => ({
  mockRegister: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('../command-registry.ts', () => ({
  KernelCommandRegistry: vi.fn().mockImplementation(() => ({
    register: mockRegister,
    execute: mockExecute,
  })),
}));

// Mock the handlers
vi.mock('../handlers/index.ts', () => ({
  handlers: [{ method: 'testMethod1' }, { method: 'testMethod2' }],
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

    // Verify the middleware called execute with the right parameters
    expect(mockExecute).toHaveBeenCalledWith(
      mockKernel,
      mockKernelDatabase,
      'testMethod1',
      { foo: 'bar' },
    );

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 1,
      jsonrpc: '2.0',
      result: expectedResult,
    });
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
    expect(mockExecute).toHaveBeenCalledWith(
      mockKernel,
      mockKernelDatabase,
      'testMethod2',
      [],
    );

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
    expect(mockExecute).toHaveBeenCalledWith(
      mockKernel,
      mockKernelDatabase,
      'testMethod1',
      { foo: 'bar' },
    );

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
    expect(mockExecute).toHaveBeenCalledWith(
      mockKernel,
      mockKernelDatabase,
      'testMethod1',
      ['item1', 'item2'],
    );

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
    expect(mockExecute).toHaveBeenCalledWith(
      mockKernel,
      mockKernelDatabase,
      'testMethod2',
      undefined,
    );

    // Verify the response contains the expected result
    expect(response).toStrictEqual({
      id: 5,
      jsonrpc: '2.0',
      result: { status: 'ok' },
    });
  });
});

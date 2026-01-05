import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';
import type { JsonRpcRequest } from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makePanelMessageMiddleware } from './panel-message.ts';

const { mockAssertHasMethod, mockExecute } = vi.hoisted(() => ({
  mockAssertHasMethod: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@metamask/kernel-rpc-methods', () => ({
  RpcService: class MockRpcService {
    readonly #dependencies: Record<string, unknown>;

    constructor(
      _handlers: Record<string, unknown>,
      dependencies: Record<string, unknown>,
    ) {
      this.#dependencies = dependencies;
    }

    assertHasMethod = mockAssertHasMethod;

    execute = (method: string, params: unknown) => {
      // For executeDBQuery test, call the actual implementation
      if (
        method === 'executeDBQuery' &&
        typeof params === 'object' &&
        params !== null
      ) {
        const { sql } = params as { sql: string };
        const executeQueryFn = this.#dependencies.executeDBQuery as (
          sql: string,
        ) => Promise<unknown>;
        return executeQueryFn(sql);
      }

      return mockExecute(method, params);
    };
  },
}));

vi.mock('../handlers/index.ts', () => ({
  handlers: {
    testMethod1: { method: 'testMethod1' },
    testMethod2: { method: 'testMethod2' },
    executeDBQuery: { method: 'executeDBQuery' },
  },
}));

describe('makePanelMessageMiddleware', () => {
  let mockKernel: Kernel;
  let mockKernelDatabase: KernelDatabase;
  let engine: JsonRpcEngineV2;

  beforeEach(() => {
    // Clear mocks before each test
    mockExecute.mockClear();
    mockAssertHasMethod.mockClear();
    mockAssertHasMethod.mockImplementation(() => undefined);

    // Set up mocks
    mockKernel = {} as Kernel;
    mockKernelDatabase = {
      executeQuery: vi.fn(),
    } as unknown as KernelDatabase;

    engine = JsonRpcEngineV2.create({
      middleware: [makePanelMessageMiddleware(mockKernel, mockKernelDatabase)],
    });
  });

  it('should handle successful command execution', async () => {
    const expectedResult = { success: true, data: 'test data' };
    mockExecute.mockResolvedValueOnce(expectedResult);

    const request = {
      id: 1,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: { foo: 'bar' },
    } as JsonRpcRequest;

    const result = await engine.handle(request);

    expect(result).toStrictEqual(expectedResult);
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', { foo: 'bar' });
  });

  it('should handle command execution with empty params', async () => {
    mockExecute.mockResolvedValueOnce(null);

    const request = {
      id: 2,
      jsonrpc: '2.0',
      method: 'testMethod2',
      params: [],
    } as JsonRpcRequest;

    const result = await engine.handle(request);

    expect(result).toBeNull();
    expect(mockExecute).toHaveBeenCalledWith('testMethod2', []);
  });

  it('should handle command execution errors', async () => {
    const error = new Error('Test error');
    mockExecute.mockRejectedValueOnce(error);

    const request = {
      id: 3,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: { foo: 'bar' },
    } as JsonRpcRequest;

    await expect(engine.handle(request)).rejects.toThrowError(error);
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', { foo: 'bar' });
  });

  it('should handle array params', async () => {
    mockExecute.mockResolvedValueOnce('array processed');

    const request = {
      id: 4,
      jsonrpc: '2.0',
      method: 'testMethod1',
      params: ['item1', 'item2'],
    } as JsonRpcRequest;

    const result = await engine.handle(request);
    expect(result).toBe('array processed');
    expect(mockExecute).toHaveBeenCalledWith('testMethod1', ['item1', 'item2']);
  });

  it('should handle requests without params', async () => {
    mockExecute.mockResolvedValueOnce({ status: 'ok' });

    const request = {
      id: 5,
      jsonrpc: '2.0',
      method: 'testMethod2',
      // No params field
    } as JsonRpcRequest;

    const result = await engine.handle(request);
    expect(result).toStrictEqual({ status: 'ok' });
    expect(mockExecute).toHaveBeenCalledWith('testMethod2', undefined);
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

    await expect(engine.handle(request)).rejects.toThrowError(
      'The method does not exist / is not available.',
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('should call kernelDatabase.executeQuery when executeDBQuery is called', async () => {
    const mockQueryResult = [{ id: '1', name: 'test' }];
    vi.mocked(mockKernelDatabase.executeQuery).mockResolvedValueOnce(
      mockQueryResult,
    );

    const testSql = 'SELECT * FROM test_table';

    const request = {
      id: 8,
      jsonrpc: '2.0',
      method: 'executeDBQuery',
      params: { sql: testSql },
    } satisfies JsonRpcRequest;

    const result = await engine.handle(request);

    expect(result).toStrictEqual(mockQueryResult);
    expect(mockKernelDatabase.executeQuery).toHaveBeenCalledWith(testSql);
  });
});

import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import { Logger } from '@metamask/logger';
import type { JsonRpcRequest } from '@metamask/utils';
import { delay } from '@ocap/repo-tools/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeLoggingMiddleware } from './logging.ts';

describe('loggingMiddleware', () => {
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new Logger('test');
  });

  it('should pass the request to the next middleware', async () => {
    // Create a spy middleware to verify the request is passed through
    const nextSpy = vi.fn(() => 'success');
    const engine = JsonRpcEngineV2.create({
      middleware: [makeLoggingMiddleware(logger), nextSpy],
    });

    const request: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'test',
      params: { foo: 'bar' },
    };

    await engine.handle(request);
    expect(nextSpy).toHaveBeenCalled();
  });

  it('should return the result from the next middleware', async () => {
    // Add a middleware that sets a result
    const engine = JsonRpcEngineV2.create({
      middleware: [makeLoggingMiddleware(logger), () => 'test result'],
    });

    const request: JsonRpcRequest = {
      id: 2,
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    const result = await engine.handle(request);
    expect(result).toBe('test result');
  });

  it('should log the execution duration', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');

    // Add a middleware that introduces a delay
    const nextSpy = vi.fn(async () => {
      await delay(10);
      return 'delayed result';
    });
    const engine = JsonRpcEngineV2.create({
      middleware: [makeLoggingMiddleware(logger), nextSpy],
    });

    const request: JsonRpcRequest = {
      id: 3,
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    await engine.handle(request);

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Command executed in \d*\.?\d+ms/u),
    );
  });

  it('should log duration even if next middleware throws', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    const error = new Error('Test error');

    // Add a middleware that throws an error
    const engine = JsonRpcEngineV2.create({
      middleware: [
        makeLoggingMiddleware(logger),
        () => {
          throw error;
        },
      ],
    });

    const request: JsonRpcRequest = {
      id: 4,
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    await expect(engine.handle(request)).rejects.toThrow(error);

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Command executed in \d*\.?\d+ms/u),
    );
  });
});

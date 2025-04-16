import {
  createAsyncMiddleware,
  JsonRpcEngine,
} from '@metamask/json-rpc-engine';
import type { JsonRpcRequest, JsonRpcSuccess } from '@metamask/utils';
import { Logger } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeLoggingMiddleware } from './logging.ts';

describe('loggingMiddleware', () => {
  let engine: JsonRpcEngine;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new JsonRpcEngine();
    logger = new Logger('test');
    engine.push(makeLoggingMiddleware(logger));
  });

  it('should pass the request to the next middleware', async () => {
    // Create a spy middleware to verify the request is passed through
    const nextSpy = vi.fn((_req, res, next) => {
      res.result = 'success';
      return next();
    });
    engine.push(nextSpy);

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
    engine.push((_req, res, _next, end) => {
      res.result = 'test result';
      return end();
    });

    const request: JsonRpcRequest = {
      id: 2,
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    const response = (await engine.handle(request)) as JsonRpcSuccess;
    expect(response.result).toBe('test result');
  });

  it('should log the execution duration', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');

    // Add a middleware that introduces a delay
    engine.push(
      createAsyncMiddleware(async (_req, res, _next) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        res.result = 'delayed result';
      }),
    );

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
    engine.push(() => {
      throw error;
    });

    const request: JsonRpcRequest = {
      id: 4,
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    };

    expect(await engine.handle(request)).toMatchObject({
      error: expect.objectContaining({
        message: 'Test error',
      }),
    });

    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Command executed in \d*\.?\d+ms/u),
    );
  });
});

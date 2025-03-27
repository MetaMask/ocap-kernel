import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';
import { makeLogger } from '@ocap/utils';

export const logger = makeLogger('[kernel-commands]');

export const loggingMiddleware: JsonRpcMiddleware<JsonRpcParams, Json> =
  createAsyncMiddleware(async (_req, _res, next) => {
    const start = performance.now();
    // eslint-disable-next-line n/callback-return
    await next();
    const duration = performance.now() - start;
    logger.debug(`Command executed in ${duration}ms`);
  });

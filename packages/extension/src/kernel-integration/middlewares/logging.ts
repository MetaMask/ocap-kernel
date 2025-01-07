import { makeLogger } from '@ocap/utils';

import type { Middleware } from '../command-registry.js';

const logger = makeLogger('[kernel-commands]');

export const loggingMiddleware: Middleware =
  (next) =>
  async (...args) => {
    const start = performance.now();
    try {
      return await next(...args);
    } finally {
      const duration = performance.now() - start;
      logger.debug(`Command executed in ${duration}ms`);
    }
  };

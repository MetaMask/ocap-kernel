import { describe, it, expect, vi } from 'vitest';

import { makeLogger } from './factories.ts';
import { Logger } from './logger.ts';
import { consoleTransport } from './transports.ts';

describe('makeLogger', () => {
  it('creates a new logger from a label and a parent logger', () => {
    const logger = new Logger({
      tags: ['test'],
      transports: [consoleTransport],
    });
    const subLogger = makeLogger('sub', logger);
    expect(subLogger).toBeInstanceOf(Logger);
  });

  it('creates a new logger from a label', () => {
    const logSpy = vi.spyOn(console, 'log');
    const logger = makeLogger('test');
    expect(logger).toBeInstanceOf(Logger);
    logger.log('foo');
    expect(logSpy).toHaveBeenCalledWith(['test'], 'foo');
  });
});

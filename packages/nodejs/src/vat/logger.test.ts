import { describe, it, expect } from 'vitest';

import { makeVatLogger } from './logger.ts';

describe('makeVatLogger', () => {
  it('should create a logger with the given vatId', () => {
    const vatId = '123';
    const logger = makeVatLogger(vatId);
    expect(logger.label).toContain(vatId);
  });

  it('should create a logger when no vatId is provided', () => {
    const logger = makeVatLogger();
    expect(logger.label).toContain('(unknown)');
  });
});

import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeIncrementalParser } from './parser.ts';

describe('makeIncrementalParser', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
  });

  it('parses complete JSON in single chunk', () => {
    const parser = makeIncrementalParser({});
    expect(parser('{"key": "value"}')).toStrictEqual({ key: 'value' });
  });

  it('parses JSON across multiple chunks', () => {
    const parser = makeIncrementalParser({});
    expect(parser('{"key": "val')).toBeNull();
    expect(parser('ue", "content": 42}')).toStrictEqual({
      key: 'value',
      content: 42,
    });
  });

  it('parses JSON with prefix', () => {
    const parser = makeIncrementalParser({ prefix: '{"start": true, ' });
    expect(parser('"end": false}')).toStrictEqual({ start: true, end: false });
  });

  it('logs parsing attempts when logger provided', () => {
    const parser = makeIncrementalParser({ logger: mockLogger });
    parser('{"test": "value"}');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'toParse:',
      '{"test": "value"}',
    );
  });

  it('throws error for invalid JSON', () => {
    const parser = makeIncrementalParser({});
    expect(() => parser('{"invalid": json}')).toThrow('not valid JSON');
  });

  it('throws error when max chunk count exceeded', () => {
    const parser = makeIncrementalParser({ maxChunkCount: 2 });
    parser('chunk1');
    parser('chunk2');
    expect(() => parser('chunk3')).toThrow('Max chunk count reached');
  });
});

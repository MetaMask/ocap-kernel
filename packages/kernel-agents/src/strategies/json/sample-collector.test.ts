import '@ocap/repo-tools/test-utils/mock-endoify';

import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeSampleCollector } from './sample-collector.ts';

describe('makeSampleCollector', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
  });

  it('collects complete JSON in single chunk', () => {
    const collector = makeSampleCollector({});
    expect(collector('{"key": "value"}')).toStrictEqual({ key: 'value' });
  });

  it('collects JSON across multiple chunks', () => {
    const collector = makeSampleCollector({});
    expect(collector('{"key": "val')).toBeNull();
    expect(collector('ue", "content": 42}')).toStrictEqual({
      key: 'value',
      content: 42,
    });
  });

  it('collects JSON with prefix', () => {
    const collector = makeSampleCollector({ prefix: '{"start": true, ' });
    expect(collector('"end": false}')).toStrictEqual({
      start: true,
      end: false,
    });
  });

  it('logs collection attempts when logger provided', () => {
    const collector = makeSampleCollector({ logger: mockLogger });
    collector('{"test": "value"}');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'toParse:',
      '{"test": "value"}',
    );
  });

  it('throws error for invalid JSON', () => {
    const invalidJson = '{"invalid": json}';
    const collector = makeSampleCollector({});
    expect(() => collector(invalidJson)).toThrow(
      expect.objectContaining({
        message: 'LLM generated invalid response.',
        cause: expect.objectContaining({
          message: expect.stringContaining(invalidJson),
        }),
      }),
    );
  });

  it('throws error when max chunk count exceeded', () => {
    const collector = makeSampleCollector({ maxChunkCount: 2 });
    collector('chunk1');
    collector('chunk2');
    expect(() => collector('chunk3')).toThrow(
      expect.objectContaining({
        message: 'LLM generated invalid response.',
        cause: expect.objectContaining({
          message: expect.stringContaining('Max chunk count reached'),
        }),
      }),
    );
  });
});

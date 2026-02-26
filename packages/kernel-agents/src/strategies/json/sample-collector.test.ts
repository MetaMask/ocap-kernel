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

  it('throws error for malformed JSON', () => {
    const collector = makeSampleCollector({});
    expect(() => collector('not json at all')).toThrow(
      expect.objectContaining({
        message: 'LLM generated invalid response.',
        cause: expect.objectContaining({
          message: expect.stringContaining('at position'),
        }),
      }),
    );
  });

  it('throws error when max chunk count exceeded', () => {
    const collector = makeSampleCollector({ maxChunkCount: 2 });
    // Use valid partial JSON so partial-json does not flag it early
    collector('{"key": "');
    collector('aaa');
    expect(() => collector('bbb')).toThrow(
      expect.objectContaining({
        message: 'LLM generated invalid response.',
        cause: expect.objectContaining({
          message: expect.stringContaining('Max chunk count reached'),
        }),
      }),
    );
  });

  it('handles braces inside string values without false errors', () => {
    const collector = makeSampleCollector({});
    // Simulates an LLM streaming: { think: "I should add a '}' to the..."
    // The old bracket-counting heuristic would false-positive here because
    // the '}' inside the string balances the opening brace.
    expect(collector('{"think": "I should add a ')).toBeNull();
    expect(collector("'}' to the")).toBeNull();
    expect(collector(' response", "done": true}')).toStrictEqual({
      think: "I should add a '}' to the response",
      done: true,
    });
  });

  it('detects genuinely malformed JSON early', () => {
    const collector = makeSampleCollector({ maxChunkCount: 100 });
    // Bare text is structurally invalid — partial-json detects this immediately
    expect(() => collector('this is not json')).toThrow(
      expect.objectContaining({
        message: 'LLM generated invalid response.',
      }),
    );
  });
});

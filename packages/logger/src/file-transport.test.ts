import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeFileTransport } from './file-transport.ts';
import type { LogEntry } from './types.ts';

const makeLogEntry = (overrides?: Partial<LogEntry>): LogEntry => ({
  level: 'info',
  message: 'test-message',
  tags: ['test-tag'],
  ...overrides,
});

describe('makeFileTransport', () => {
  const testDir = join(tmpdir(), 'logger-file-transport-test');

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('appends a formatted log line to the file', async () => {
    const filePath = join(testDir, 'test.log');
    const transport = makeFileTransport(filePath);
    const entry = makeLogEntry();

    transport(entry);
    // Wait for the async write to complete
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('[info] [test-tag] test-message');
    });
  });

  it('creates parent directories', async () => {
    const filePath = join(testDir, 'nested', 'deep', 'test.log');
    const transport = makeFileTransport(filePath);

    transport(makeLogEntry());
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('test-message');
    });
  });

  it('omits tag prefix when tags are empty', async () => {
    const filePath = join(testDir, 'no-tags.log');
    const transport = makeFileTransport(filePath);

    transport(makeLogEntry({ tags: [] }));
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toMatch(/\[info\] test-message/u);
      expect(content).not.toContain('[]');
    });
  });

  it('includes data in the log line', async () => {
    const filePath = join(testDir, 'data.log');
    const transport = makeFileTransport(filePath);

    transport(makeLogEntry({ data: ['extra-data'] }));
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('test-message extra-data');
    });
  });

  it('silently handles write errors', async () => {
    // Use an invalid path to trigger an error
    const transport = makeFileTransport('/dev/null/impossible/test.log');
    // Should not throw
    expect(() => transport(makeLogEntry())).not.toThrow();
  });
});

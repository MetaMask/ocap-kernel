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

  it('includes tags by default', async () => {
    const filePath = join(testDir, 'test.log');
    const transport = makeFileTransport({ filePath });
    const entry = makeLogEntry();

    transport(entry);
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('[info] [test-tag] test-message');
    });
  });

  it('omits tags when tags option is false', async () => {
    const filePath = join(testDir, 'no-tags.log');
    const transport = makeFileTransport({ filePath, tags: false });

    transport(makeLogEntry());
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toMatch(/\[info\] test-message/u);
      expect(content).not.toContain('[test-tag]');
    });
  });

  it('creates parent directories', async () => {
    const filePath = join(testDir, 'nested', 'deep', 'test.log');
    const transport = makeFileTransport({ filePath });

    transport(makeLogEntry());
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('test-message');
    });
  });

  it('omits tag prefix when tags are empty', async () => {
    const filePath = join(testDir, 'empty-tags.log');
    const transport = makeFileTransport({ filePath });

    transport(makeLogEntry({ tags: [] }));
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toMatch(/\[info\] test-message/u);
      expect(content).not.toContain('[]');
    });
  });

  it('includes data in the log line', async () => {
    const filePath = join(testDir, 'data.log');
    const transport = makeFileTransport({ filePath });

    transport(makeLogEntry({ data: ['extra-data'] }));
    await vi.waitFor(async () => {
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('test-message extra-data');
    });
  });

  it('silently handles write errors', async () => {
    const transport = makeFileTransport({
      filePath: '/dev/null/impossible/test.log',
    });
    expect(() => transport(makeLogEntry())).not.toThrow();
  });
});

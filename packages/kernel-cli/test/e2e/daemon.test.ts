/* eslint-disable n/no-sync -- existsSync is fine in tests */
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type { TestDaemon } from './helpers.ts';
import { spawnTestDaemon, waitForDaemonStop } from './helpers.ts';
import { sendCommand, pingDaemon } from '../../src/commands/daemon-client.ts';

// NOTE: `redeem-url` is not tested here because it requires remote comms
// infrastructure (relay + peer). See unit tests in src/commands/daemon.test.ts.

describe('Daemon CLI e2e', { timeout: 60_000 }, () => {
  describe('start / exec / queueMessage', () => {
    let daemon: TestDaemon;

    beforeAll(async () => {
      daemon = await spawnTestDaemon();
    });

    afterAll(async () => {
      await daemon.cleanup();
    });

    it('starts daemon and responds to getStatus', async () => {
      const response = await sendCommand({
        socketPath: daemon.socketPath,
        method: 'getStatus',
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      const result = response.result as Record<string, unknown>;
      expect(result).toHaveProperty('vats');
      expect(result).toHaveProperty('subclusters');
    });

    it('returns error for unknown method', async () => {
      const response = await sendCommand({
        socketPath: daemon.socketPath,
        method: 'nonexistentMethod',
      });

      expect(response.error).toBeDefined();
      expect((response.error as { code: number }).code).toBe(-32601);
    });

    it('executes DB query with SQL param', async () => {
      const response = await sendCommand({
        socketPath: daemon.socketPath,
        method: 'executeDBQuery',
        params: { sql: 'SELECT key, value FROM kv LIMIT 5' },
      });

      expect(response.error).toBeUndefined();
      expect(Array.isArray(response.result)).toBe(true);
    });

    it('returns error for queueMessage with invalid kref', async () => {
      const response = await sendCommand({
        socketPath: daemon.socketPath,
        method: 'queueMessage',
        params: ['ko99999', 'someMethod', []],
      });
      expect(response.error).toBeDefined();
    });

    it('writes state files to OCAP_HOME', () => {
      expect(existsSync(join(daemon.ocapHome, 'daemon.pid'))).toBe(true);
      expect(existsSync(join(daemon.ocapHome, 'kernel.sqlite'))).toBe(true);
      expect(existsSync(join(daemon.ocapHome, 'daemon.log'))).toBe(true);
    });
  });

  describe('stop / purge', () => {
    let daemon: TestDaemon;

    beforeAll(async () => {
      daemon = await spawnTestDaemon();
    });

    afterAll(async () => {
      // Kill the daemon process as a fallback if it's still alive.
      try {
        process.kill(daemon.pid, 'SIGKILL');
      } catch {
        // Process already gone.
      }
      await rm(daemon.ocapHome, { recursive: true, force: true });
    });

    it('stops daemon via shutdown RPC', async () => {
      expect(await pingDaemon(daemon.socketPath)).toBe(true);

      await sendCommand({
        socketPath: daemon.socketPath,
        method: 'shutdown',
        timeoutMs: 10_000,
      });

      await waitForDaemonStop(daemon.socketPath);

      expect(await pingDaemon(daemon.socketPath)).toBe(false);
    });

    it('purges state after stop', async () => {
      const { deleteDaemonState } = await import(
        '@metamask/kernel-node-runtime/daemon'
      );
      await deleteDaemonState({
        ocapHome: daemon.ocapHome,
        socketPath: daemon.socketPath,
      });

      const remaining = [
        'kernel.sqlite',
        'daemon.pid',
        'daemon.log',
        'daemon.sock',
      ].filter((name) => existsSync(join(daemon.ocapHome, name)));
      expect(remaining).toStrictEqual([]);
    });
  });
});

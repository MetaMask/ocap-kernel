import { fork } from 'node:child_process';
import { access, readFile, unlink, mkdir } from 'node:fs/promises';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { sendShutdown } from './daemon-client.ts';
import {
  flushDaemonStore,
  isDaemonRunning,
  readDaemonPid,
  startDaemon,
  stopDaemon,
} from './daemon-lifecycle.ts';

vi.mock('node:child_process', () => ({
  fork: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('./daemon-client.ts', () => ({
  sendShutdown: vi.fn(),
}));

describe('daemon-lifecycle', () => {
  beforeEach(() => {
    vi.mocked(access).mockReset();
    vi.mocked(readFile).mockReset();
    vi.mocked(unlink).mockReset();
    vi.mocked(mkdir).mockReset();
  });

  describe('isDaemonRunning', () => {
    it('returns false when PID file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
      expect(await isDaemonRunning()).toBe(false);
    });

    it('returns true when PID file exists and process is alive', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('1234');
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      expect(await isDaemonRunning()).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(1234, 0);

      killSpy.mockRestore();
    });

    it('returns false when PID file exists but process is dead', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('1234');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(await isDaemonRunning()).toBe(false);

      killSpy.mockRestore();
    });
  });

  describe('flushDaemonStore', () => {
    const makeLogger = () =>
      ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }) as never;

    it('throws when daemon is running', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('1234');
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      await expect(flushDaemonStore(makeLogger())).rejects.toThrow(
        'Cannot flush while daemon is running',
      );

      killSpy.mockRestore();
    });

    it('removes DB file when daemon is stopped', async () => {
      // isDaemonRunning: PID file does not exist → not running
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // fileExists for DB_FILE → exists
      vi.mocked(access).mockResolvedValueOnce(undefined);
      // fileExists for -wal → does not exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // fileExists for -shm → does not exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // fileExists for -journal → does not exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      const logger = makeLogger();
      await flushDaemonStore(logger);

      expect(unlink).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Daemon store flushed');
    });

    it('removes DB file and all sidecars when they exist', async () => {
      // isDaemonRunning: PID file does not exist → not running
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // fileExists for DB_FILE, -wal, -shm, -journal → all exist
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(access).mockResolvedValueOnce(undefined);

      await flushDaemonStore(makeLogger());

      expect(unlink).toHaveBeenCalledTimes(4);
    });

    it('no-ops gracefully when DB does not exist', async () => {
      // isDaemonRunning: PID file does not exist → not running
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // fileExists for all four files → none exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      const logger = makeLogger();
      await flushDaemonStore(logger);

      expect(unlink).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Daemon store flushed');
    });
  });

  describe('readDaemonPid', () => {
    it('returns null when PID file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
      expect(await readDaemonPid()).toBeNull();
    });

    it('returns the PID when file exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('5678');
      expect(await readDaemonPid()).toBe(5678);
    });

    it('returns null when file read fails', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockRejectedValue(new Error('EACCES'));
      expect(await readDaemonPid()).toBeNull();
    });
  });

  describe('startDaemon', () => {
    const makeLogger = () =>
      ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }) as never;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('throws when daemon is already running', async () => {
      // isDaemonRunning: PID file exists and process alive
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('1234');
      const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

      await expect(
        startDaemon('/path/to/daemon.mjs', makeLogger()),
      ).rejects.toThrow('Daemon already running (PID 1234)');

      killSpy.mockRestore();
    });

    it('throws when fork returns no PID', async () => {
      // isDaemonRunning: PID file does not exist → not running
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(mkdir).mockResolvedValue(undefined);

      const mockChild = { unref: vi.fn(), pid: undefined };
      vi.mocked(fork).mockReturnValue(mockChild as never);

      await expect(
        startDaemon('/path/to/daemon.mjs', makeLogger()),
      ).rejects.toThrow('Failed to start daemon: no PID returned');
    });

    it('forks a detached child and returns PID when socket appears', async () => {
      // isDaemonRunning: PID file does not exist → not running
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // cleanupStaleFiles: PID file does not exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // cleanupStaleFiles: socket does not exist
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(mkdir).mockResolvedValue(undefined);

      const mockChild = { unref: vi.fn(), pid: 9999 };
      vi.mocked(fork).mockReturnValue(mockChild as never);

      // Socket file: not found on first poll, then found on second
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockResolvedValueOnce(undefined);

      const startPromise = startDaemon('/path/to/daemon.mjs', makeLogger());
      await vi.advanceTimersByTimeAsync(200);
      const pid = await startPromise;

      expect(pid).toBe(9999);
      expect(fork).toHaveBeenCalledWith('/path/to/daemon.mjs', [], {
        detached: true,
        stdio: 'ignore',
      });
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('throws when socket file does not appear within timeout', async () => {
      // isDaemonRunning: not running
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      // cleanupStaleFiles: both absent
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(mkdir).mockResolvedValue(undefined);

      const mockChild = { unref: vi.fn(), pid: 9999 };
      vi.mocked(fork).mockReturnValue(mockChild as never);

      // Socket never appears
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const startPromise = startDaemon('/path/to/daemon.mjs', makeLogger());
      // Attach rejection handler before advancing timers to avoid unhandled rejection
      startPromise.catch(() => undefined);
      await vi.advanceTimersByTimeAsync(11_000);

      await expect(startPromise).rejects.toThrow(
        'Daemon did not start within timeout',
      );
    });
  });

  describe('stopDaemon', () => {
    const makeLogger = () =>
      ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }) as never;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('throws when daemon is not running', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      await expect(stopDaemon(makeLogger())).rejects.toThrow(
        'Daemon is not running',
      );
    });

    it('sends shutdown RPC and cleans up', async () => {
      const killSpy = vi.spyOn(process, 'kill');

      // isDaemonRunning (initial check): running
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');
      killSpy.mockReturnValueOnce(true);

      // readDaemonPid
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');

      vi.mocked(sendShutdown).mockResolvedValue(undefined);

      // isDaemonRunning (polling): process exited
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      // cleanupStaleFiles: both absent
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      const logger = makeLogger();
      const stopPromise = stopDaemon(logger);
      await vi.advanceTimersByTimeAsync(200);
      await stopPromise;

      expect(sendShutdown).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Daemon stopped');

      killSpy.mockRestore();
    });

    it('falls back to SIGTERM when shutdown RPC fails', async () => {
      const killSpy = vi.spyOn(process, 'kill');

      // isDaemonRunning (initial check): running
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');
      killSpy.mockReturnValueOnce(true);

      // readDaemonPid
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');

      vi.mocked(sendShutdown).mockRejectedValue(new Error('ECONNREFUSED'));

      // SIGTERM call
      killSpy.mockReturnValueOnce(true);

      // isDaemonRunning (polling): process exited
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      // cleanupStaleFiles
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));
      vi.mocked(access).mockRejectedValueOnce(new Error('ENOENT'));

      const stopPromise = stopDaemon(makeLogger());
      await vi.advanceTimersByTimeAsync(200);
      await stopPromise;

      expect(killSpy).toHaveBeenCalledWith(5555, 'SIGTERM');

      killSpy.mockRestore();
    });

    it('escalates to SIGKILL after exit timeout', async () => {
      const killSpy = vi.spyOn(process, 'kill');

      // isDaemonRunning (initial check): running
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');
      killSpy.mockReturnValueOnce(true);

      // readDaemonPid
      vi.mocked(access).mockResolvedValueOnce(undefined);
      vi.mocked(readFile).mockResolvedValueOnce('5555');

      vi.mocked(sendShutdown).mockResolvedValue(undefined);

      // isDaemonRunning (polling): always running — process won't exit
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('5555');
      killSpy.mockReturnValue(true);

      const stopPromise = stopDaemon(makeLogger());
      await vi.advanceTimersByTimeAsync(6_000);
      await stopPromise;

      expect(killSpy).toHaveBeenCalledWith(5555, 'SIGKILL');

      killSpy.mockRestore();
    });
  });
});

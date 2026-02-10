import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import { formatUptime, handleDaemonStatus } from './status.ts';

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}));

vi.mock('../daemon-lifecycle.ts', () => ({
  isDaemonRunning: vi.fn(),
  readDaemonPid: vi.fn(),
}));

vi.mock('../constants.ts', () => ({
  PID_FILE: '/mock-home/.ocap-kernel-daemon/daemon.pid',
  SOCK_FILE: '/mock-home/.ocap-kernel-daemon/daemon.sock',
}));

const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('daemon-status', () => {
  describe('formatUptime', () => {
    it('formats seconds only', () => {
      expect(formatUptime(45_000)).toBe('45s');
    });

    it('formats minutes and seconds', () => {
      expect(formatUptime(135_000)).toBe('2m 15s');
    });

    it('formats hours, minutes, and seconds', () => {
      expect(formatUptime(8_103_000)).toBe('2h 15m 3s');
    });

    it('formats days, hours, minutes, and seconds', () => {
      expect(formatUptime(90_063_000)).toBe('1d 1h 1m 3s');
    });

    it('formats zero', () => {
      expect(formatUptime(0)).toBe('0s');
    });
  });

  describe('handleDaemonStatus', () => {
    let logger: ReturnType<typeof makeLogger>;
    let isDaemonRunning: Mock;
    let readDaemonPid: Mock;
    let stat: Mock;
    let access: Mock;

    beforeEach(async () => {
      vi.clearAllMocks();
      logger = makeLogger();
      const lifecycle = await import('../daemon-lifecycle.ts');
      isDaemonRunning = lifecycle.isDaemonRunning as Mock;
      readDaemonPid = lifecycle.readDaemonPid as Mock;
      const fs = await import('node:fs/promises');
      stat = fs.stat as Mock;
      access = fs.access as Mock;
    });

    it('logs stopped when daemon is not running', async () => {
      isDaemonRunning.mockResolvedValue(false);

      await handleDaemonStatus(logger as never);

      expect(logger.info).toHaveBeenCalledWith('Status: stopped');
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('logs running status with PID, uptime, and socket path', async () => {
      isDaemonRunning.mockResolvedValue(true);
      readDaemonPid.mockResolvedValue(12345);
      stat.mockResolvedValue({
        birthtime: new Date(Date.now() - 8_103_000),
      });
      access.mockResolvedValue(undefined);

      await handleDaemonStatus(logger as never);

      expect(logger.info).toHaveBeenCalledWith('Status: running');
      expect(logger.info).toHaveBeenCalledWith('PID: 12345');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringMatching(/^Uptime: 2h 15m/u),
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Socket: ~/.ocap-kernel-daemon/daemon.sock',
      );
    });

    it('logs "not found" when socket file is missing', async () => {
      isDaemonRunning.mockResolvedValue(true);
      readDaemonPid.mockResolvedValue(99);
      stat.mockResolvedValue({
        birthtime: new Date(Date.now() - 5000),
      });
      access.mockRejectedValue(new Error('ENOENT'));

      await handleDaemonStatus(logger as never);

      expect(logger.info).toHaveBeenCalledWith('Status: running');
      expect(logger.info).toHaveBeenCalledWith('Socket: not found');
    });

    it('skips uptime when PID file stat fails', async () => {
      isDaemonRunning.mockResolvedValue(true);
      readDaemonPid.mockResolvedValue(42);
      stat.mockRejectedValue(new Error('ENOENT'));
      access.mockResolvedValue(undefined);

      await handleDaemonStatus(logger as never);

      expect(logger.info).toHaveBeenCalledWith('Status: running');
      expect(logger.info).toHaveBeenCalledWith('PID: 42');
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Uptime'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Socket: ~/.ocap-kernel-daemon/daemon.sock',
      );
    });
  });
});

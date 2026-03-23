import type { Logger } from '@metamask/logger';
import { rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  printRelayStatus,
  startRelayWithBookkeeping,
  stopRelay,
} from './relay.ts';
import { isProcessAlive, readPidFile, sendSignal, waitFor } from '../utils.ts';

vi.mock('@metamask/kernel-utils/libp2p', () => ({
  startRelay: vi.fn(),
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal()),
  mkdir: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('../utils.ts', () => ({
  isProcessAlive: vi.fn(),
  readPidFile: vi.fn(),
  sendSignal: vi.fn(),
  waitFor: vi.fn(),
}));

const mockLogger = { info: vi.fn(), error: vi.fn() } as unknown as Logger;

const makeLibp2pMock = (
  addrs: string[] = ['/ip4/127.0.0.1/tcp/9001/ws/p2p/QmFoo'],
) => ({
  getMultiaddrs: () => addrs.map((addr) => ({ toString: () => addr })),
});

describe('relay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe('startRelayWithBookkeeping', () => {
    it('throws if the relay is already running', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(9999);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);

      await expect(startRelayWithBookkeeping(mockLogger)).rejects.toThrow(
        'Relay is already running (PID: 9999).',
      );
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('writes PID and addr files and starts the relay', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(undefined);

      const { startRelay } = await import('@metamask/kernel-utils/libp2p');
      vi.mocked(startRelay).mockResolvedValueOnce(makeLibp2pMock() as never);

      await startRelayWithBookkeeping(mockLogger);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('relay.pid'),
        String(process.pid),
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('relay.addr'),
        '/ip4/127.0.0.1/tcp/9001/ws/p2p/QmFoo',
      );
      expect(startRelay).toHaveBeenCalledWith(mockLogger);
    });

    it('overwrites stale PID file when process is dead', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(9999);
      vi.mocked(isProcessAlive).mockReturnValueOnce(false);

      const { startRelay } = await import('@metamask/kernel-utils/libp2p');
      vi.mocked(startRelay).mockResolvedValueOnce(makeLibp2pMock() as never);

      await startRelayWithBookkeeping(mockLogger);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('relay.pid'),
        String(process.pid),
      );
    });

    it('throws when no WS multiaddr is available', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(undefined);

      const { startRelay } = await import('@metamask/kernel-utils/libp2p');
      vi.mocked(startRelay).mockResolvedValueOnce(
        makeLibp2pMock(['/ip4/0.0.0.0/tcp/9002']) as never,
      );

      await expect(startRelayWithBookkeeping(mockLogger)).rejects.toThrow(
        'Relay started but no WS multiaddr found on 127.0.0.1:9001',
      );
    });

    it('removes PID file if startRelay throws', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(undefined);

      const { startRelay } = await import('@metamask/kernel-utils/libp2p');
      vi.mocked(startRelay).mockRejectedValueOnce(new Error('port in use'));

      await expect(startRelayWithBookkeeping(mockLogger)).rejects.toThrow(
        'port in use',
      );
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.pid'), {
        force: true,
      });
    });
  });

  describe('printRelayStatus', () => {
    it('prints running status when relay is alive', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      await printRelayStatus();

      expect(writeSpy).toHaveBeenCalledWith('Relay is running (PID: 1234).\n');
      expect(process.exitCode).toBeUndefined();
    });

    it('prints not running and sets exit code 1 when no PID file', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(undefined);
      const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      await printRelayStatus();

      expect(writeSpy).toHaveBeenCalledWith('Relay is not running.\n');
      expect(process.exitCode).toBe(1);
      expect(rm).not.toHaveBeenCalled();
    });

    it('cleans up stale PID and addr files when process is dead', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(9999);
      vi.mocked(isProcessAlive).mockReturnValueOnce(false);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      await printRelayStatus();

      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.pid'), {
        force: true,
      });
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.addr'), {
        force: true,
      });
      expect(process.exitCode).toBe(1);
    });
  });

  describe('stopRelay', () => {
    it('returns true when no PID file exists', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(undefined);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay()).toBe(true);
    });

    it('cleans up stale PID and addr files and returns true when process is dead', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(9999);
      vi.mocked(isProcessAlive).mockReturnValueOnce(false);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay()).toBe(true);
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.pid'), {
        force: true,
      });
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.addr'), {
        force: true,
      });
    });

    it('sends SIGTERM and removes PID and addr files when process stops', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      vi.mocked(sendSignal).mockReturnValueOnce(true);
      vi.mocked(waitFor).mockResolvedValueOnce(true);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay()).toBe(true);
      expect(sendSignal).toHaveBeenCalledWith(1234, 'SIGTERM');
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.pid'), {
        force: true,
      });
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.addr'), {
        force: true,
      });
    });

    it('returns true immediately when SIGTERM finds process already gone', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      vi.mocked(sendSignal).mockReturnValueOnce(false);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay()).toBe(true);
      expect(rm).toHaveBeenCalledWith(expect.stringContaining('relay.pid'), {
        force: true,
      });
    });

    it('returns false when SIGTERM times out and force is not set', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      vi.mocked(sendSignal).mockReturnValueOnce(true);
      vi.mocked(waitFor).mockResolvedValueOnce(false);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay()).toBe(false);
    });

    it('propagates EPERM from sendSignal', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      vi.mocked(sendSignal).mockImplementationOnce(() => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      });
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      await expect(stopRelay()).rejects.toThrow('EPERM');
    });

    it('escalates to SIGKILL with force option', async () => {
      vi.mocked(readPidFile).mockResolvedValueOnce(1234);
      vi.mocked(isProcessAlive).mockReturnValueOnce(true);
      vi.mocked(sendSignal).mockReturnValueOnce(true).mockReturnValueOnce(true);
      vi.mocked(waitFor)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      vi.spyOn(process.stderr, 'write').mockReturnValue(true);

      expect(await stopRelay({ force: true })).toBe(true);
      expect(sendSignal).toHaveBeenCalledWith(1234, 'SIGTERM');
      expect(sendSignal).toHaveBeenCalledWith(1234, 'SIGKILL');
    });
  });
});

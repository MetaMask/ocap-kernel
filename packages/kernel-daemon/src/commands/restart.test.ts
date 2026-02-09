import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import { handleDaemonRestart } from './restart.ts';

vi.mock('../daemon-lifecycle.ts', () => ({
  stopDaemon: vi.fn(),
  startDaemon: vi.fn(),
  flushDaemonStore: vi.fn(),
}));

const makeLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }) as never;

describe('daemon-restart', () => {
  let stopDaemon: Mock;
  let startDaemon: Mock;
  let flushDaemonStore: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const lifecycle = await import('../daemon-lifecycle.ts');
    stopDaemon = lifecycle.stopDaemon as Mock;
    startDaemon = lifecycle.startDaemon as Mock;
    flushDaemonStore = lifecycle.flushDaemonStore as Mock;
  });

  it('stops then starts without flush by default', async () => {
    stopDaemon.mockResolvedValue(undefined);
    startDaemon.mockResolvedValue(42);

    await handleDaemonRestart('/path/to/daemon.mjs', makeLogger());

    expect(stopDaemon).toHaveBeenCalledTimes(1);
    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(flushDaemonStore).not.toHaveBeenCalled();
  });

  it('flushes between stop and start when flush is true', async () => {
    const callOrder: string[] = [];
    stopDaemon.mockImplementation(async () => {
      callOrder.push('stop');
    });
    flushDaemonStore.mockImplementation(async () => {
      callOrder.push('flush');
    });
    startDaemon.mockImplementation(async () => {
      callOrder.push('start');
      return 42;
    });

    await handleDaemonRestart('/path/to/daemon.mjs', makeLogger(), {
      flush: true,
    });

    expect(callOrder).toStrictEqual(['stop', 'flush', 'start']);
  });
});

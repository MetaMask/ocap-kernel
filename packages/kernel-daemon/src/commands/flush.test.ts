import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

import { handleDaemonFlush } from './flush.ts';

vi.mock('../daemon-lifecycle.ts', () => ({
  flushDaemonStore: vi.fn(),
}));

const makeLogger = () =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }) as never;

describe('daemon-flush', () => {
  let flushDaemonStore: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const lifecycle = await import('../daemon-lifecycle.ts');
    flushDaemonStore = lifecycle.flushDaemonStore as Mock;
  });

  it('delegates to flushDaemonStore', async () => {
    flushDaemonStore.mockResolvedValue(undefined);
    const logger = makeLogger();

    await handleDaemonFlush(logger);

    expect(flushDaemonStore).toHaveBeenCalledWith(logger);
  });

  it('propagates errors', async () => {
    flushDaemonStore.mockRejectedValue(
      new Error('Cannot flush while daemon is running'),
    );

    await expect(handleDaemonFlush(makeLogger())).rejects.toThrow(
      'Cannot flush while daemon is running',
    );
  });
});

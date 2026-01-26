import * as kernelErrors from '@metamask/kernel-errors';
import * as kernelUtils from '@metamask/kernel-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { makeReconnectionLifecycle } from './reconnection-lifecycle.ts';
import type { ReconnectionLifecycleDeps } from './reconnection-lifecycle.ts';
import type { Channel } from '../types.ts';

// Mock kernel-utils for abortableDelay
vi.mock('@metamask/kernel-utils', async () => {
  const actual = await vi.importActual<typeof kernelUtils>(
    '@metamask/kernel-utils',
  );
  return {
    ...actual,
    abortableDelay: vi.fn(),
  };
});

// Mock kernel-errors for isRetryableNetworkError
vi.mock('@metamask/kernel-errors', async () => {
  const actual = await vi.importActual<typeof kernelErrors>(
    '@metamask/kernel-errors',
  );
  return {
    ...actual,
    isRetryableNetworkError: vi.fn(),
  };
});

describe('reconnection-lifecycle', () => {
  let deps: ReconnectionLifecycleDeps;
  let abortController: AbortController;
  let mockChannel: Channel;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behaviors
    (kernelUtils.abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (
      kernelErrors.isRetryableNetworkError as ReturnType<typeof vi.fn>
    ).mockReturnValue(true);

    abortController = new AbortController();
    mockChannel = {
      peerId: 'testPeer',
      msgStream: {
        write: vi.fn(),
        read: vi.fn(),
        unwrap: vi.fn(),
      },
    } as unknown as Channel;

    deps = {
      logger: { log: vi.fn() },
      outputError: vi.fn(),
      signal: abortController.signal,
      peerStateManager: {
        getState: vi.fn().mockReturnValue({
          channel: undefined,
          locationHints: ['hint1'],
        }),
        isIntentionallyClosed: vi.fn().mockReturnValue(false),
      },
      reconnectionManager: {
        isReconnecting: vi.fn().mockReturnValue(true),
        shouldRetry: vi.fn().mockReturnValue(true),
        incrementAttempt: vi.fn().mockReturnValue(1),
        calculateBackoff: vi.fn().mockReturnValue(100),
        startReconnection: vi.fn(),
        stopReconnection: vi.fn(),
        resetBackoff: vi.fn(),
      },
      maxRetryAttempts: 3,
      onRemoteGiveUp: vi.fn(),
      dialPeer: vi.fn().mockResolvedValue(mockChannel),
      reuseOrReturnChannel: vi.fn().mockResolvedValue(mockChannel),
      checkConnectionLimit: vi.fn(),
      checkConnectionRateLimit: vi.fn(),
      registerChannel: vi.fn(),
    } as unknown as ReconnectionLifecycleDeps;
  });

  describe('makeReconnectionLifecycle', () => {
    it('returns handleConnectionLoss and attemptReconnection functions', () => {
      const lifecycle = makeReconnectionLifecycle(deps);

      expect(typeof lifecycle.handleConnectionLoss).toBe('function');
      expect(typeof lifecycle.attemptReconnection).toBe('function');
    });
  });

  describe('handleConnectionLoss', () => {
    it('skips reconnection for intentionally closed peers', () => {
      (
        deps.peerStateManager.isIntentionallyClosed as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);
      const lifecycle = makeReconnectionLifecycle(deps);

      lifecycle.handleConnectionLoss('peer1');

      expect(deps.reconnectionManager.startReconnection).not.toHaveBeenCalled();
      expect(deps.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('intentionally closed'),
      );
    });

    it('clears channel on connection loss', () => {
      const state = { channel: mockChannel, locationHints: [] };
      (
        deps.peerStateManager.getState as ReturnType<typeof vi.fn>
      ).mockReturnValue(state);
      const lifecycle = makeReconnectionLifecycle(deps);

      lifecycle.handleConnectionLoss('peer1');

      expect(state.channel).toBeUndefined();
    });

    it('starts reconnection if not already reconnecting', () => {
      (
        deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);
      const lifecycle = makeReconnectionLifecycle(deps);

      lifecycle.handleConnectionLoss('peer1');

      expect(deps.reconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer1',
      );
    });

    it('does not start reconnection if already reconnecting', () => {
      (
        deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);
      const lifecycle = makeReconnectionLifecycle(deps);

      lifecycle.handleConnectionLoss('peer1');

      expect(deps.reconnectionManager.startReconnection).not.toHaveBeenCalled();
    });

    it('logs connection loss message', () => {
      (
        deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);
      const lifecycle = makeReconnectionLifecycle(deps);

      lifecycle.handleConnectionLoss('peer1');

      expect(deps.logger.log).toHaveBeenCalledWith(
        'peer1:: connection lost, initiating reconnection',
      );
    });
  });

  describe('attemptReconnection', () => {
    it('stops when max attempts reached', async () => {
      (
        deps.reconnectionManager.shouldRetry as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);
      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalledWith(
        'peer1',
      );
      expect(deps.onRemoteGiveUp).toHaveBeenCalledWith('peer1');
    });

    it('dials peer with location hints', async () => {
      // Make it succeed on first attempt
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.dialPeer).toHaveBeenCalledWith('peer1', ['hint1']);
    });

    it('registers channel on successful reconnection', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.registerChannel).toHaveBeenCalledWith(
        'peer1',
        mockChannel,
        'reading channel to',
      );
    });

    it('resets backoff on successful reconnection', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reconnectionManager.resetBackoff).toHaveBeenCalledWith(
        'peer1',
      );
      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalledWith(
        'peer1',
      );
    });

    it('stops when signal is aborted during delay', async () => {
      (
        kernelUtils.abortableDelay as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Aborted'));
      abortController.abort();

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalledWith(
        'peer1',
      );
    });

    it('stops when signal is aborted during dial', async () => {
      (deps.dialPeer as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection failed'),
      );
      abortController.abort();

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalled();
    });

    it('gives up on non-retryable errors', async () => {
      (deps.dialPeer as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Auth failed'),
      );
      (
        kernelErrors.isRetryableNetworkError as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalledWith(
        'peer1',
      );
      expect(deps.onRemoteGiveUp).toHaveBeenCalledWith('peer1');
      expect(deps.outputError).toHaveBeenCalledWith(
        'peer1',
        'non-retryable failure',
        expect.any(Error),
      );
    });

    it('retries on retryable errors', async () => {
      (deps.dialPeer as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(mockChannel);

      (
        kernelErrors.isRetryableNetworkError as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // First attempt check
        .mockReturnValueOnce(true) // Second attempt check
        .mockReturnValueOnce(false); // Exit loop

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.dialPeer).toHaveBeenCalledTimes(2);
    });

    it('continues retry loop when reuseOrReturnChannel returns null', async () => {
      (deps.reuseOrReturnChannel as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockChannel);

      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // First attempt
        .mockReturnValueOnce(true) // After null channel
        .mockReturnValueOnce(false); // After success

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.reuseOrReturnChannel).toHaveBeenCalledTimes(2);
    });

    it('checks connection limit before registering', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.checkConnectionLimit).toHaveBeenCalled();
    });

    it('checks connection rate limit before dialing', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.checkConnectionRateLimit).toHaveBeenCalledWith('peer1');
    });

    it('continues loop on ResourceLimitError instead of giving up', async () => {
      const { ResourceLimitError } = kernelErrors;
      (
        deps.checkConnectionRateLimit as ReturnType<typeof vi.fn>
      ).mockImplementationOnce(() => {
        throw new ResourceLimitError('Rate limit exceeded', {
          data: { limitType: 'connectionRate', current: 10, limit: 10 },
        });
      });

      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true) // First attempt - rate limited
        .mockReturnValueOnce(true) // Second attempt - success
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      // Should not call onRemoteGiveUp because rate limit is retryable
      expect(deps.onRemoteGiveUp).not.toHaveBeenCalled();
      // Should have tried twice (once rate limited, once successful)
      expect(deps.reconnectionManager.incrementAttempt).toHaveBeenCalledTimes(
        2,
      );
      expect(deps.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('rate limited'),
      );
    });

    it('logs reconnection attempts', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      expect(deps.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('scheduling reconnection attempt'),
      );
      expect(deps.logger.log).toHaveBeenCalledWith(
        expect.stringContaining('reconnection successful'),
      );
    });

    it('uses default max retry attempts when not specified', async () => {
      deps.maxRetryAttempts = undefined;
      (
        deps.reconnectionManager.shouldRetry as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      // Should use DEFAULT_MAX_RETRY_ATTEMPTS (0 = infinite)
      expect(deps.reconnectionManager.shouldRetry).toHaveBeenCalledWith(
        'peer1',
        0,
      );
    });

    it('cleans up reconnection state when loop exits naturally', async () => {
      (deps.reconnectionManager.isReconnecting as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const lifecycle = makeReconnectionLifecycle(deps);

      await lifecycle.attemptReconnection('peer1');

      // stopReconnection should be called on success
      expect(deps.reconnectionManager.stopReconnection).toHaveBeenCalled();
    });
  });
});

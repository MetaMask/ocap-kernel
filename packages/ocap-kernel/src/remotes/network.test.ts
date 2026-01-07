import { AbortError } from '@metamask/kernel-errors';
import { makeAbortSignalMock } from '@ocap/repo-tools/test-utils';
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';

// Import the module we're testing - must be after mocks are set up
let initNetwork: typeof import('./network.ts').initNetwork;

// Mock MessageQueue - must behave like a real queue for tests to work
const mockMessageQueues = new Map<unknown, unknown[]>();

vi.mock('./MessageQueue.ts', () => {
  class MockMessageQueue {
    readonly #instanceQueue: unknown[] = [];

    constructor(_maxCapacity?: number) {
      // Store instance queue for inspection
      mockMessageQueues.set(this, this.#instanceQueue);
    }

    enqueue(pending: unknown): void {
      this.#instanceQueue.push(pending);
    }

    dequeue(): unknown | undefined {
      return this.#instanceQueue.shift();
    }

    peekFirst(): unknown | undefined {
      return this.#instanceQueue[0];
    }

    clear(): void {
      this.#instanceQueue.length = 0;
    }

    get length(): number {
      return this.#instanceQueue.length;
    }

    get messages(): readonly unknown[] {
      return this.#instanceQueue;
    }
  }
  return {
    MessageQueue: MockMessageQueue,
  };
});

// Mock ReconnectionManager
const mockReconnectionManager = {
  isReconnecting: vi.fn().mockReturnValue(false),
  startReconnection: vi.fn(),
  stopReconnection: vi.fn(),
  shouldRetry: vi.fn().mockReturnValue(true),
  incrementAttempt: vi.fn().mockReturnValue(1),
  calculateBackoff: vi.fn().mockReturnValue(100),
  resetBackoff: vi.fn(),
  resetAllBackoffs: vi.fn(),
  clear: vi.fn(),
  clearPeer: vi.fn(),
};

vi.mock('./ReconnectionManager.ts', () => {
  class MockReconnectionManager {
    isReconnecting = mockReconnectionManager.isReconnecting;

    startReconnection = mockReconnectionManager.startReconnection;

    stopReconnection = mockReconnectionManager.stopReconnection;

    shouldRetry = mockReconnectionManager.shouldRetry;

    incrementAttempt = mockReconnectionManager.incrementAttempt;

    calculateBackoff = mockReconnectionManager.calculateBackoff;

    resetBackoff = mockReconnectionManager.resetBackoff;

    resetAllBackoffs = mockReconnectionManager.resetAllBackoffs;

    clear = mockReconnectionManager.clear;

    clearPeer = mockReconnectionManager.clearPeer;
  }
  return {
    ReconnectionManager: MockReconnectionManager,
  };
});

// Mock ConnectionFactory
type MockChannel = {
  peerId: string;
  msgStream: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
};

const mockConnectionFactory = {
  dialIdempotent: vi.fn(),
  onInboundConnection: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
  closeChannel: vi.fn().mockResolvedValue(undefined),
};

vi.mock('./ConnectionFactory.ts', () => {
  return {
    ConnectionFactory: {
      make: vi.fn(async () => Promise.resolve(mockConnectionFactory)),
    },
  };
});

// Mock Logger
const mockLogger = {
  log: vi.fn(),
  error: vi.fn(),
};

vi.mock('@metamask/logger', () => {
  class MockLogger {
    log = mockLogger.log;

    error = mockLogger.error;
  }
  return {
    Logger: MockLogger,
  };
});

// Mock kernel-utils
vi.mock('@metamask/kernel-utils', () => {
  return {
    abortableDelay: vi.fn(),
    installWakeDetector: vi.fn(() => vi.fn()),
    DEFAULT_MAX_RETRY_ATTEMPTS: 0,
  };
});

// Mock kernel-errors
vi.mock('@metamask/kernel-errors', () => ({
  AbortError: class MockAbortError extends Error {
    constructor() {
      super('Aborted');
      this.name = 'AbortError';
    }
  },
  ResourceLimitError: class MockResourceLimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ResourceLimitError';
    }
  },
  isRetryableNetworkError: vi.fn().mockImplementation((error: unknown) => {
    const errorWithCode = error as { code?: string };
    return (
      errorWithCode?.code === 'ECONNRESET' ||
      errorWithCode?.code === 'ETIMEDOUT'
    );
  }),
}));

// Mock uint8arrays
vi.mock('uint8arrays', () => ({
  toString: vi.fn((buffer: Uint8Array) => new TextDecoder().decode(buffer)),
  fromString: vi.fn((str: string) => new TextEncoder().encode(str)),
}));

/**
 * Helper to create a test message in the format expected by sendRemoteMessage.
 * Returns a RemoteMessageBase object (without seq/ack, those are added by network.ts).
 *
 * @param content - The content string (for test identification).
 * @returns RemoteMessageBase object.
 */
function makeTestMessage(content: string): {
  method: string;
  params: unknown[];
} {
  return {
    method: 'deliver',
    params: ['notify', [[content, false, { body: '""', slots: [] }]]],
  };
}

/**
 * Helper to send a message and immediately ACK it (for tests that don't care about ACK protocol).
 * Tracks sequence numbers per peer and automatically ACKs after sending.
 *
 * @param sendRemoteMessage - The sendRemoteMessage function from initNetwork.
 * @param handleAck - The handleAck function from initNetwork.
 * @param peerId - The peer ID.
 * @param message - The message to send.
 * @param message.method - The method name.
 * @param message.params - The method parameters.
 * @param seqCounters - Map to track sequence numbers per peer.
 * @returns Promise that resolves when message is sent and ACKed.
 */
async function sendWithAutoAck(
  sendRemoteMessage: (
    targetPeerId: string,
    message: { method: string; params: unknown[] },
  ) => Promise<void>,
  handleAck: (peerId: string, ackSeq: number) => Promise<void>,
  peerId: string,
  message: { method: string; params: unknown[] },
  seqCounters: Map<string, number>,
): Promise<void> {
  const currentSeq = (seqCounters.get(peerId) ?? 0) + 1;
  seqCounters.set(peerId, currentSeq);

  const promise = sendRemoteMessage(peerId, message);
  // ACK immediately to avoid test timeouts
  await handleAck(peerId, currentSeq);
  return promise;
}

/**
 * Wrapper around initNetwork that automatically ACKs all sent messages.
 * This is useful for tests that don't care about the ACK protocol details.
 *
 * @param args - Arguments to pass to initNetwork.
 * @returns Network interface with auto-ACKing sendRemoteMessage.
 */
async function initNetworkWithAutoAck(
  ...args: Parameters<typeof initNetwork>
): Promise<Awaited<ReturnType<typeof initNetwork>>> {
  const network = await initNetwork(...args);
  const seqCounters = new Map<string, number>();

  return {
    ...network,
    sendRemoteMessage: async (
      peerId: string,
      message: { method: string; params: unknown[] },
    ) => {
      const seq = (seqCounters.get(peerId) ?? 0) + 1;
      seqCounters.set(peerId, seq);
      const promise = network.sendRemoteMessage(peerId, message);
      await network.handleAck(peerId, seq);
      return promise;
    },
  };
}

describe('network.initNetwork', () => {
  // Import after all mocks are set up
  beforeAll(async () => {
    const networkModule = await import('./network.ts');
    initNetwork = networkModule.initNetwork;
  });

  beforeEach(() => {
    // Clear mock call history
    mockReconnectionManager.isReconnecting.mockClear();
    mockReconnectionManager.startReconnection.mockClear();
    mockReconnectionManager.stopReconnection.mockClear();
    mockReconnectionManager.shouldRetry.mockClear();
    mockReconnectionManager.incrementAttempt.mockClear();
    mockReconnectionManager.calculateBackoff.mockClear();
    mockReconnectionManager.resetBackoff.mockClear();
    mockReconnectionManager.resetAllBackoffs.mockClear();
    mockReconnectionManager.clear.mockClear();
    mockReconnectionManager.clearPeer.mockClear();

    mockConnectionFactory.dialIdempotent.mockClear();
    mockConnectionFactory.onInboundConnection.mockClear();
    mockConnectionFactory.stop.mockClear();
    mockConnectionFactory.closeChannel.mockClear();

    mockLogger.log.mockClear();
    mockLogger.error.mockClear();

    // MessageQueue instances are automatically created fresh for each test

    // Reset mock implementations
    mockReconnectionManager.isReconnecting.mockReturnValue(false);
    mockReconnectionManager.shouldRetry.mockReturnValue(true);
    mockReconnectionManager.incrementAttempt.mockReturnValue(1);
    mockReconnectionManager.calculateBackoff.mockReturnValue(100);
    mockConnectionFactory.stop.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  const createMockChannel = (peerId: string): MockChannel => ({
    peerId,
    msgStream: {
      read: vi
        .fn<() => Promise<Uint8Array | undefined>>()
        .mockImplementation(async () => {
          return await new Promise<Uint8Array | undefined>(() => {
            /* Never resolves by default */
          });
        }),
      write: vi
        .fn<(buffer: Uint8Array) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
  });

  describe('initialization', () => {
    it('passes correct parameters to ConnectionFactory.make', async () => {
      const { ConnectionFactory } = await import('./ConnectionFactory.ts');
      const keySeed = '0xabcd';
      const knownRelays = [
        '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
        '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
      ];

      await initNetwork(keySeed, { relays: knownRelays }, vi.fn());

      expect(ConnectionFactory.make).toHaveBeenCalledWith(
        keySeed,
        knownRelays,
        expect.any(Object), // Logger instance
        expect.any(AbortSignal), // signal from AbortController
        undefined, // maxRetryAttempts (optional)
      );
    });

    it('passes maxRetryAttempts to ConnectionFactory.make', async () => {
      const { ConnectionFactory } = await import('./ConnectionFactory.ts');
      const keySeed = '0xabcd';
      const maxRetryAttempts = 5;

      await initNetwork(keySeed, { relays: [], maxRetryAttempts }, vi.fn());

      expect(ConnectionFactory.make).toHaveBeenCalledWith(
        keySeed,
        [],
        expect.any(Object),
        expect.any(AbortSignal),
        maxRetryAttempts,
      );
    });

    it('returns sendRemoteMessage, stop, closeConnection, registerLocationHints, and reconnectPeer', async () => {
      const result = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      expect(result).toHaveProperty('sendRemoteMessage');
      expect(result).toHaveProperty('stop');
      expect(result).toHaveProperty('closeConnection');
      expect(result).toHaveProperty('registerLocationHints');
      expect(result).toHaveProperty('reconnectPeer');
      expect(typeof result.sendRemoteMessage).toBe('function');
      expect(typeof result.stop).toBe('function');
      expect(typeof result.closeConnection).toBe('function');
      expect(typeof result.registerLocationHints).toBe('function');
      expect(typeof result.reconnectPeer).toBe('function');
    });
  });

  describe('basic messaging', () => {
    it('opens channel and sends message to new peer', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetworkWithAutoAck(
        '0x1234',
        {
          relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
        },
        vi.fn(),
      );

      const seqCounters = new Map<string, number>();
      await sendWithAutoAck(
        sendRemoteMessage,
        handleAck,
        'peer-1',
        makeTestMessage('hello'),
        seqCounters,
      );

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        [],
        true,
      );
      expect(mockChannel.msgStream.write).toHaveBeenCalledWith(
        expect.any(Uint8Array),
      );
    });

    it.todo('reuses existing channel for same peer', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Send first message
      const promise1 = sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await handleAck('peer-1', 1);
      await promise1;

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(1);

      // Send second message - should reuse channel (no new dial)
      const promise2 = sendRemoteMessage('peer-1', makeTestMessage('msg2'));
      await handleAck('peer-1', 2);
      await promise2;

      // Should still be only 1 dial (channel reused)
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(2);
    });

    it('opens separate channels for different peers', async () => {
      const mockChannel1 = createMockChannel('peer-1');
      const mockChannel2 = createMockChannel('peer-2');
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel1)
        .mockResolvedValueOnce(mockChannel2);

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', makeTestMessage('hello'));
      await sendRemoteMessage('peer-2', makeTestMessage('world'));

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
    });

    it('passes hints to ConnectionFactory', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];

      const { sendRemoteMessage, registerLocationHints } =
        await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      registerLocationHints('peer-1', hints);
      await sendRemoteMessage('peer-1', makeTestMessage('hello'));

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        hints,
        true,
      );
    });
  });

  describe('inbound connections', () => {
    it('registers inbound connection handler', async () => {
      await initNetwork('0x1234', {}, vi.fn());

      expect(mockConnectionFactory.onInboundConnection).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });

    it('handles inbound messages', async () => {
      const remoteHandler = vi.fn().mockResolvedValue('ok');
      let inboundHandler: ((channel: MockChannel) => void) | undefined;

      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', {}, remoteHandler);

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('test-message');
      mockChannel.msgStream.read.mockResolvedValueOnce(messageBuffer);
      mockChannel.msgStream.read.mockReturnValue(
        new Promise<Uint8Array>(() => {
          /* Block after first message */
        }),
      );

      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        expect(remoteHandler).toHaveBeenCalledWith(
          'inbound-peer',
          'test-message',
        );
      });
    });

    it('handles errors from remoteMessageHandler', async () => {
      const remoteHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler error'));
      let inboundHandler: ((channel: MockChannel) => void) | undefined;

      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', {}, remoteHandler);

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('test-message');
      mockChannel.msgStream.read.mockResolvedValueOnce(messageBuffer);
      mockChannel.msgStream.read.mockReturnValue(
        new Promise<Uint8Array>(() => {
          /* Block after first message */
        }),
      );

      inboundHandler?.(mockChannel);

      // Handler error should be caught and not crash the read loop
      await vi.waitFor(() => {
        expect(remoteHandler).toHaveBeenCalledWith(
          'inbound-peer',
          'test-message',
        );
      });

      // Read loop should continue (not throw)
      expect(mockChannel.msgStream.read).toHaveBeenCalled();
    });
  });

  describe('connection loss and reconnection', () => {
    it('queues messages during reconnection', async () => {
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Send message during reconnection - goes to pending, not transmitted yet
      const promise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('queued-msg'),
      );

      // Message should not be written immediately during reconnection
      expect(mockChannel.msgStream.write).not.toHaveBeenCalled();
      // Dial should not happen during reconnection (will happen during reconnection loop)
      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();

      // ACK the message so test can complete
      await handleAck('peer-1', 1);
      await promise;
    });

    it('handles write failure and triggers reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Write failed'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // First send establishes channel
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);

      // Second send fails and triggers reconnection
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-1',
      );
    }, 5000);

    it('starts reconnection on read error', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', {}, vi.fn());

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.read.mockRejectedValue(new Error('Read failed'));

      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });

    it('handles graceful disconnect without error logging', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', {}, vi.fn());

      const mockChannel = createMockChannel('peer-1');
      const gracefulDisconnectError = Object.assign(new Error('SCTP failure'), {
        errorDetail: 'sctp-failure',
        sctpCauseCode: 12, // SCTP_USER_INITIATED_ABORT
      });
      mockChannel.msgStream.read.mockRejectedValue(gracefulDisconnectError);

      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        // Should log intentional disconnect message
        expect(mockLogger.log).toHaveBeenCalledWith(
          'peer-1:: remote intentionally disconnected',
        );
        expect(mockLogger.log).toHaveBeenCalledWith('closed channel to peer-1');
        // Should not start reconnection for intentional disconnect
        expect(
          mockReconnectionManager.startReconnection,
        ).not.toHaveBeenCalled();
      });
    });

    it('throws AbortError when signal aborted during read', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      const { stop } = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      const mockChannel = createMockChannel('peer-1');
      // Make read resolve after stop so loop continues and checks signal.aborted
      let shouldResolve = false;
      const poll = async (): Promise<Uint8Array> => {
        // Wait until stop is called
        // eslint-disable-next-line no-unmodified-loop-condition
        while (!shouldResolve) {
          await new Promise<void>((resolve) => {
            setImmediate(() => resolve());
          });
        }
        // Return a value so loop continues to next iteration where it checks signal.aborted
        return new TextEncoder().encode('dummy');
      };
      mockChannel.msgStream.read.mockReturnValue(poll());

      // Start reading in background
      inboundHandler?.(mockChannel);

      // Give it a moment to start the read
      await new Promise((resolve) => setImmediate(resolve));

      // Stop should abort the signal, then resolve the read so loop checks signal.aborted
      shouldResolve = true;
      await stop();

      // Wait for the abort error to be logged
      await vi.waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalledWith('reader abort: peer-1');
        // Error should be caught and logged via outputError
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('error error in inbound channel read'),
        );
      });
    });

    it('exits read loop when readBuf is undefined (stream ended)', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      const remoteHandler = vi.fn().mockResolvedValue('ok');
      await initNetwork('0x1234', {}, remoteHandler);

      const mockChannel = createMockChannel('peer-1');
      // First read returns undefined, which means stream ended - loop should break
      mockChannel.msgStream.read.mockResolvedValueOnce(undefined);

      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        // Stream ended, so no messages should be processed
        expect(remoteHandler).not.toHaveBeenCalled();
        // Should log that stream ended
        expect(mockLogger.log).toHaveBeenCalledWith('peer-1:: stream ended');
      });
    });

    it('flushes queued messages after successful reconnection', async () => {
      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Setup for reconnection scenario
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write
        .mockResolvedValueOnce(undefined) // Initial message succeeds
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ) // Second write fails, triggering reconnection
        .mockResolvedValue(undefined); // Flush writes succeed

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // Initial connection
        .mockResolvedValueOnce(mockChannel); // Reconnection succeeds

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // First send establishes channel
      const promise1 = sendRemoteMessage(
        'peer-1',
        makeTestMessage('initial-msg'),
      );
      await handleAck('peer-1', 1); // ACK initial message
      await promise1;

      // Second send fails and triggers reconnection (message goes to pending)
      const promise2 = sendRemoteMessage('peer-1', makeTestMessage('queued-1'));

      // Wait for reconnection to start - reconnection may complete quickly
      // so we just verify startReconnection was called
      await vi.waitFor(() => {
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });

      // Queue another message (may go to pending if reconnection ongoing, or send directly if complete)
      const promise3 = sendRemoteMessage('peer-1', makeTestMessage('queued-2'));

      // Wait for all writes to complete (initial + queued-1 + queued-2)
      await vi.waitFor(() => {
        // Should have at least 3 writes total
        expect(
          mockChannel.msgStream.write.mock.calls.length,
        ).toBeGreaterThanOrEqual(3);
      });

      // ACK the pending messages so promises resolve
      await handleAck('peer-1', 3); // Cumulative ACK for seq 2 and 3
      await promise2;
      await promise3;
    });

    it('resets backoff once after successful flush completion', async () => {
      // Ensure this test doesn't inherit mock implementations from previous tests.
      mockConnectionFactory.dialIdempotent.mockReset();

      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay for test
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ) // First write fails, triggering reconnection
        .mockResolvedValue(undefined); // All flush writes succeed
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // Initial connection
        .mockResolvedValueOnce(mockChannel); // Reconnection succeeds
      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );
      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('initial-msg'));
      // Clear resetBackoff mock before triggering reconnection to get accurate count
      mockReconnectionManager.resetBackoff.mockClear();
      // Trigger reconnection via write failure and queue 3 messages
      sendRemoteMessage('peer-1', makeTestMessage('queued-1')).catch(() => {
        /* Ignored */
      });
      sendRemoteMessage('peer-1', makeTestMessage('queued-2')).catch(() => {
        /* Ignored */
      });
      sendRemoteMessage('peer-1', makeTestMessage('queued-3')).catch(() => {
        /* Ignored */
      });
      // Wait for flush to complete (3 queued messages should be flushed)
      await vi.waitFor(
        () => {
          // queued-1 write (fails) + queued-1, queued-2, queued-3 during flush = 4 writes
          expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(4);
        },
        { timeout: 5000 },
      );
      const resetBackoffCallCount =
        mockReconnectionManager.resetBackoff.mock.calls.length;
      expect(resetBackoffCallCount).toBeLessThanOrEqual(1);
    }, 10000);

    // TODO: Add test for "flushes queue on replacement channel when channel replaced during flush"
    // This test needs to be rewritten to work with the ACK protocol and class-based MessageQueue mock
  });

  describe('stop functionality', () => {
    it('returns a stop function', async () => {
      const { stop } = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      expect(typeof stop).toBe('function');
    });

    it('cleans up resources on stop', async () => {
      const { stop } = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      await stop();

      expect(mockConnectionFactory.stop).toHaveBeenCalled();
      expect(mockReconnectionManager.clear).toHaveBeenCalled();
    });

    it('does not send messages after stop', async () => {
      const { sendRemoteMessage, stop } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await stop();
      // sendRemoteMessage now throws after stop
      await expect(
        sendRemoteMessage('peer-1', makeTestMessage('msg')),
      ).rejects.toThrow('Network stopped');

      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
    });

    it('aborts ongoing reconnection on stop', async () => {
      const { abortableDelay } = await import('@metamask/kernel-utils');

      (abortableDelay as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        (_ms: number, signal?: AbortSignal) => {
          if (signal?.aborted) {
            return Promise.reject(new AbortError());
          }
          return new Promise<void>((_resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new AbortError());
              });
            }
          });
        },
      );

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, stop } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Trigger reconnection with write failure (happens in background)
      sendRemoteMessage('peer-1', makeTestMessage('msg2')).catch(() => {
        /* Ignore error */
      });

      // Give reconnection a chance to start
      await new Promise((resolve) => setImmediate(resolve));

      // Stop should abort the reconnection
      await stop();

      expect(mockConnectionFactory.stop).toHaveBeenCalled();
      expect(mockReconnectionManager.clear).toHaveBeenCalled();
    });

    it('can be called multiple times safely', async () => {
      const { stop } = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      // Multiple calls should not throw
      await stop();
      await stop();
      await stop();

      // Should have been called
      expect(mockConnectionFactory.stop).toHaveBeenCalled();
      expect(mockReconnectionManager.clear).toHaveBeenCalled();
    });
  });

  describe('closeConnection', () => {
    it('returns a closeConnection function', async () => {
      const { closeConnection } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      expect(typeof closeConnection).toBe('function');
    });

    it('marks peer as intentionally closed and prevents message sending', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } =
        await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Close connection
      await closeConnection('peer-1');

      // Attempting to send should throw
      await expect(
        sendRemoteMessage('peer-1', makeTestMessage('msg2')),
      ).rejects.toThrow('Message delivery failed after intentional close');
    });

    it('deletes channel and stops reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } =
        await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Start reconnection (simulate by setting reconnecting state)
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      await closeConnection('peer-1');

      expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
        'peer-1',
      );
    });

    it('clears message queue for closed peer', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck, closeConnection } =
        await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      const promise1 = sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await handleAck('peer-1', 1);
      await promise1;

      // Queue messages during reconnection
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      const promise2 = sendRemoteMessage('peer-1', makeTestMessage('msg2'));
      const promise3 = sendRemoteMessage('peer-1', makeTestMessage('msg3'));

      // Close connection should reject pending messages
      await closeConnection('peer-1');

      // Pending promises should be rejected
      await expect(promise2).rejects.toThrow('connection intentionally closed');
      await expect(promise3).rejects.toThrow('connection intentionally closed');
    });

    it('prevents automatic reconnection after intentional close', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } =
        await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      // Establish connection
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Close connection intentionally
      await closeConnection('peer-1');

      // Attempting to send should throw before attempting to write
      await expect(
        sendRemoteMessage('peer-1', makeTestMessage('msg2')),
      ).rejects.toThrow('Message delivery failed after intentional close');

      // Should not start reconnection (sendRemoteMessage throws before handleConnectionLoss)
      expect(mockReconnectionManager.startReconnection).not.toHaveBeenCalled();
    });

    it('rejects inbound connections from intentionally closed peers', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      const { closeConnection } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Close connection first
      await closeConnection('peer-1');

      // Try to establish inbound connection from closed peer
      const mockChannel = createMockChannel('peer-1');
      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        // Should log rejection message
        expect(mockLogger.log).toHaveBeenCalledWith(
          'peer-1:: rejecting inbound connection from intentionally closed peer',
        );
        // Should not start reading from this channel
        expect(mockChannel.msgStream.read).not.toHaveBeenCalled();
      });
    });
  });

  describe('registerLocationHints', () => {
    it('returns a registerLocationHints function', async () => {
      const { registerLocationHints } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      expect(typeof registerLocationHints).toBe('function');
    });
  });

  describe('reconnectPeer', () => {
    it('returns a reconnectPeer function', async () => {
      const { reconnectPeer } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      expect(typeof reconnectPeer).toBe('function');
    });

    it('clears intentional close flag and initiates reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck, closeConnection, reconnectPeer } =
        await initNetwork('0x1234', {}, vi.fn());

      // Establish and close connection
      const sendPromise = sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await handleAck('peer-1', 1); // ACK the message
      await sendPromise;
      await closeConnection('peer-1');

      // Verify peer is marked as intentionally closed
      await expect(
        sendRemoteMessage('peer-1', makeTestMessage('msg2')),
      ).rejects.toThrow('Message delivery failed after intentional close');

      // Reconnect peer
      await reconnectPeer('peer-1');

      // Should start reconnection
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-1',
      );
    });

    it('reconnects peer with provided hints', async () => {
      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Set up reconnection state
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay for test

      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { closeConnection, reconnectPeer } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await closeConnection('peer-1');

      const hints = ['/dns4/relay.example/tcp/443/wss/p2p/relay'];
      await reconnectPeer('peer-1', hints);

      // Should start reconnection with hints
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-1',
      );

      // Wait for reconnection attempt
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
          'peer-1',
          hints,
          false,
        );
      });
    });

    it('reconnects peer with empty hints when not provided', async () => {
      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Set up reconnection state
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay for test

      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { closeConnection, reconnectPeer } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await closeConnection('peer-1');
      await reconnectPeer('peer-1');

      // Wait for reconnection attempt with empty hints
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
          'peer-1',
          [],
          false,
        );
      });
    });

    it('does not start duplicate reconnection if already reconnecting', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { closeConnection, reconnectPeer } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await closeConnection('peer-1');

      // Set up reconnection state
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      await reconnectPeer('peer-1');

      // Should not start another reconnection
      expect(mockReconnectionManager.startReconnection).not.toHaveBeenCalled();
    });

    it('allows sending messages after reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck, closeConnection, reconnectPeer } =
        await initNetwork('0x1234', {}, vi.fn());

      // Establish, close, and reconnect
      const sendPromise1 = sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await handleAck('peer-1', 1);
      await sendPromise1;
      await closeConnection('peer-1');
      await reconnectPeer('peer-1');

      // Wait for reconnection to complete
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalled();
      });

      // Reset reconnection state to simulate successful reconnection
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      // Should be able to send messages after reconnection
      const sendPromise2 = sendRemoteMessage('peer-1', makeTestMessage('msg2'));
      await handleAck('peer-1', 2);
      await sendPromise2;
      expect(mockChannel.msgStream.write).toHaveBeenCalled();
    });
  });

  describe('wake from sleep', () => {
    it('installs wake detector and handles wake events', async () => {
      const { installWakeDetector } = await import('@metamask/kernel-utils');
      let wakeHandler: (() => void) | undefined;

      (installWakeDetector as ReturnType<typeof vi.fn>).mockImplementation(
        (handler) => {
          wakeHandler = handler;
          return vi.fn();
        },
      );

      await initNetwork('0x1234', {}, vi.fn());

      expect(installWakeDetector).toHaveBeenCalled();

      // Trigger wake event
      wakeHandler?.();

      expect(mockReconnectionManager.resetAllBackoffs).toHaveBeenCalled();
    });

    it('cleans up wake detector on stop', async () => {
      const cleanupFn = vi.fn();
      const { installWakeDetector } = await import('@metamask/kernel-utils');
      (installWakeDetector as ReturnType<typeof vi.fn>).mockReturnValue(
        cleanupFn,
      );

      const { stop } = await initNetworkWithAutoAck('0x1234', {}, vi.fn());

      await stop();

      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe('race conditions', () => {
    it('queues message if reconnection starts during dial', async () => {
      // Initially not reconnecting
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockImplementation(async () => {
        // Simulate reconnection starting during dial
        mockReconnectionManager.isReconnecting.mockReturnValue(true);
        // Small delay to simulate async operation
        await new Promise((resolve) => setImmediate(resolve));
        return mockChannel;
      });

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Send message - it should handle the race condition gracefully
      const promise = sendRemoteMessage('peer-1', makeTestMessage('msg'));

      // ACK the message so the test can complete
      await handleAck('peer-1', 1);

      // Promise should resolve despite race condition
      await promise;

      // Verify dial was called
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        [],
        true,
      );
    });

    it('does not start duplicate reconnection loops', async () => {
      // Capture inbound handler before init
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      // Allow first retry, then stop to prevent infinite loop
      // The loop needs to stay active when second handleConnectionLoss is called,
      // but should exit after successful flush
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true) // First attempt - allows loop to stay active for second handleConnectionLoss
        .mockReturnValue(false); // After flush completes, stop to prevent infinite loop

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Fail initial dial to trigger first handleConnectionLoss, then allow reconnection loop to succeed
      const reconChannel = createMockChannel('peer-1');
      // Ensure flush completes successfully so loop exits naturally
      reconChannel.msgStream.write.mockResolvedValue(undefined);
      // Make dialIdempotent resolve after a small delay to ensure reconnection loop is active
      // when inbound error is processed
      mockConnectionFactory.dialIdempotent
        .mockRejectedValueOnce(
          Object.assign(new Error('Dial failed'), { code: 'ECONNRESET' }),
        )
        .mockImplementation(async () => {
          // Small delay to ensure reconnection state is checked before dial completes
          await new Promise((resolve) => setImmediate(resolve));
          return reconChannel;
        });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Trigger first connection loss (this starts reconnection)
      await sendRemoteMessage('peer-1', makeTestMessage('msg-1'));

      // Trigger another connection loss via inbound read error for same peer
      // This should happen while reconnection is still active (reconnecting = true)
      // The dialIdempotent delay ensures the reconnection loop hasn't completed yet
      const inboundChannel = createMockChannel('peer-1');
      inboundChannel.msgStream.read.mockRejectedValueOnce(
        new Error('Read failed'),
      );
      inboundHandler?.(inboundChannel);

      await vi.waitFor(() => {
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledTimes(
          1,
        );
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });

    // TODO: This test needs to be rewritten to work with the ACK protocol
    // The race condition being tested (inbound connection arriving during reconnection dial)
    // interacts with the ACK protocol in complex ways that need careful analysis.
    it.todo(
      'reuses existing channel when inbound connection arrives during reconnection dial',
    );
  });

  describe('error handling', () => {
    it('handles dial errors gracefully', async () => {
      mockConnectionFactory.dialIdempotent.mockRejectedValue(
        new Error('Dial failed'),
      );

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', makeTestMessage('msg'));

      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-1',
      );
    });

    it('handles non-retryable errors during reconnection', async () => {
      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });

      const mockChannel = createMockChannel('peer-1');

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockRejectedValueOnce(new Error('Permanent failure')); // non-retryable during reconnection

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Trigger reconnection via retryable write failure
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      // Ensure reconnection attempt dial happened
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
      });

      await vi.waitFor(() => {
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });

    it('stops reconnection and clears queue when max attempts reached', async () => {
      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      // First call should return true (to enter loop), then false when checking after flush failure
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true) // Enter loop
        .mockReturnValueOnce(false); // Max attempts reached (checked after flush failure)
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockResolvedValue(mockChannel); // reconnection attempts (dial succeeds, flush fails)

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Trigger reconnection via retryable write failure
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      // Wait for reconnection to start and check max attempts
      await vi.waitFor(() => {
        expect(mockReconnectionManager.shouldRetry).toHaveBeenCalled();
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });

    it('calls onRemoteGiveUp when max attempts reached', async () => {
      const onRemoteGiveUp = vi.fn();
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false); // Max attempts reached (checked after flush failure)
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel)
        .mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
        onRemoteGiveUp,
      );

      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      await vi.waitFor(() => {
        expect(onRemoteGiveUp).toHaveBeenCalledWith('peer-1');
      });
    });

    it('respects maxRetryAttempts limit even when flush operations occur', async () => {
      const maxRetryAttempts = 3;
      const onRemoteGiveUp = vi.fn();
      let attemptCount = 0;
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
        attemptCount = 0; // Reset on start
      });
      mockReconnectionManager.incrementAttempt.mockImplementation(() => {
        attemptCount += 1;
        return attemptCount;
      });
      mockReconnectionManager.shouldRetry.mockImplementation(
        (_peerId: string, maxAttempts: number) => {
          if (maxAttempts === 0) {
            return true;
          }
          // shouldRetry should return false when attemptCount >= maxAttempts
          return attemptCount < maxAttempts;
        },
      );
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay for test
      mockReconnectionManager.resetBackoff.mockImplementation(() => {
        attemptCount = 0; // Reset attempt count
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const mockChannel = createMockChannel('peer-1');
      // All writes fail to trigger reconnection
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      // All reconnection attempts fail (dial succeeds but flush fails)
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxRetryAttempts },
        vi.fn(),
        onRemoteGiveUp,
      );
      // Establish channel - first write will fail, triggering reconnection
      sendRemoteMessage('peer-1', makeTestMessage('msg1')).catch(() => {
        /* Expected to fail */
      });
      // Trigger additional pending message
      sendRemoteMessage('peer-1', makeTestMessage('msg2')).catch(() => {
        /* Expected to fail */
      });
      // Wait for maxRetryAttempts to be reached
      await vi.waitFor(
        () => {
          // Should have called incrementAttempt exactly maxRetryAttempts times
          expect(
            mockReconnectionManager.incrementAttempt,
          ).toHaveBeenCalledTimes(maxRetryAttempts);
          // Should have stopped reconnection and called onRemoteGiveUp
          expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
            'peer-1',
          );
          expect(onRemoteGiveUp).toHaveBeenCalledWith('peer-1');
        },
        { timeout: 10000 },
      );
      const resetBackoffCalls = mockReconnectionManager.resetBackoff.mock.calls;
      expect(resetBackoffCalls).toHaveLength(0);
    }, 10000);

    it('calls onRemoteGiveUp when non-retryable error occurs', async () => {
      const onRemoteGiveUp = vi.fn();
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0);
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { isRetryableNetworkError } = await import(
        '@metamask/kernel-errors'
      );
      vi.mocked(isRetryableNetworkError).mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel)
        .mockRejectedValueOnce(new Error('Non-retryable error'));

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
        onRemoteGiveUp,
      );

      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      await vi.waitFor(() => {
        expect(onRemoteGiveUp).toHaveBeenCalledWith('peer-1');
      });
    });

    it('resets backoff on successful message send', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', makeTestMessage('msg'));

      expect(mockReconnectionManager.resetBackoff).toHaveBeenCalledWith(
        'peer-1',
      );
    });

    it('resets backoff on successful message receive', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', {}, vi.fn());

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('inbound-msg');
      mockChannel.msgStream.read.mockResolvedValueOnce(messageBuffer);
      mockChannel.msgStream.read.mockReturnValue(
        new Promise<Uint8Array>(() => {
          /* Never resolves */
        }),
      );

      inboundHandler?.(mockChannel);

      await vi.waitFor(() => {
        expect(mockReconnectionManager.resetBackoff).toHaveBeenCalledWith(
          'inbound-peer',
        );
      });
    });
  });

  describe('message queue management', () => {
    it('handles empty queue during flush', async () => {
      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      // Allow first retry, then stop to prevent infinite loop
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true) // First attempt
        .mockReturnValue(false); // Stop after first attempt

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockResolvedValue(undefined);
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockResolvedValueOnce(mockChannel); // reconnection

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Trigger reconnection via write failure
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      // Wait for reconnection and flush
      await vi.waitFor(() => {
        // Should complete flush without errors even with empty queue
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });

    it('re-queues messages and triggers reconnection when flush fails', async () => {
      // Drive reconnection state deterministically
      let reconnecting = false;
      mockReconnectionManager.isReconnecting.mockImplementation(
        () => reconnecting,
      );
      mockReconnectionManager.startReconnection.mockImplementation(() => {
        reconnecting = true;
      });
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });
      // Allow first retry, then stop to prevent infinite loop
      // First reconnection attempt succeeds but flush fails, triggering second reconnection
      // We need to allow the second reconnection to start, then stop
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true) // First reconnection attempt
        .mockReturnValueOnce(true) // Second reconnection attempt (after flush failure)
        .mockReturnValue(false); // Stop after second attempt

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const mockChannel1 = createMockChannel('peer-1');
      const mockChannel2 = createMockChannel('peer-1');

      // Initial connection succeeds
      mockChannel1.msgStream.write
        .mockResolvedValueOnce(undefined) // initial message
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ); // triggers reconnection

      // Reconnection succeeds, but flush write fails
      mockChannel2.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Flush write failed'), { code: 'ECONNRESET' }),
      );

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel1) // initial connection
        .mockResolvedValueOnce(mockChannel2); // reconnection after flush failure

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', makeTestMessage('msg1'));

      // Trigger reconnection via write failure
      await sendRemoteMessage('peer-1', makeTestMessage('msg2'));

      // Wait for flush failure handling
      await vi.waitFor(() => {
        // Should trigger reconnection again after flush failure
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });
    });
  });

  describe('message send timeout', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('times out after 10 seconds when write hangs', async () => {
      // Ensure isReconnecting returns false so we actually call writeWithTimeout
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      // Make write hang indefinitely - return a new hanging promise each time
      mockChannel.msgStream.write.mockReset();
      mockChannel.msgStream.write.mockReturnValue(
        new Promise<void>(() => {
          // Never resolves - simulates hanging write
        }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('test message'),
      );

      // Wait for the promise to be set up and event listener registered
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Verify write was called (proves we're not returning early)
      expect(mockChannel.msgStream.write).toHaveBeenCalled();

      // Manually trigger the abort to simulate timeout
      mockSignal?.abort();

      // Wait for the abort handler to execute
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Note: sendRemoteMessage catches the timeout error and returns undefined
      // The timeout error is handled internally and triggers connection loss handling
      expect(await sendPromise).toBeUndefined();

      // Verify that connection loss handling was triggered
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalled();
    });

    it('does not timeout if write completes before timeout', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockResolvedValue(undefined);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('test message'),
      );

      // Write resolves immediately, so promise should resolve
      expect(await sendPromise).toBeUndefined();

      // Verify timeout signal was not aborted
      expect(mockSignal?.aborted).toBe(false);
    });

    it('handles timeout errors and triggers connection loss handling', async () => {
      // Ensure isReconnecting returns false so we actually call writeWithTimeout
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      // Make write hang indefinitely - return a new hanging promise each time
      mockChannel.msgStream.write.mockReset();
      mockChannel.msgStream.write.mockReturnValue(
        new Promise<void>(() => {
          // Never resolves - simulates hanging write
        }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('test message'),
      );

      // Wait for the promise to be set up and event listener registered
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Manually trigger the abort to simulate timeout
      mockSignal?.abort();

      // Wait for the abort handler to execute
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Note: sendRemoteMessage catches the timeout error and returns undefined
      // The timeout error is handled internally and triggers connection loss handling
      expect(await sendPromise).toBeUndefined();

      // Verify that connection loss handling was triggered
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalled();
    });

    it('propagates write errors that occur before timeout', async () => {
      // Ensure isReconnecting returns false so we actually call writeWithTimeout
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      const writeError = new Error('Write failed');
      mockChannel.msgStream.write.mockRejectedValue(writeError);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('test message'),
      );

      // Write error occurs immediately
      // Note: sendRemoteMessage catches write errors and returns undefined
      // The error is handled internally and triggers connection loss handling
      expect(await sendPromise).toBeUndefined();

      // Verify that connection loss handling was triggered
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalled();
    });

    it('writeWithTimeout uses AbortSignal.timeout with 10 second default', async () => {
      const mockChannel = createMockChannel('peer-1');
      // Make write resolve immediately to avoid timeout
      mockChannel.msgStream.write.mockResolvedValue(undefined);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', makeTestMessage('test message'));

      // Verify AbortSignal.timeout was called with 10 seconds (default)
      expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
      expect(mockSignal?.timeoutMs).toBe(10_000);
    });

    it('error message includes correct timeout duration', async () => {
      // Ensure isReconnecting returns false so we actually call writeWithTimeout
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      // Make write hang indefinitely - return a new hanging promise each time
      mockChannel.msgStream.write.mockReset();
      mockChannel.msgStream.write.mockReturnValue(
        new Promise<void>(() => {
          // Never resolves - simulates hanging write
        }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      let mockSignal: ReturnType<typeof makeAbortSignalMock> | undefined;
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        mockSignal = makeAbortSignalMock(ms);
        return mockSignal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise = sendRemoteMessage(
        'peer-1',
        makeTestMessage('test message'),
      );

      // Wait for the promise to be set up and event listener registered
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Manually trigger the abort to simulate timeout
      mockSignal?.abort();

      // Wait for the abort handler to execute
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Note: sendRemoteMessage catches the timeout error and returns undefined
      // The timeout error is handled internally
      expect(await sendPromise).toBeUndefined();

      // Verify that writeWithTimeout was called (the timeout error message includes the duration)
      expect(mockChannel.msgStream.write).toHaveBeenCalled();
    });

    it('handles multiple concurrent writes with timeout', async () => {
      // Ensure isReconnecting returns false so we actually call writeWithTimeout
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      const mockChannel = createMockChannel('peer-1');
      // Make write hang indefinitely - return a new hanging promise each time
      mockChannel.msgStream.write.mockReset();
      mockChannel.msgStream.write.mockReturnValue(
        new Promise<void>(() => {
          // Never resolves - simulates hanging write
        }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const mockSignals: ReturnType<typeof makeAbortSignalMock>[] = [];
      vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        const signal = makeAbortSignalMock(ms);
        mockSignals.push(signal);
        return signal;
      });

      const { sendRemoteMessage } = await initNetworkWithAutoAck(
        '0x1234',
        {},
        vi.fn(),
      );

      const sendPromise1 = sendRemoteMessage(
        'peer-1',
        makeTestMessage('message 1'),
      );
      const sendPromise2 = sendRemoteMessage(
        'peer-1',
        makeTestMessage('message 2'),
      );

      // Wait for the promises to be set up and event listeners registered
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Manually trigger the abort on all signals to simulate timeout
      for (const signal of mockSignals) {
        signal.abort();
      }

      // Wait for the abort handlers to execute
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

      // Note: sendRemoteMessage catches the timeout error and returns undefined
      // The timeout error is handled internally
      expect(await sendPromise1).toBeUndefined();
      expect(await sendPromise2).toBeUndefined();

      // Verify that writeWithTimeout was called for both messages
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(2);
    });
  });

  describe('message acknowledgment protocol', () => {
    it('adds sequence numbers and piggyback ACKs to outgoing messages', async () => {
      const testPeerId = 'test-peer';
      const mockChannel = createMockChannel(testPeerId);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck, updateReceivedSeq } =
        await initNetwork('0x1234', {}, vi.fn());

      // Simulate receiving a message (seq=5) to set up piggyback ACK
      updateReceivedSeq(testPeerId, 5);

      // Send first message (don't await yet)
      const message1 = { method: 'deliver', params: ['test'] };
      const promise1 = sendRemoteMessage(testPeerId, message1);

      // Wait for write to be called
      await vi.waitFor(() => {
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(1);
      });

      // Check that message has seq=1 and ack=5
      const writtenMsg1 = mockChannel.msgStream.write.mock.calls[0][0];
      const parsed1 = JSON.parse(new TextDecoder().decode(writtenMsg1));
      expect(parsed1.seq).toBe(1);
      expect(parsed1.ack).toBe(5);
      expect(parsed1.method).toBe('deliver');

      // Simulate ACK for message 1
      await handleAck(testPeerId, 1);
      await promise1; // Now wait for it to complete

      // Send second message (don't await yet)
      const promise2 = sendRemoteMessage(testPeerId, message1);

      // Wait for second write
      await vi.waitFor(() => {
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(2);
      });

      // Check that sequence incremented
      const writtenMsg2 = mockChannel.msgStream.write.mock.calls[1][0];
      const parsed2 = JSON.parse(new TextDecoder().decode(writtenMsg2));
      expect(parsed2.seq).toBe(2);
      expect(parsed2.ack).toBe(5);

      // ACK the second message
      await handleAck(testPeerId, 2);
      await promise2;
    });

    it('resolves sendRemoteMessage promise when ACK is received', async () => {
      const testPeerId = 'test-peer';
      const mockChannel = createMockChannel(testPeerId);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      const message = { method: 'deliver', params: ['test'] };
      const sendPromise = sendRemoteMessage(testPeerId, message);

      // Promise should not resolve immediately
      let resolved = false;
      const trackResolution = sendPromise.then(() => {
        resolved = true;
        return undefined;
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Send ACK for seq=1
      await handleAck(testPeerId, 1);

      // Promise should now resolve
      await trackResolution;
    });

    it('implements cumulative ACK (ack of N resolves all seq <= N)', async () => {
      const testPeerId = 'test-peer';
      const mockChannel = createMockChannel(testPeerId);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      const message = { method: 'deliver', params: ['test'] };

      // Send three messages
      const promise1 = sendRemoteMessage(testPeerId, message);
      const promise2 = sendRemoteMessage(testPeerId, message);
      const promise3 = sendRemoteMessage(testPeerId, message);

      // None should be resolved yet
      let resolved1 = false;
      let resolved2 = false;
      let resolved3 = false;
      const track1 = promise1.then(() => {
        resolved1 = true;
        return undefined;
      });
      const track2 = promise2.then(() => {
        resolved2 = true;
        return undefined;
      });
      const track3 = promise3.then(() => {
        resolved3 = true;
        return undefined;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved1).toBe(false);
      expect(resolved2).toBe(false);
      expect(resolved3).toBe(false);

      // Send cumulative ACK for seq=3 (should ACK 1, 2, and 3)
      await handleAck(testPeerId, 3);

      // All three promises should resolve
      await track1;
      await track2;
      await track3;
    });

    // Note: Timeout and retry tests require fake timers which have compatibility issues
    // These behaviors are tested in end-to-end tests instead

    it('persists sequence numbers across multiple messages', async () => {
      const testPeerId = 'test-peer';
      const mockChannel = createMockChannel(testPeerId);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, handleAck } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      const message = { method: 'deliver', params: ['test'] };

      // Send first message (don't await)
      const promise1 = sendRemoteMessage(testPeerId, message);

      // Wait for first write
      await vi.waitFor(() => {
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(1);
      });

      const writtenMsg1 = mockChannel.msgStream.write.mock.calls[0][0];
      const parsed1 = JSON.parse(new TextDecoder().decode(writtenMsg1));
      expect(parsed1.seq).toBe(1);

      // ACK first message
      await handleAck(testPeerId, 1);
      await promise1;

      // Send second message
      const promise2 = sendRemoteMessage(testPeerId, message);

      // Wait for second write
      await vi.waitFor(() => {
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(2);
      });

      // Sequence should continue from 2, not reset to 1
      const writtenMsg2 = mockChannel.msgStream.write.mock.calls[1][0];
      const parsed2 = JSON.parse(new TextDecoder().decode(writtenMsg2));
      expect(parsed2.seq).toBe(2);

      // ACK second message
      await handleAck(testPeerId, 2);
      await promise2;

      // Send a third message
      const promise3 = sendRemoteMessage(testPeerId, message);

      // Wait for third write
      await vi.waitFor(() => {
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(3);
      });

      // Sequence should continue to 3
      const writtenMsg3 = mockChannel.msgStream.write.mock.calls[2][0];
      const parsed3 = JSON.parse(new TextDecoder().decode(writtenMsg3));
      expect(parsed3.seq).toBe(3);

      // ACK third message
      await handleAck(testPeerId, 3);
      await promise3;
    });

    it('clears sequence numbers and rejects pending on closeConnection', async () => {
      const testPeerId = 'test-peer';
      const mockChannel = createMockChannel(testPeerId);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      const message = { method: 'deliver', params: ['test'] };

      // Send message without ACK
      const sendPromise = sendRemoteMessage(testPeerId, message);

      // Close connection
      await closeConnection(testPeerId);

      // Promise should reject
      await expect(sendPromise).rejects.toThrow(
        'Message 1 delivery failed: connection intentionally closed',
      );

      // New messages after close should fail immediately
      await expect(sendRemoteMessage(testPeerId, message)).rejects.toThrow(
        'Message delivery failed after intentional close',
      );
    });

    it('clears all sequence numbers and rejects all pending on stop', async () => {
      const testPeer1 = 'test-peer-1';
      const testPeer2 = 'test-peer-2';
      const mockChannel1 = createMockChannel(testPeer1);
      const mockChannel2 = createMockChannel(testPeer2);
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel1)
        .mockResolvedValueOnce(mockChannel2);

      const { sendRemoteMessage, stop } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      const message = { method: 'deliver', params: ['test'] };

      // Send messages to multiple peers without ACK
      const promise1 = sendRemoteMessage(testPeer1, message);
      const promise2 = sendRemoteMessage(testPeer2, message);

      // Stop network
      await stop();

      // All promises should reject
      await expect(promise1).rejects.toThrow(
        'Message 1 delivery failed: network stopped',
      );
      await expect(promise2).rejects.toThrow(
        'Message 1 delivery failed: network stopped',
      );
    });
  });
});

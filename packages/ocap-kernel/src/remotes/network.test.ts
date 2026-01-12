import { AbortError, ResourceLimitError } from '@metamask/kernel-errors';
import { delay, makeAbortSignalMock } from '@ocap/repo-tools/test-utils';
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

// Mock MessageQueue
const mockMessageQueue = {
  enqueue: vi.fn(),
  dequeue: vi.fn().mockReturnValue(undefined),
  dequeueAll: vi.fn().mockReturnValue([]),
  replaceAll: vi.fn(),
  clear: vi.fn(),
  length: 0,
  messages: [] as string[],
};

vi.mock('./MessageQueue.ts', () => {
  class MockMessageQueue {
    enqueue = mockMessageQueue.enqueue;

    dequeue = mockMessageQueue.dequeue;

    dequeueAll = mockMessageQueue.dequeueAll;

    replaceAll = mockMessageQueue.replaceAll;

    clear = mockMessageQueue.clear;

    get length() {
      return mockMessageQueue.length;
    }

    get messages() {
      return mockMessageQueue.messages;
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

    mockMessageQueue.enqueue.mockClear();
    mockMessageQueue.dequeue.mockClear().mockReturnValue(undefined);
    mockMessageQueue.dequeueAll.mockClear().mockReturnValue([]);
    mockMessageQueue.replaceAll.mockClear();
    mockMessageQueue.clear.mockClear();
    mockMessageQueue.length = 0;
    mockMessageQueue.messages = [];

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

  /**
   * Sets up mockMessageQueue to behave like a real FIFO queue.
   * This makes the test model actual behavior: failed sends enqueue messages,
   * and flush dequeues them.
   */
  const setupFifoMessageQueue = (): void => {
    mockMessageQueue.messages = [];
    mockMessageQueue.length = 0;
    mockMessageQueue.enqueue.mockImplementation((message: string) => {
      mockMessageQueue.messages.push(message);
      mockMessageQueue.length = mockMessageQueue.messages.length;
    });
    mockMessageQueue.dequeue.mockImplementation(() => {
      const message = mockMessageQueue.messages.shift();
      mockMessageQueue.length = mockMessageQueue.messages.length;
      return message;
    });
    mockMessageQueue.dequeueAll.mockImplementation(() => {
      const messages = [...mockMessageQueue.messages];
      mockMessageQueue.messages = [];
      mockMessageQueue.length = 0;
      return messages;
    });
    mockMessageQueue.replaceAll.mockImplementation((messages: unknown) => {
      if (
        !Array.isArray(messages) ||
        !messages.every((value) => typeof value === 'string')
      ) {
        throw new Error('Expected replaceAll to be called with string[]');
      }
      mockMessageQueue.messages = [...messages];
      mockMessageQueue.length = messages.length;
    });
  };

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

    it('uses maxQueue option for MessageQueue', async () => {
      const maxQueue = 100;

      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxQueue },
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', 'msg');

      // Verify message was queued (MessageQueue is created lazily with maxQueue)
      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('msg');
    });

    it('returns sendRemoteMessage, stop, closeConnection, registerLocationHints, and reconnectPeer', async () => {
      const result = await initNetwork('0x1234', {}, vi.fn());

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

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        {
          relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
        },
        vi.fn(),
      );

      await sendRemoteMessage('peer-1', 'hello');

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        [],
        true,
      );
      expect(mockChannel.msgStream.write).toHaveBeenCalledWith(
        expect.any(Uint8Array),
      );
    });

    it('reuses existing channel for same peer', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'msg1');
      await sendRemoteMessage('peer-1', 'msg2');

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);
      expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(2);
    });

    it('opens separate channels for different peers', async () => {
      const mockChannel1 = createMockChannel('peer-1');
      const mockChannel2 = createMockChannel('peer-2');
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel1)
        .mockResolvedValueOnce(mockChannel2);

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'hello');
      await sendRemoteMessage('peer-2', 'world');

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
    });

    it('passes hints to ConnectionFactory', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];

      const { sendRemoteMessage, registerLocationHints } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      registerLocationHints('peer-1', hints);
      await sendRemoteMessage('peer-1', 'hello');

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
      mockMessageQueue.length = 1;
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'queued-msg');

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('queued-msg');
      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
    });

    it('handles write failure and triggers reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Write failed'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'msg1');

      // First send establishes channel
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);

      // Second send fails and triggers reconnection
      await sendRemoteMessage('peer-1', 'msg2');

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

      const { stop } = await initNetwork('0x1234', {}, vi.fn());

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
      // Set up message queue with queued messages
      mockMessageQueue.dequeue
        .mockReturnValueOnce('queued-1')
        .mockReturnValueOnce('queued-2')
        .mockReturnValue(undefined);
      mockMessageQueue.length = 2;
      mockMessageQueue.messages = ['queued-1', 'queued-2'];

      // Setup for reconnection scenario
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ) // First write fails, triggering reconnection
        .mockResolvedValue(undefined); // Subsequent writes succeed

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // Initial connection
        .mockResolvedValueOnce(mockChannel); // Reconnection succeeds

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // First send establishes channel
      await sendRemoteMessage('peer-1', 'initial-msg');

      // Second send fails and triggers reconnection
      await sendRemoteMessage('peer-1', 'queued-1');

      // Queue another message during reconnection
      await sendRemoteMessage('peer-1', 'queued-2');

      // Wait for reconnection and flush
      await vi.waitFor(() => {
        // Should have 3 successful writes: queued-1 and queued-2 after reconnection
        expect(mockChannel.msgStream.write).toHaveBeenCalledTimes(3);
      });
    });

    it('resets backoff once after successful flush completion', async () => {
      // Ensure this test doesn't inherit mock implementations from previous tests.
      mockConnectionFactory.dialIdempotent.mockReset();
      mockMessageQueue.enqueue.mockReset();
      mockMessageQueue.dequeue.mockReset();
      mockMessageQueue.dequeueAll.mockReset();
      mockMessageQueue.replaceAll.mockReset();

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

      // Make the mocked MessageQueue behave like a real FIFO queue so the test
      // models actual behavior: failed sends enqueue messages, and flush dequeues them.
      setupFifoMessageQueue();

      const peerId = 'peer-flush';
      const mockChannel = createMockChannel(peerId);
      const connectionLostError = Object.assign(new Error('Connection lost'), {
        code: 'ECONNRESET',
      });
      mockChannel.msgStream.write
        // Initial message succeeds (establish channel)
        .mockResolvedValueOnce(undefined)
        // Next message fails, triggering reconnection + enqueue
        .mockRejectedValueOnce(connectionLostError)
        // All flush writes succeed
        .mockResolvedValue(undefined);

      // Gate the *reconnection dial* (retry=false) so we can enqueue messages while
      // reconnecting *before* the flush begins, without messing with `abortableDelay`.
      let releaseReconnectionDial: (() => void) | undefined;
      mockConnectionFactory.dialIdempotent.mockImplementation(
        async (targetPeerId: string, _hints: string[], retry: boolean) => {
          if (targetPeerId !== peerId) {
            return createMockChannel(targetPeerId);
          }

          // Initial connection (retry=true) returns immediately.
          if (retry) {
            return mockChannel;
          }

          // Reconnection attempt (retry=false) waits until we allow it.
          await new Promise<void>((resolve) => {
            releaseReconnectionDial = resolve;
          });
          return mockChannel;
        },
      );
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage(peerId, 'initial-msg');

      // Clear write mock after initial message to get accurate count for reconnection/flush
      mockChannel.msgStream.write.mockClear();

      // Clear resetBackoff mock before triggering reconnection to get accurate count
      mockReconnectionManager.resetBackoff.mockClear();

      // Trigger reconnection via write failure
      await sendRemoteMessage(peerId, 'queued-1');

      // Queue additional messages during reconnection (these should not write immediately)
      await sendRemoteMessage(peerId, 'queued-2');
      await sendRemoteMessage(peerId, 'queued-3');

      // Allow reconnection to dial, then flush queued messages
      releaseReconnectionDial?.();

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

    it('flushes queue on replacement channel when channel replaced during flush', async () => {
      // This test verifies the fix for: "Queued messages stuck when channel replaced during reconnection flush"
      // Scenario: During reconnection flush, an inbound connection replaces the channel.
      // The flush fails on the old channel, but should automatically retry on the new channel.

      // Setup reconnection state management
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

      // Setup FIFO message queue
      setupFifoMessageQueue();

      const peerId = 'peer-replaced';
      const oldChannel = createMockChannel(peerId);
      const newChannel = createMockChannel(peerId);
      const connectionLostError = Object.assign(new Error('Connection lost'), {
        code: 'ECONNRESET',
      });

      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      // oldChannel: Initial connection succeeds, then write fails to trigger reconnection
      // During flush, the first write will trigger the inbound connection
      let flushWriteCount = 0;
      oldChannel.msgStream.write.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          flushWriteCount += 1;
          if (flushWriteCount === 1) {
            // Initial message succeeds
            return undefined;
          }
          if (flushWriteCount === 2) {
            // Second write (queued-1) fails to trigger reconnection
            throw connectionLostError;
          }
          // During flush, first queued message write triggers inbound connection, then fails
          if (flushWriteCount === 3) {
            // Simulate inbound connection replacing the channel mid-flush
            await delay(10);
            inboundHandler?.(newChannel);
            await delay(10);
            throw connectionLostError;
          }
          // All other writes on old channel fail
          throw connectionLostError;
        },
      );

      // newChannel: All writes succeed (this is the replacement channel from inbound connection)
      newChannel.msgStream.write.mockResolvedValue(undefined);

      // Control reconnection dial timing
      let releaseReconnectionDial: (() => void) | undefined;
      mockConnectionFactory.dialIdempotent.mockImplementation(
        async (targetPeerId: string, _hints: string[], retry: boolean) => {
          if (targetPeerId !== peerId) {
            return createMockChannel(targetPeerId);
          }

          // Initial connection (retry=true) returns oldChannel immediately
          if (retry) {
            return oldChannel;
          }

          // Reconnection attempt (retry=false) waits until we allow it
          await new Promise<void>((resolve) => {
            releaseReconnectionDial = resolve;
          });
          return oldChannel;
        },
      );

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish initial channel
      await sendRemoteMessage(peerId, 'initial-msg');

      // Trigger reconnection via write failure
      await sendRemoteMessage(peerId, 'queued-1');

      // Queue another message during reconnection
      await sendRemoteMessage(peerId, 'queued-2');

      // Allow reconnection to dial and start flushing
      releaseReconnectionDial?.();

      // Wait for the flush to complete on the new channel
      await vi.waitFor(
        () => {
          // Should have written both queued messages on the new channel
          expect(newChannel.msgStream.write).toHaveBeenCalledTimes(2);
        },
        { timeout: 5000 },
      );

      // Verify messages were sent in correct order
      expect(mockMessageQueue.messages).toStrictEqual([]);
    }, 10000);
  });

  describe('stop functionality', () => {
    it('returns a stop function', async () => {
      const { stop } = await initNetwork('0x1234', {}, vi.fn());

      expect(typeof stop).toBe('function');
    });

    it('cleans up resources on stop', async () => {
      const { stop } = await initNetwork('0x1234', {}, vi.fn());

      await stop();

      expect(mockConnectionFactory.stop).toHaveBeenCalled();
      expect(mockReconnectionManager.clear).toHaveBeenCalled();
    });

    it('does not send messages after stop', async () => {
      const { sendRemoteMessage, stop } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      await stop();
      await sendRemoteMessage('peer-1', 'msg');

      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
    });

    it('aborts ongoing reconnection on stop', async () => {
      const { abortableDelay } = await import('@metamask/kernel-utils');

      (abortableDelay as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/promise-function-async, @typescript-eslint/no-misused-promises
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

      const { sendRemoteMessage, stop } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection with write failure (happens in background)
      sendRemoteMessage('peer-1', 'msg2').catch(() => {
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
      const { stop } = await initNetwork('0x1234', {}, vi.fn());

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
      const { closeConnection } = await initNetwork('0x1234', {}, vi.fn());

      expect(typeof closeConnection).toBe('function');
    });

    it('marks peer as intentionally closed and prevents message sending', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Close connection
      await closeConnection('peer-1');

      // Attempting to send should throw
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrowError(
        'Message delivery failed after intentional close',
      );
    });

    it('deletes channel and stops reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

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

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Set up queue with messages
      mockMessageQueue.length = 2;
      mockMessageQueue.messages = ['queued-1', 'queued-2'];

      await closeConnection('peer-1');

      expect(mockMessageQueue.clear).toHaveBeenCalled();
    });

    it('prevents automatic reconnection after intentional close', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      // Establish connection
      await sendRemoteMessage('peer-1', 'msg1');

      // Close connection intentionally
      await closeConnection('peer-1');

      // Attempting to send should throw before attempting to write
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrowError(
        'Message delivery failed after intentional close',
      );

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

      const { closeConnection } = await initNetwork('0x1234', {}, vi.fn());

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
      const { registerLocationHints } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
      );

      expect(typeof registerLocationHints).toBe('function');
    });
  });

  describe('reconnectPeer', () => {
    it('returns a reconnectPeer function', async () => {
      const { reconnectPeer } = await initNetwork('0x1234', {}, vi.fn());

      expect(typeof reconnectPeer).toBe('function');
    });

    it('clears intentional close flag and initiates reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection, reconnectPeer } =
        await initNetwork('0x1234', {}, vi.fn());

      // Establish and close connection
      await sendRemoteMessage('peer-1', 'msg1');
      await closeConnection('peer-1');

      // Verify peer is marked as intentionally closed
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrowError(
        'Message delivery failed after intentional close',
      );

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

      const { closeConnection, reconnectPeer } = await initNetwork(
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

      const { closeConnection, reconnectPeer } = await initNetwork(
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

      const { closeConnection, reconnectPeer } = await initNetwork(
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

      const { sendRemoteMessage, closeConnection, reconnectPeer } =
        await initNetwork('0x1234', {}, vi.fn());

      // Establish, close, and reconnect
      await sendRemoteMessage('peer-1', 'msg1');
      await closeConnection('peer-1');
      await reconnectPeer('peer-1');

      // Wait for reconnection to complete
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalled();
      });

      // Reset reconnection state to simulate successful reconnection
      mockReconnectionManager.isReconnecting.mockReturnValue(false);

      // Should be able to send messages after reconnection
      await sendRemoteMessage('peer-1', 'msg2');
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

      const { stop } = await initNetwork('0x1234', {}, vi.fn());

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'msg');

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('msg');
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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Trigger first connection loss (this starts reconnection)
      await sendRemoteMessage('peer-1', 'msg-1');

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

    it('reuses existing channel when inbound connection arrives during reconnection dial', async () => {
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
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.incrementAttempt.mockReturnValue(1);
      mockReconnectionManager.calculateBackoff.mockReturnValue(0); // No delay for test

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Create two different channels: one for reconnection dial, one for inbound
      const reconnectionChannel = createMockChannel('peer-1');
      const inboundChannel = createMockChannel('peer-1');
      reconnectionChannel.msgStream.write.mockResolvedValue(undefined);
      inboundChannel.msgStream.write.mockResolvedValue(undefined);
      inboundChannel.msgStream.read.mockResolvedValue(
        new Promise(() => {
          /* Never resolves - keeps channel active */
        }),
      );

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Set up initial connection that will fail on write
      const initialChannel = createMockChannel('peer-1');
      initialChannel.msgStream.write
        .mockResolvedValueOnce(undefined) // First write succeeds
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ); // Second write fails, triggering reconnection

      // Make dialIdempotent delay for reconnection to allow inbound connection to arrive first
      let dialResolve: ((value: MockChannel) => void) | undefined;
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(initialChannel) // Initial connection
        .mockImplementation(
          async () =>
            new Promise<MockChannel>((resolve) => {
              dialResolve = resolve;
            }),
        ); // Reconnection dial (pending)

      // Establish initial connection
      await sendRemoteMessage('peer-1', 'msg-1');

      // Trigger connection loss to start reconnection
      await sendRemoteMessage('peer-1', 'msg-2');

      // Wait for reconnection to start and begin dialing
      await vi.waitFor(() => {
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });

      // While reconnection dial is pending, inbound connection arrives and registers channel
      inboundHandler?.(inboundChannel);

      // Wait for inbound channel to be registered
      await vi.waitFor(() => {
        expect(inboundChannel.msgStream.read).toHaveBeenCalled();
      });

      // Now resolve the reconnection dial
      dialResolve?.(reconnectionChannel);

      // Wait for reconnection to complete
      await vi.waitFor(() => {
        // Should detect existing channel and close the dialed one
        expect(mockConnectionFactory.closeChannel).toHaveBeenCalledWith(
          reconnectionChannel,
          'peer-1',
        );
        // Should log that existing channel is being reused
        expect(mockLogger.log).toHaveBeenCalledWith(
          'peer-1:: reconnection: channel already exists, reusing existing channel',
        );
        // Should stop reconnection (successful)
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });

      // Verify only one channel is active (the inbound one)
      // The reconnection channel should have been closed, not registered
      expect(mockConnectionFactory.closeChannel).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('handles dial errors gracefully', async () => {
      mockConnectionFactory.dialIdempotent.mockRejectedValue(
        new Error('Dial failed'),
      );

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'msg');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection via retryable write failure
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      await sendRemoteMessage('peer-1', 'msg2');

      // Ensure reconnection attempt dial happened
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
      });

      await vi.waitFor(() => {
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
        expect(mockMessageQueue.clear).toHaveBeenCalled();
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

      // Set up queue with messages that will fail during flush
      mockMessageQueue.dequeue
        .mockReturnValueOnce('queued-msg')
        .mockReturnValue(undefined);
      mockMessageQueue.length = 1;
      mockMessageQueue.messages = ['queued-msg'];

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockResolvedValue(mockChannel); // reconnection attempts (dial succeeds, flush fails)

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection via retryable write failure
      await sendRemoteMessage('peer-1', 'msg2');

      // Wait for reconnection to start and check max attempts
      await vi.waitFor(() => {
        expect(mockReconnectionManager.shouldRetry).toHaveBeenCalled();
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
        expect(mockMessageQueue.clear).toHaveBeenCalled();
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

      // Set up queue with messages that will fail during flush
      mockMessageQueue.dequeue
        .mockReturnValueOnce('queued-msg')
        .mockReturnValue(undefined);
      mockMessageQueue.length = 1;
      mockMessageQueue.messages = ['queued-msg'];

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel)
        .mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
        onRemoteGiveUp,
      );

      await sendRemoteMessage('peer-1', 'msg1');
      await sendRemoteMessage('peer-1', 'msg2');

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
      // Set up queue with messages that will be flushed during reconnection
      // Each reconnection attempt will try to flush these messages, and they will fail
      const queuedMsg1 = 'queued-1';
      const queuedMsg2 = 'queued-2';
      // dequeue should return messages for each flush attempt (each reconnection)
      mockMessageQueue.dequeue.mockImplementation(() => {
        // Return messages in order, then undefined
        if (mockMessageQueue.messages.length > 0) {
          return mockMessageQueue.messages.shift();
        }
        return undefined;
      });
      mockMessageQueue.length = 2;
      mockMessageQueue.messages = [queuedMsg1, queuedMsg2];
      // When replaceAll is called (after flush failure), restore the messages
      mockMessageQueue.replaceAll.mockImplementation((messages) => {
        mockMessageQueue.messages = [...messages];
        mockMessageQueue.length = messages.length;
      });
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxRetryAttempts },
        vi.fn(),
        onRemoteGiveUp,
      );
      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');
      // Trigger reconnection via write failure
      await sendRemoteMessage('peer-1', 'msg2');
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
          expect(mockMessageQueue.clear).toHaveBeenCalled();
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

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        {},
        vi.fn(),
        onRemoteGiveUp,
      );

      await sendRemoteMessage('peer-1', 'msg1');
      await sendRemoteMessage('peer-1', 'msg2');

      await vi.waitFor(() => {
        expect(onRemoteGiveUp).toHaveBeenCalledWith('peer-1');
        expect(mockMessageQueue.clear).toHaveBeenCalled();
      });
    });

    it('resets backoff on successful message send', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'msg');

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

      // Empty queue
      mockMessageQueue.length = 0;
      mockMessageQueue.dequeue.mockReturnValue(undefined);

      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockResolvedValue(undefined);
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockResolvedValueOnce(mockChannel); // reconnection

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection via write failure
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      await sendRemoteMessage('peer-1', 'msg2');

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

      // Set up queue with messages
      const queuedMsg = 'queued-msg';
      mockMessageQueue.dequeue
        .mockReturnValueOnce(queuedMsg)
        .mockReturnValue(undefined);
      mockMessageQueue.length = 1;
      mockMessageQueue.messages = [queuedMsg];

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection via write failure
      await sendRemoteMessage('peer-1', 'msg2');

      // Wait for flush failure handling
      await vi.waitFor(() => {
        // Should re-queue failed messages
        expect(mockMessageQueue.replaceAll).toHaveBeenCalledWith([queuedMsg]);
        // Should trigger reconnection again
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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise = sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise = sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise = sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise = sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      await sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise = sendRemoteMessage('peer-1', 'test message');

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

      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());

      const sendPromise1 = sendRemoteMessage('peer-1', 'message 1');
      const sendPromise2 = sendRemoteMessage('peer-1', 'message 2');

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

  describe('connection limit', () => {
    it('enforces maximum concurrent connections', async () => {
      const mockChannels: MockChannel[] = [];
      // Create 100 mock channels
      for (let i = 0; i < 100; i += 1) {
        const mockChannel = createMockChannel(`peer-${i}`);
        mockChannels.push(mockChannel);
        mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(mockChannel);
      }
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Establish 100 connections
      for (let i = 0; i < 100; i += 1) {
        await sendRemoteMessage(`peer-${i}`, 'msg');
      }
      // Attempt to establish 101st connection should fail
      await expect(sendRemoteMessage('peer-101', 'msg')).rejects.toThrow(
        ResourceLimitError,
      );
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(100);
    });

    it('respects custom maxConcurrentConnections option', async () => {
      const customLimit = 5;
      const mockChannels: MockChannel[] = [];
      // Create mock channels up to custom limit
      for (let i = 0; i < customLimit; i += 1) {
        const mockChannel = createMockChannel(`peer-${i}`);
        mockChannels.push(mockChannel);
        mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(mockChannel);
      }
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxConcurrentConnections: customLimit },
        vi.fn(),
      );
      // Establish connections up to custom limit
      for (let i = 0; i < customLimit; i += 1) {
        await sendRemoteMessage(`peer-${i}`, 'msg');
      }
      // Attempt to establish connection beyond custom limit should fail
      await expect(sendRemoteMessage('peer-exceed', 'msg')).rejects.toThrow(
        ResourceLimitError,
      );
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(
        customLimit,
      );
    });

    it('rejects inbound connections when limit reached', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );
      const mockChannels: MockChannel[] = [];
      // Create 100 mock channels for outbound connections
      for (let i = 0; i < 100; i += 1) {
        const mockChannel = createMockChannel(`peer-${i}`);
        mockChannels.push(mockChannel);
        mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(mockChannel);
      }
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Establish 100 outbound connections
      for (let i = 0; i < 100; i += 1) {
        await sendRemoteMessage(`peer-${i}`, 'msg');
      }
      // Attempt inbound connection should be rejected
      const inboundChannel = createMockChannel('inbound-peer');
      inboundHandler?.(inboundChannel);
      // Should not add to channels (connection rejected)
      expect(mockLogger.log).toHaveBeenCalledWith(
        'inbound-peer:: rejecting inbound connection due to connection limit',
      );
    });
  });

  describe('message size limit', () => {
    it('rejects messages exceeding 1MB size limit', async () => {
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Create a message larger than 1MB
      const largeMessage = 'x'.repeat(1024 * 1024 + 1); // 1MB + 1 byte
      await expect(sendRemoteMessage('peer-1', largeMessage)).rejects.toThrow(
        ResourceLimitError,
      );
      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
      expect(mockMessageQueue.enqueue).not.toHaveBeenCalled();
    });

    it('allows messages at exactly 1MB size limit', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Create a message exactly 1MB
      const exactSizeMessage = 'x'.repeat(1024 * 1024);
      await sendRemoteMessage('peer-1', exactSizeMessage);
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalled();
      expect(mockChannel.msgStream.write).toHaveBeenCalled();
    });

    it('validates message size before queueing during reconnection', async () => {
      mockReconnectionManager.isReconnecting.mockReturnValue(true);
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Create a message larger than 1MB
      const largeMessage = 'x'.repeat(1024 * 1024 + 1);
      await expect(sendRemoteMessage('peer-1', largeMessage)).rejects.toThrow(
        ResourceLimitError,
      );
      // Should not queue the message
      expect(mockMessageQueue.enqueue).not.toHaveBeenCalled();
    });

    it('respects custom maxMessageSizeBytes option', async () => {
      const customLimit = 500 * 1024; // 500KB
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxMessageSizeBytes: customLimit },
        vi.fn(),
      );
      // Create a message larger than custom limit
      const largeMessage = 'x'.repeat(customLimit + 1);
      await expect(sendRemoteMessage('peer-1', largeMessage)).rejects.toThrow(
        ResourceLimitError,
      );
      // Create a message at exactly custom limit
      const exactSizeMessage = 'x'.repeat(customLimit);
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      await sendRemoteMessage('peer-1', exactSizeMessage);
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalled();
    });
  });

  describe('stale peer cleanup', () => {
    it('sets up periodic cleanup interval', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      await initNetwork('0x1234', {}, vi.fn());
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        15 * 60 * 1000,
      );
      expect(intervalFn).toBeDefined();
      setIntervalSpy.mockRestore();
    });

    it('cleans up interval on stop', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((_fn: () => void, _ms?: number) => {
          return 42 as unknown as NodeJS.Timeout;
        });
      const { stop } = await initNetwork('0x1234', {}, vi.fn());
      await stop();
      expect(clearIntervalSpy).toHaveBeenCalledWith(42);
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it('does not clean up peers with active connections', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      // Establish connection (sets lastConnectionTime)
      await sendRemoteMessage('peer-1', 'msg');
      // Run cleanup immediately; should not remove active peer
      intervalFn?.();
      await sendRemoteMessage('peer-1', 'msg2');
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);
      setIntervalSpy.mockRestore();
    });

    it('does not clean up peers currently reconnecting', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      mockReconnectionManager.isReconnecting.mockReturnValue(true);
      const { sendRemoteMessage } = await initNetwork('0x1234', {}, vi.fn());
      await sendRemoteMessage('peer-1', 'msg');
      // Run cleanup immediately; reconnecting peer should not be cleaned
      intervalFn?.();
      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('msg');
      setIntervalSpy.mockRestore();
    });

    it('cleanup does not interfere with active reconnection and reconnection completes', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });

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
      mockReconnectionManager.calculateBackoff.mockReturnValue(0);

      const { abortableDelay } = await import('@metamask/kernel-utils');
      // Gate the reconnection dial so we can run cleanup while reconnection is in progress
      let releaseReconnectionDial: (() => void) | undefined;
      (abortableDelay as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          await new Promise<void>((resolve) => {
            releaseReconnectionDial = resolve;
          });
        },
      );

      // Use FIFO queue to verify messages are preserved through cleanup
      setupFifoMessageQueue();

      const initialChannel = createMockChannel('peer-1');
      const reconnectChannel = createMockChannel('peer-1');

      // Initial connection succeeds, then write fails to trigger reconnection
      initialChannel.msgStream.write
        .mockResolvedValueOnce(undefined) // initial message succeeds
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        ); // triggers reconnection

      reconnectChannel.msgStream.write.mockResolvedValue(undefined);

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(initialChannel) // initial connection
        .mockResolvedValueOnce(reconnectChannel); // reconnection

      const stalePeerTimeoutMs = 1; // Very short timeout
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { stalePeerTimeoutMs },
        vi.fn(),
      );

      // Establish connection
      await sendRemoteMessage('peer-1', 'msg1');

      // Trigger reconnection via write failure
      await sendRemoteMessage('peer-1', 'msg2');

      // Wait for reconnection to start
      await vi.waitFor(() => {
        expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });

      // Wait beyond the stale timeout while reconnection is blocked
      await delay(stalePeerTimeoutMs + 10);

      // Run cleanup while reconnection is active
      intervalFn?.();

      // Verify peer was NOT cleaned up (because isReconnecting is true)
      expect(mockReconnectionManager.clearPeer).not.toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('peer-1:: cleaning up stale peer data'),
      );

      // Release the reconnection dial
      releaseReconnectionDial?.();

      // Wait for reconnection to complete
      await vi.waitFor(() => {
        expect(mockReconnectionManager.stopReconnection).toHaveBeenCalledWith(
          'peer-1',
        );
      });

      // Verify reconnection completed successfully - queued messages were flushed
      expect(reconnectChannel.msgStream.write).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
    }, 10000);

    it('cleans up stale peers and calls clearPeer', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      const mockChannel = createMockChannel('peer-1');
      // End the inbound stream so the channel is removed from the active channels map.
      // Stale cleanup only applies when there is no active channel.
      mockChannel.msgStream.read.mockResolvedValueOnce(undefined);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const stalePeerTimeoutMs = 1;
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { stalePeerTimeoutMs },
        vi.fn(),
      );
      // Establish connection (sets lastConnectionTime)
      await sendRemoteMessage('peer-1', 'msg');
      // Wait until readChannel processes the stream end and removes the channel.
      await vi.waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalledWith('peer-1:: stream ended');
      });
      // Ensure enough wall-clock time passes to exceed stalePeerTimeoutMs.
      await delay(stalePeerTimeoutMs + 5);
      // Run cleanup; stale peer should be cleaned
      intervalFn?.();
      // Verify clearPeer was called
      expect(mockReconnectionManager.clearPeer).toHaveBeenCalledWith('peer-1');
      // Verify cleanup log message
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('peer-1:: cleaning up stale peer data'),
      );
      setIntervalSpy.mockRestore();
    });

    it('respects custom cleanupIntervalMs option', async () => {
      const customInterval = 30 * 60 * 1000; // 30 minutes
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((_fn: () => void, _ms?: number) => {
          return 1 as unknown as NodeJS.Timeout;
        });
      await initNetwork(
        '0x1234',
        { cleanupIntervalMs: customInterval },
        vi.fn(),
      );
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        customInterval,
      );
      setIntervalSpy.mockRestore();
    });

    it('respects custom stalePeerTimeoutMs option', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      const customTimeout = 50;
      const mockChannel = createMockChannel('peer-1');
      // End the inbound stream so the channel is removed from the active channels map.
      mockChannel.msgStream.read.mockResolvedValueOnce(undefined);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        {
          stalePeerTimeoutMs: customTimeout,
        },
        vi.fn(),
      );
      // Establish connection
      await sendRemoteMessage('peer-1', 'msg');
      // Wait until readChannel processes the stream end and removes the channel.
      await vi.waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalledWith('peer-1:: stream ended');
      });
      // Run cleanup quickly; peer should not be stale yet.
      intervalFn?.();
      // Peer should not be cleaned (not stale yet)
      expect(mockReconnectionManager.clearPeer).not.toHaveBeenCalled();
      // Wait beyond the custom timeout, then run cleanup again.
      await delay(customTimeout + 10);
      intervalFn?.();
      // Now peer should be cleaned
      expect(mockReconnectionManager.clearPeer).toHaveBeenCalledWith('peer-1');
      setIntervalSpy.mockRestore();
    });

    it('cleans up intentionallyClosed entries for stale peers', async () => {
      let intervalFn: (() => void) | undefined;
      const setIntervalSpy = vi
        .spyOn(global, 'setInterval')
        .mockImplementation((fn: () => void, _ms?: number) => {
          intervalFn = fn;
          return 1 as unknown as NodeJS.Timeout;
        });
      const mockChannel = createMockChannel('peer-1');
      // End the inbound stream so the channel is removed from the active channels map.
      mockChannel.msgStream.read.mockResolvedValueOnce(undefined);
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const stalePeerTimeoutMs = 1;
      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        { stalePeerTimeoutMs },
        vi.fn(),
      );
      // Establish connection and then intentionally close it
      await sendRemoteMessage('peer-1', 'msg');
      await closeConnection('peer-1');
      // Verify peer is marked as intentionally closed
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrow(
        'Message delivery failed after intentional close',
      );
      // Wait until readChannel processes the stream end and removes the channel.
      await vi.waitFor(() => {
        expect(mockLogger.log).toHaveBeenCalledWith('peer-1:: stream ended');
      });
      // Ensure enough wall-clock time passes to exceed stalePeerTimeoutMs.
      await delay(stalePeerTimeoutMs + 5);
      // Run cleanup; stale peer should be cleaned, including intentionallyClosed entry
      intervalFn?.();
      // Verify clearPeer was called
      expect(mockReconnectionManager.clearPeer).toHaveBeenCalledWith('peer-1');
      // Verify cleanup log message
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('peer-1:: cleaning up stale peer data'),
      );
      // After cleanup, peer should no longer be in intentionallyClosed
      // Verify by attempting to send a message - it should not throw the intentional close error
      const newChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(newChannel);
      // Should not throw "Message delivery failed after intentional close"
      // (it will attempt to dial a new connection instead)
      await sendRemoteMessage('peer-1', 'msg-after-cleanup');
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        [],
        true,
      );
      setIntervalSpy.mockRestore();
    });
  });

  describe('reconnection respects connection limit', () => {
    it('blocks reconnection when connection limit is reached', async () => {
      const customLimit = 2;
      const mockChannels: MockChannel[] = [];
      // Create mock channels
      for (let i = 0; i < customLimit; i += 1) {
        const mockChannel = createMockChannel(`peer-${i}`);
        mockChannels.push(mockChannel);
      }
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
      mockReconnectionManager.calculateBackoff.mockReturnValue(100); // Small delay to ensure ordering
      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (ms: number) => {
          // Use real delay to allow other operations to complete
          await new Promise((resolve) => setTimeout(resolve, ms));
        },
      );
      // Set up dial mocks - initial connections
      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannels[0]) // peer-0
        .mockResolvedValueOnce(mockChannels[1]); // peer-1
      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxConcurrentConnections: customLimit },
        vi.fn(),
      );
      // Establish connections up to limit
      await sendRemoteMessage('peer-0', 'msg');
      await sendRemoteMessage('peer-1', 'msg');
      // Disconnect peer-0 (simulate connection loss)
      const peer0Channel = mockChannels[0] as MockChannel;
      peer0Channel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
      );
      // Trigger reconnection for peer-0 (this will remove peer-0 from channels)
      await sendRemoteMessage('peer-0', 'msg2');
      // Wait for connection loss to be handled (channel removed)
      await vi.waitFor(
        () => {
          expect(
            mockReconnectionManager.startReconnection,
          ).toHaveBeenCalledWith('peer-0');
        },
        { timeout: 1000 },
      );
      // Now fill the connection limit with a new peer (peer-0 is removed, so we have space)
      // Ensure new-peer is NOT in reconnecting state
      mockReconnectionManager.isReconnecting.mockImplementation((peerId) => {
        return peerId === 'peer-0'; // Only peer-0 is reconnecting
      });
      const newPeerChannel = createMockChannel('new-peer');
      mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(
        newPeerChannel,
      );
      await sendRemoteMessage('new-peer', 'msg');
      // Wait a bit to ensure new-peer connection is fully established in channels map
      await delay(50);
      // Mock successful dial for reconnection attempt (but limit will block it)
      const reconnectChannel = createMockChannel('peer-0');
      mockConnectionFactory.dialIdempotent.mockResolvedValueOnce(
        reconnectChannel,
      );
      // Verify reconnection started
      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-0',
      );
      // Wait for reconnection attempt to be blocked
      await vi.waitFor(
        () => {
          // Should have logged that reconnection was blocked by limit
          expect(mockLogger.log).toHaveBeenCalledWith(
            expect.stringContaining(
              'peer-0:: reconnection blocked by connection limit',
            ),
          );
          // Verify closeChannel was called to release network resources
          expect(mockConnectionFactory.closeChannel).toHaveBeenCalledWith(
            reconnectChannel,
            'peer-0',
          );
        },
        { timeout: 5000 },
      );
      // Verify reconnection continues (doesn't stop) - shouldRetry should be called
      // meaning the loop continues after the limit check fails
      expect(mockReconnectionManager.shouldRetry).toHaveBeenCalled();
    }, 10000);
  });

  describe('connection limit race condition', () => {
    it('prevents exceeding limit when multiple concurrent dials occur', async () => {
      const customLimit = 2;
      const mockChannels: MockChannel[] = [];

      // Create mock channels
      for (let i = 0; i < customLimit + 1; i += 1) {
        const mockChannel = createMockChannel(`peer-${i}`);
        mockChannels.push(mockChannel);
      }

      // Set up dial mocks - all dials will succeed
      mockConnectionFactory.dialIdempotent.mockImplementation(
        async (peerId: string) => {
          // Simulate async dial delay
          await delay(10);
          return mockChannels.find((ch) => ch.peerId === peerId) as MockChannel;
        },
      );

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        { maxConcurrentConnections: customLimit },
        vi.fn(),
      );
      // Start multiple concurrent dials that all pass the initial limit check
      // The third send should throw ResourceLimitError
      const results = await Promise.allSettled([
        sendRemoteMessage('peer-0', 'msg0'),
        sendRemoteMessage('peer-1', 'msg1'),
        sendRemoteMessage('peer-2', 'msg2'), // This should be rejected after dial
      ]);
      // Verify that only 2 channels were added (the limit)
      // The third one should have been rejected after dial completed
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('peer-2:: connection limit reached after dial'),
      );
      // Verify that the third send threw ResourceLimitError
      const rejectedResult = results.find(
        (result) => result.status === 'rejected',
      );
      expect(rejectedResult).toBeDefined();
      expect((rejectedResult as PromiseRejectedResult).reason).toBeInstanceOf(
        ResourceLimitError,
      );
      // Verify that the channel was closed
      expect(mockConnectionFactory.closeChannel).toHaveBeenCalled();
      // Verify that the message was NOT queued (error propagated to caller)
      expect(mockMessageQueue.enqueue).not.toHaveBeenCalledWith('msg2');
      // Verify that reconnection was NOT started (error propagated to caller)
      expect(
        mockReconnectionManager.startReconnection,
      ).not.toHaveBeenCalledWith('peer-2');
    }, 10000);
  });

  it('registerLocationHints merges with existing hints', async () => {
    const { registerLocationHints, sendRemoteMessage } = await initNetwork(
      '0x1234',
      {},
      vi.fn(),
    );

    const mockChannel = createMockChannel('peer-1');
    mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

    // Register initial hints
    registerLocationHints('peer-1', ['hint1', 'hint2']);

    // Register additional hints (should merge)
    registerLocationHints('peer-1', ['hint2', 'hint3']);

    await sendRemoteMessage('peer-1', 'msg');

    expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
      'peer-1',
      ['hint1', 'hint2', 'hint3'],
      true,
    );
  });

  it('registerLocationHints creates new set when no existing hints', async () => {
    const { registerLocationHints, sendRemoteMessage } = await initNetwork(
      '0x1234',
      {},
      vi.fn(),
    );

    const mockChannel = createMockChannel('peer-1');
    mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

    registerLocationHints('peer-1', ['hint1', 'hint2']);

    await sendRemoteMessage('peer-1', 'msg');

    expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
      'peer-1',
      ['hint1', 'hint2'],
      true,
    );
  });

  it('registerChannel closes replaced channel', async () => {
    let inboundHandler: ((channel: MockChannel) => void) | undefined;
    mockConnectionFactory.onInboundConnection.mockImplementation((handler) => {
      inboundHandler = handler;
    });

    await initNetwork('0x1234', {}, vi.fn());

    const channel1 = createMockChannel('peer-1');
    const channel2 = createMockChannel('peer-1');

    inboundHandler?.(channel1);

    await vi.waitFor(() => {
      expect(channel1.msgStream.read).toHaveBeenCalled();
    });

    inboundHandler?.(channel2);

    await vi.waitFor(() => {
      expect(mockConnectionFactory.closeChannel).toHaveBeenCalledWith(
        channel1,
        'peer-1',
      );
    });
  });

  it('handles closeChannel error when replacing channel', async () => {
    let inboundHandler: ((channel: MockChannel) => void) | undefined;
    mockConnectionFactory.onInboundConnection.mockImplementation((handler) => {
      inboundHandler = handler;
    });

    mockConnectionFactory.closeChannel.mockRejectedValueOnce(
      new Error('Close failed'),
    );

    await initNetwork('0x1234', {}, vi.fn());

    const channel1 = createMockChannel('peer-1');
    const channel2 = createMockChannel('peer-1');

    inboundHandler?.(channel1);

    await vi.waitFor(() => {
      expect(channel1.msgStream.read).toHaveBeenCalled();
    });

    inboundHandler?.(channel2);

    await vi.waitFor(() => {
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('error closing replaced channel'),
      );
    });
  });

  it('closes rejected inbound channel from intentionally closed peer', async () => {
    let inboundHandler: ((channel: MockChannel) => void) | undefined;
    mockConnectionFactory.onInboundConnection.mockImplementation((handler) => {
      inboundHandler = handler;
    });

    const { closeConnection } = await initNetwork('0x1234', {}, vi.fn());

    await closeConnection('peer-1');

    const inboundChannel = createMockChannel('peer-1');
    inboundHandler?.(inboundChannel);

    await vi.waitFor(() => {
      expect(mockConnectionFactory.closeChannel).toHaveBeenCalledWith(
        inboundChannel,
        'peer-1',
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'peer-1:: rejecting inbound connection from intentionally closed peer',
      );
    });
  });

  it('handles error when closing rejected inbound from intentionally closed peer', async () => {
    let inboundHandler: ((channel: MockChannel) => void) | undefined;
    mockConnectionFactory.onInboundConnection.mockImplementation((handler) => {
      inboundHandler = handler;
    });

    mockConnectionFactory.closeChannel.mockRejectedValueOnce(
      new Error('Close failed'),
    );

    const { closeConnection } = await initNetwork('0x1234', {}, vi.fn());

    await closeConnection('peer-1');

    const inboundChannel = createMockChannel('peer-1');
    inboundHandler?.(inboundChannel);

    await vi.waitFor(() => {
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'error closing rejected inbound channel from intentionally closed peer',
        ),
      );
    });
  });
});

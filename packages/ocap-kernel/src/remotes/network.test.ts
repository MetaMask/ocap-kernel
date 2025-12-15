import { AbortError } from '@metamask/kernel-errors';
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';

import type { QueuedMessage } from './MessageQueue.ts';

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
  messages: [] as QueuedMessage[],
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
  }
  return {
    ReconnectionManager: MockReconnectionManager,
  };
});

// Mock ConnectionFactory
type MockChannel = {
  peerId: string;
  hints: string[];
  msgStream: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
};

const mockConnectionFactory = {
  dialIdempotent: vi.fn(),
  onInboundConnection: vi.fn(),
  stop: vi.fn().mockResolvedValue(undefined),
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

    mockConnectionFactory.dialIdempotent.mockClear();
    mockConnectionFactory.onInboundConnection.mockClear();
    mockConnectionFactory.stop.mockClear();

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
    // Clear mocks after each test
    vi.clearAllMocks();
  });

  const createMockChannel = (
    peerId: string,
    hints: string[] = [],
  ): MockChannel => ({
    peerId,
    hints,
    msgStream: {
      read: vi.fn().mockImplementation(
        async () =>
          new Promise(() => {
            /* Never resolves by default */
          }),
      ),
      write: vi.fn().mockResolvedValue(undefined),
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

      await initNetwork(keySeed, knownRelays, vi.fn());

      expect(ConnectionFactory.make).toHaveBeenCalledWith(
        keySeed,
        knownRelays,
        expect.any(Object), // Logger instance
        expect.any(AbortSignal), // signal from AbortController
      );
    });

    it('returns sendRemoteMessage, stop, closeConnection, and reconnectPeer', async () => {
      const result = await initNetwork('0x1234', [], vi.fn());

      expect(result).toHaveProperty('sendRemoteMessage');
      expect(result).toHaveProperty('stop');
      expect(result).toHaveProperty('closeConnection');
      expect(result).toHaveProperty('reconnectPeer');
      expect(typeof result.sendRemoteMessage).toBe('function');
      expect(typeof result.stop).toBe('function');
      expect(typeof result.closeConnection).toBe('function');
      expect(typeof result.reconnectPeer).toBe('function');
    });
  });

  describe('basic messaging', () => {
    it('opens channel and sends message to new peer', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork(
        '0x1234',
        ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'hello');
      await sendRemoteMessage('peer-2', 'world');

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
    });

    it('passes hints to ConnectionFactory', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);
      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'hello', hints);

      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledWith(
        'peer-1',
        hints,
        true,
      );
    });
  });

  describe('inbound connections', () => {
    it('registers inbound connection handler', async () => {
      await initNetwork('0x1234', [], vi.fn());

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

      await initNetwork('0x1234', [], remoteHandler);

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('test-message');
      mockChannel.msgStream.read
        .mockResolvedValueOnce(messageBuffer)
        .mockImplementation(
          async () =>
            new Promise(() => {
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

      await initNetwork('0x1234', [], remoteHandler);

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('test-message');
      mockChannel.msgStream.read
        .mockResolvedValueOnce(messageBuffer)
        .mockImplementation(
          async () =>
            new Promise(() => {
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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'queued-msg');

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('queued-msg', []);
      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
    });

    it('handles write failure and triggers reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockChannel.msgStream.write.mockRejectedValueOnce(
        Object.assign(new Error('Write failed'), { code: 'ECONNRESET' }),
      );
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'msg1');

      // First send establishes channel
      expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(1);

      // Second send fails and triggers reconnection
      await sendRemoteMessage('peer-1', 'msg2');

      expect(mockReconnectionManager.startReconnection).toHaveBeenCalledWith(
        'peer-1',
      );
    });

    it('starts reconnection on read error', async () => {
      let inboundHandler: ((channel: MockChannel) => void) | undefined;
      mockConnectionFactory.onInboundConnection.mockImplementation(
        (handler) => {
          inboundHandler = handler;
        },
      );

      await initNetwork('0x1234', [], vi.fn());

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

      await initNetwork('0x1234', [], vi.fn());

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

      const { stop } = await initNetwork('0x1234', [], vi.fn());

      const mockChannel = createMockChannel('peer-1');
      // Make read resolve after stop so loop continues and checks signal.aborted
      let shouldResolve = false;
      mockChannel.msgStream.read.mockImplementation(async () => {
        // Wait until stop is called
        // eslint-disable-next-line no-unmodified-loop-condition
        while (!shouldResolve) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        // Return a value so loop continues to next iteration where it checks signal.aborted
        return new TextEncoder().encode('dummy');
      });

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
      await initNetwork('0x1234', [], remoteHandler);

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
        .mockReturnValueOnce({ message: 'queued-1', hints: [] })
        .mockReturnValueOnce({ message: 'queued-2', hints: [] })
        .mockReturnValue(undefined);
      mockMessageQueue.length = 2;
      mockMessageQueue.messages = [
        { message: 'queued-1', hints: [] },
        { message: 'queued-2', hints: [] },
      ];

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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
  });

  describe('stop functionality', () => {
    it('returns a stop function', async () => {
      const { stop } = await initNetwork('0x1234', [], vi.fn());

      expect(typeof stop).toBe('function');
    });

    it('cleans up resources on stop', async () => {
      const { stop } = await initNetwork('0x1234', [], vi.fn());

      await stop();

      expect(mockConnectionFactory.stop).toHaveBeenCalled();
      expect(mockReconnectionManager.clear).toHaveBeenCalled();
    });

    it('does not send messages after stop', async () => {
      const { sendRemoteMessage, stop } = await initNetwork(
        '0x1234',
        [],
        vi.fn(),
      );

      await stop();
      await sendRemoteMessage('peer-1', 'msg');

      expect(mockConnectionFactory.dialIdempotent).not.toHaveBeenCalled();
    });

    it('aborts ongoing reconnection on stop', async () => {
      const { abortableDelay } = await import('@metamask/kernel-utils');

      (abortableDelay as ReturnType<typeof vi.fn>).mockImplementation(
        async (_ms: number, signal?: AbortSignal) => {
          if (signal?.aborted) {
            throw new AbortError();
          }
          return new Promise((_resolve, reject) => {
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
        [],
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
      const { stop } = await initNetwork('0x1234', [], vi.fn());

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
      const { closeConnection } = await initNetwork('0x1234', [], vi.fn());

      expect(typeof closeConnection).toBe('function');
    });

    it('marks peer as intentionally closed and prevents message sending', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        [],
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Close connection
      await closeConnection('peer-1');

      // Attempting to send should throw
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrow(
        'Message delivery failed after intentional close',
      );
    });

    it('deletes channel and stops reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        [],
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
        [],
        vi.fn(),
      );

      // Establish channel
      await sendRemoteMessage('peer-1', 'msg1');

      // Set up queue with messages
      mockMessageQueue.length = 2;
      mockMessageQueue.messages = [
        { message: 'queued-1', hints: [] },
        { message: 'queued-2', hints: [] },
      ];

      await closeConnection('peer-1');

      expect(mockMessageQueue.clear).toHaveBeenCalled();
    });

    it('prevents automatic reconnection after intentional close', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection } = await initNetwork(
        '0x1234',
        [],
        vi.fn(),
      );

      // Establish connection
      await sendRemoteMessage('peer-1', 'msg1');

      // Close connection intentionally
      await closeConnection('peer-1');

      // Attempting to send should throw before attempting to write
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrow(
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

      const { closeConnection } = await initNetwork('0x1234', [], vi.fn());

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

  describe('reconnectPeer', () => {
    it('returns a reconnectPeer function', async () => {
      const { reconnectPeer } = await initNetwork('0x1234', [], vi.fn());

      expect(typeof reconnectPeer).toBe('function');
    });

    it('clears intentional close flag and initiates reconnection', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage, closeConnection, reconnectPeer } =
        await initNetwork('0x1234', [], vi.fn());

      // Establish and close connection
      await sendRemoteMessage('peer-1', 'msg1');
      await closeConnection('peer-1');

      // Verify peer is marked as intentionally closed
      await expect(sendRemoteMessage('peer-1', 'msg2')).rejects.toThrow(
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
        [],
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
        [],
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
        [],
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
        await initNetwork('0x1234', [], vi.fn());

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

      await initNetwork('0x1234', [], vi.fn());

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

      const { stop } = await initNetwork('0x1234', [], vi.fn());

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'msg');

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('msg', []);
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
      // Keep shouldRetry returning true so loop stays active until flush completes
      // This ensures isReconnecting stays true when second handleConnectionLoss is called
      mockReconnectionManager.shouldRetry.mockReturnValue(true);

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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
  });

  describe('error handling', () => {
    it('handles dial errors gracefully', async () => {
      mockConnectionFactory.dialIdempotent.mockRejectedValue(
        new Error('Dial failed'),
      );

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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
      // First call should return true (to enter loop), then false (max attempts)
      mockReconnectionManager.shouldRetry
        .mockReturnValueOnce(true) // Enter loop
        .mockReturnValue(false); // Max attempts reached
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
        .mockResolvedValue(mockChannel); // reconnection attempts (won't succeed)

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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

    it('resets backoff on successful message send', async () => {
      const mockChannel = createMockChannel('peer-1');
      mockConnectionFactory.dialIdempotent.mockResolvedValue(mockChannel);

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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

      await initNetwork('0x1234', [], vi.fn());

      const mockChannel = createMockChannel('inbound-peer');
      const messageBuffer = new TextEncoder().encode('inbound-msg');
      mockChannel.msgStream.read
        .mockResolvedValueOnce(messageBuffer)
        .mockImplementation(
          async () =>
            new Promise(() => {
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
    it('preserves hints when queueing messages', async () => {
      mockReconnectionManager.isReconnecting.mockReturnValue(true);

      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];
      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      await sendRemoteMessage('peer-1', 'msg', hints);

      expect(mockMessageQueue.enqueue).toHaveBeenCalledWith('msg', hints);
    });

    it('merges hints from queued messages during flush', async () => {
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

      const mockChannel = createMockChannel('peer-1', ['base-hint']);

      mockConnectionFactory.dialIdempotent
        .mockResolvedValueOnce(mockChannel) // initial connection
        .mockResolvedValueOnce(mockChannel); // reconnection

      // Prepare queue state and messages' hints used for merging
      mockMessageQueue.messages = [
        { message: 'queued-1', hints: ['hint-a'] },
        { message: 'queued-2', hints: ['hint-b', 'base-hint'] },
      ];
      mockMessageQueue.dequeue
        .mockReturnValueOnce({
          message: 'queued-1',
          hints: ['hint-a'],
        })
        .mockReturnValueOnce({
          message: 'queued-2',
          hints: ['hint-b', 'base-hint'],
        })
        .mockReturnValue(undefined);
      mockMessageQueue.length = 2;

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

      // Establish initial channel
      await sendRemoteMessage('peer-1', 'initial');

      // Cause connection loss on next send
      mockChannel.msgStream.write
        .mockRejectedValueOnce(
          Object.assign(new Error('Connection lost'), { code: 'ECONNRESET' }),
        )
        .mockResolvedValue(undefined);

      // Enqueue a message during reconnection as well (not required for hints merge)
      await sendRemoteMessage('peer-1', 'during-reconnect');

      // Ensure reconnection attempt dial happened
      await vi.waitFor(() => {
        expect(mockConnectionFactory.dialIdempotent).toHaveBeenCalledTimes(2);
      });

      await vi.waitFor(() => {
        expect(mockChannel.hints.sort()).toStrictEqual(
          ['base-hint', 'hint-a', 'hint-b'].sort(),
        );
      });
    });

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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
      mockReconnectionManager.shouldRetry.mockReturnValue(true);
      mockReconnectionManager.stopReconnection.mockImplementation(() => {
        reconnecting = false;
      });

      const { abortableDelay } = await import('@metamask/kernel-utils');
      (abortableDelay as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      // Set up queue with messages
      const queuedMsg = { message: 'queued-msg', hints: ['hint1'] };
      mockMessageQueue.dequeue
        .mockReturnValueOnce(queuedMsg)
        .mockReturnValue(undefined);
      mockMessageQueue.length = 1;
      mockMessageQueue.messages = [queuedMsg];

      const mockChannel1 = createMockChannel('peer-1', ['base-hint']);
      const mockChannel2 = createMockChannel('peer-1', ['base-hint']);

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

      const { sendRemoteMessage } = await initNetwork('0x1234', [], vi.fn());

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
});

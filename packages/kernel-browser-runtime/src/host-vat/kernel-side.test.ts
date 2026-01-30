import type { DuplexStream } from '@metamask/streams';
import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeKernelHostVat } from './kernel-side.ts';

type TestStream = DuplexStream<JsonRpcMessage, JsonRpcMessage>;

const makeMockStream = () => {
  const written: JsonRpcMessage[] = [];
  const messageHandlers: ((message: JsonRpcMessage) => void | Promise<void>)[] =
    [];
  let drainResolver: (() => void) | null = null;

  const stream: TestStream = {
    write: vi.fn(async (message: JsonRpcMessage) => {
      written.push(message);
      return { done: false, value: undefined };
    }),
    drain: vi.fn(
      async (handler: (message: JsonRpcMessage) => void | Promise<void>) => {
        messageHandlers.push(handler);
        // Return a promise that resolves when test calls closeDrain()
        return new Promise<void>((resolve) => {
          drainResolver = resolve;
        });
      },
    ),
    next: vi.fn(),
    pipe: vi.fn(),
    return: vi.fn(),
    throw: vi.fn(),
    end: vi.fn(),
    [Symbol.asyncIterator]: vi.fn(() => stream),
  };

  return {
    stream,
    written,
    // Simulate receiving a message from supervisor
    receiveMessage: async (message: JsonRpcMessage) => {
      for (const handler of messageHandlers) {
        await handler(message);
      }
    },
    closeDrain: () => {
      drainResolver?.();
    },
  };
};

/**
 * Helper to check if a message is a JSON-RPC request with the given method.
 *
 * @param message - The message to check.
 * @param method - The expected method name.
 * @returns True if the message is a request with the given method.
 */
const isRequestWithMethod = (
  message: JsonRpcMessage,
  method: string,
): message is JsonRpcRequest => {
  return 'method' in message && message.method === method && 'id' in message;
};

describe('makeKernelHostVat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('config', () => {
    it('returns config with default name', () => {
      const result = makeKernelHostVat();
      expect(result.config.name).toBe('kernelHost');
    });

    it('returns config with custom name', () => {
      const result = makeKernelHostVat({ name: 'customHost' });
      expect(result.config.name).toBe('customHost');
    });

    it('returns config with transport functions', () => {
      const result = makeKernelHostVat();

      expect(result.config.transport.deliver).toBeTypeOf('function');
      expect(result.config.transport.setSyscallHandler).toBeTypeOf('function');
      expect(result.config.transport.awaitConnection).toBeTypeOf('function');
    });
  });

  describe('connect', () => {
    it('starts draining the stream for messages', async () => {
      const result = makeKernelHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(stream.drain).toHaveBeenCalled();
      });
    });
  });

  describe('awaitConnection', () => {
    it('resolves when ready notification is received', async () => {
      const result = makeKernelHostVat();
      const { stream, receiveMessage } = makeMockStream();

      result.connect(stream);

      // Wait for drain to be called before sending messages
      await vi.waitFor(() => {
        expect(stream.drain).toHaveBeenCalled();
      });

      const connectionPromise = result.config.transport.awaitConnection();

      // Simulate supervisor sending ready notification (JSON-RPC)
      await receiveMessage({
        jsonrpc: '2.0',
        method: 'ready',
      });

      expect(await connectionPromise).toBeUndefined();
    });

    it('does not resolve before ready notification', async () => {
      const result = makeKernelHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      const connectionPromise = result.config.transport.awaitConnection();

      // Check that promise is still pending using Promise.race
      const PENDING = Symbol('pending');
      const status = await Promise.race([
        connectionPromise.then(() => 'resolved'),
        new Promise((resolve) => setTimeout(() => resolve(PENDING), 10)),
      ]);

      expect(status).toBe(PENDING);
    });
  });

  describe('deliver', () => {
    it('sends delivery request over stream as JSON-RPC', async () => {
      const result = makeKernelHostVat();
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];
      const deliverPromise = result.config.transport.deliver(
        delivery as unknown as Parameters<
          typeof result.config.transport.deliver
        >[0],
      );

      await vi.waitFor(() => {
        const deliveryMsg = written.find((item) =>
          isRequestWithMethod(item, 'deliver'),
        );
        expect(deliveryMsg).toBeDefined();
      });

      // Verify the delivery message format (JSON-RPC request)
      const deliveryMsg = written.find((item) =>
        isRequestWithMethod(item, 'deliver'),
      ) as JsonRpcRequest;
      expect(deliveryMsg.jsonrpc).toBe('2.0');
      expect(deliveryMsg.method).toBe('deliver');
      expect(deliveryMsg.params).toStrictEqual(delivery);
      expect(deliveryMsg.id).toMatch(/^kernel:\d+$/u);

      // Simulate supervisor responding with JSON-RPC response
      // The deliver result is [checkpoint, deliveryError]
      await receiveMessage({
        jsonrpc: '2.0',
        id: deliveryMsg.id,
        result: [[[], []], null],
      } as JsonRpcResponse);

      expect(await deliverPromise).toBeNull();
    });

    it('returns delivery error when supervisor reports error', async () => {
      const result = makeKernelHostVat();
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];
      const deliverPromise = result.config.transport.deliver(
        delivery as unknown as Parameters<
          typeof result.config.transport.deliver
        >[0],
      );

      // Wait for delivery to be sent
      await vi.waitFor(() => {
        expect(stream.write).toHaveBeenCalled();
      });

      // Get the request ID
      const deliveryMsg = written.find((item) =>
        isRequestWithMethod(item, 'deliver'),
      ) as JsonRpcRequest;

      // Simulate supervisor responding with error in result
      await receiveMessage({
        jsonrpc: '2.0',
        id: deliveryMsg.id,
        result: [[[], []], 'Delivery failed'],
      } as JsonRpcResponse);

      expect(await deliverPromise).toBe('Delivery failed');
    });

    it('increments delivery IDs', async () => {
      const result = makeKernelHostVat();
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      // Send first delivery
      const deliver1 = result.config.transport.deliver(
        delivery as unknown as Parameters<
          typeof result.config.transport.deliver
        >[0],
      );

      await vi.waitFor(() => {
        expect(
          written.filter((item) => isRequestWithMethod(item, 'deliver')),
        ).toHaveLength(1);
      });

      // Send second delivery
      const deliver2 = result.config.transport.deliver(
        delivery as unknown as Parameters<
          typeof result.config.transport.deliver
        >[0],
      );

      await vi.waitFor(() => {
        expect(
          written.filter((item) => isRequestWithMethod(item, 'deliver')),
        ).toHaveLength(2);
      });

      // Check IDs increment within a single host vat instance
      const deliveryMsgs = written.filter((item) =>
        isRequestWithMethod(item, 'deliver'),
      );
      const id1 = deliveryMsgs[0]?.id as string;
      const id2 = deliveryMsgs[1]?.id as string;
      // IDs should be different and follow the pattern
      expect(id1).toMatch(/^kernel:\d+$/u);
      expect(id2).toMatch(/^kernel:\d+$/u);
      expect(id1).not.toBe(id2);

      // Resolve both
      await receiveMessage({
        jsonrpc: '2.0',
        id: id1,
        result: [[[], []], null],
      } as JsonRpcResponse);
      await receiveMessage({
        jsonrpc: '2.0',
        id: id2,
        result: [[[], []], null],
      } as JsonRpcResponse);

      await Promise.all([deliver1, deliver2]);
    });

    it('throws if stream is not connected', async () => {
      const result = makeKernelHostVat();

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      await expect(
        result.config.transport.deliver(
          delivery as unknown as Parameters<
            typeof result.config.transport.deliver
          >[0],
        ),
      ).rejects.toThrow('Stream not connected');
    });
  });

  describe('syscall handling', () => {
    it('calls syscall handler when syscall notification is received', async () => {
      const result = makeKernelHostVat();
      const { stream, receiveMessage } = makeMockStream();
      const syscallHandler = vi.fn().mockReturnValue(['ok', null]);

      result.config.transport.setSyscallHandler(syscallHandler);
      result.connect(stream);

      const syscall = ['send', 'ko1', { methargs: { body: '', slots: [] } }];
      // Send as JSON-RPC notification
      await receiveMessage({
        jsonrpc: '2.0',
        method: 'syscall',
        params: syscall,
      } as JsonRpcNotification);

      await vi.waitFor(() => {
        expect(syscallHandler).toHaveBeenCalledWith(syscall);
      });
    });

    it('ignores syscall if handler is not set', async () => {
      const mockLogger = { warn: vi.fn() };
      const result = makeKernelHostVat({ logger: mockLogger as never });
      const { stream, receiveMessage } = makeMockStream();

      // Don't set syscall handler
      result.connect(stream);

      const syscall = ['send', 'ko1', { methargs: { body: '', slots: [] } }];

      // Should not throw
      await receiveMessage({
        jsonrpc: '2.0',
        method: 'syscall',
        params: syscall,
      } as JsonRpcNotification);

      await vi.waitFor(() => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Received syscall before handler was set',
        );
      });
    });

    it('logs error if syscall handler throws', async () => {
      const mockLogger = { error: vi.fn() };
      const result = makeKernelHostVat({ logger: mockLogger as never });
      const { stream, receiveMessage } = makeMockStream();

      const error = new Error('Syscall failed');
      const syscallHandler = vi.fn().mockImplementation(() => {
        throw error;
      });

      result.config.transport.setSyscallHandler(syscallHandler);
      result.connect(stream);

      const syscall = ['send', 'ko1', { methargs: { body: '', slots: [] } }];
      await receiveMessage({
        jsonrpc: '2.0',
        method: 'syscall',
        params: syscall,
      } as JsonRpcNotification);

      await vi.waitFor(() => {
        expect(mockLogger.error).toHaveBeenCalledWith('Syscall error:', error);
      });
    });
  });
});

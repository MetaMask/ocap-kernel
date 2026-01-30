import type { DuplexStream } from '@metamask/streams';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeKernelHostVat } from './kernel-side.ts';
import type {
  KernelToSupervisorMessage,
  SupervisorToKernelMessage,
} from './transport.ts';

type TestStream = DuplexStream<
  SupervisorToKernelMessage,
  KernelToSupervisorMessage
>;

const makeMockStream = () => {
  const written: KernelToSupervisorMessage[] = [];
  const messageHandlers: ((message: SupervisorToKernelMessage) => void)[] = [];
  let drainResolver: (() => void) | null = null;

  const stream: TestStream = {
    write: vi.fn(async (message: KernelToSupervisorMessage) => {
      written.push(message);
      return { done: false, value: undefined };
    }),
    drain: vi.fn(
      async (handler: (message: SupervisorToKernelMessage) => void) => {
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
    receiveMessage: (message: SupervisorToKernelMessage) => {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
    closeDrain: () => {
      drainResolver?.();
    },
  };
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
    it('sends connected message when stream is connected', async () => {
      const result = makeKernelHostVat();
      const { stream, written } = makeMockStream();

      result.connect(stream);

      // Allow async operations to complete
      await vi.waitFor(() => {
        expect(written).toContainEqual({ type: 'connected' });
      });
    });

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
    it('resolves when ready message is received', async () => {
      const result = makeKernelHostVat();
      const { stream, receiveMessage } = makeMockStream();

      result.connect(stream);

      const connectionPromise = result.config.transport.awaitConnection();

      // Simulate supervisor sending ready message
      receiveMessage({ type: 'ready' });

      expect(await connectionPromise).toBeUndefined();
    });

    it('does not resolve before ready message', async () => {
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
    it('sends delivery message over stream', async () => {
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
        const deliveryMsg = written.find((item) => item.type === 'delivery');
        expect(deliveryMsg).toBeDefined();
      });

      // Verify the delivery message format
      const deliveryMsg = written.find(
        (
          item,
        ): item is Extract<KernelToSupervisorMessage, { type: 'delivery' }> =>
          item.type === 'delivery',
      );
      expect(deliveryMsg?.delivery).toStrictEqual(delivery);
      expect(deliveryMsg?.id).toBe('0');

      // Simulate supervisor responding
      receiveMessage({ type: 'delivery-result', id: '0', error: null });

      expect(await deliverPromise).toBeNull();
    });

    it('returns delivery error when supervisor reports error', async () => {
      const result = makeKernelHostVat();
      const { stream, receiveMessage } = makeMockStream();

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

      // Simulate supervisor responding with error
      receiveMessage({
        type: 'delivery-result',
        id: '0',
        error: 'Delivery failed',
      });

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
        expect(written.filter((item) => item.type === 'delivery')).toHaveLength(
          1,
        );
      });

      // Send second delivery
      const deliver2 = result.config.transport.deliver(
        delivery as unknown as Parameters<
          typeof result.config.transport.deliver
        >[0],
      );

      await vi.waitFor(() => {
        expect(written.filter((item) => item.type === 'delivery')).toHaveLength(
          2,
        );
      });

      // Check IDs
      const deliveryMsgs = written.filter(
        (
          item,
        ): item is Extract<KernelToSupervisorMessage, { type: 'delivery' }> =>
          item.type === 'delivery',
      );
      expect(deliveryMsgs[0]?.id).toBe('0');
      expect(deliveryMsgs[1]?.id).toBe('1');

      // Resolve both
      receiveMessage({ type: 'delivery-result', id: '0', error: null });
      receiveMessage({ type: 'delivery-result', id: '1', error: null });

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
    it('calls syscall handler when syscall message is received', async () => {
      const result = makeKernelHostVat();
      const { stream, receiveMessage } = makeMockStream();
      const syscallHandler = vi.fn().mockReturnValue(['ok', null]);

      result.config.transport.setSyscallHandler(syscallHandler);
      result.connect(stream);

      const syscall = ['send', 'ko1', { methargs: { body: '', slots: [] } }];
      receiveMessage({ type: 'syscall', syscall: syscall as never });

      expect(syscallHandler).toHaveBeenCalledWith(syscall);
    });

    it('ignores syscall if handler is not set', async () => {
      const mockLogger = { warn: vi.fn() };
      const result = makeKernelHostVat({ logger: mockLogger as never });
      const { stream, receiveMessage } = makeMockStream();

      // Don't set syscall handler
      result.connect(stream);

      const syscall = ['send', 'ko1', { methargs: { body: '', slots: [] } }];

      // Should not throw
      expect(() => {
        receiveMessage({ type: 'syscall', syscall: syscall as never });
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Received syscall before handler was set',
      );
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
      receiveMessage({ type: 'syscall', syscall: syscall as never });

      expect(mockLogger.error).toHaveBeenCalledWith('Syscall error:', error);
    });
  });
});

import { SystemVatSupervisor } from '@metamask/ocap-kernel/vats';
import type { DuplexStream } from '@metamask/streams';
import type {
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeBackgroundHostVat } from './supervisor-side.ts';

// Mock SystemVatSupervisor
vi.mock('@metamask/ocap-kernel/vats', () => ({
  SystemVatSupervisor: {
    make: vi.fn(),
  },
}));

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
    // Simulate receiving a message from kernel
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

const makeMockSupervisor = () => ({
  deliver: vi.fn().mockResolvedValue(null),
  id: 'sv0' as const,
});

/**
 * Helper to check if a message is a JSON-RPC notification with the given method.
 *
 * @param message - The message to check.
 * @param method - The expected method name.
 * @returns True if the message is a notification with the given method.
 */
const isNotificationWithMethod = (
  message: JsonRpcMessage,
  method: string,
): message is JsonRpcNotification => {
  return 'method' in message && message.method === method && !('id' in message);
};

/**
 * Helper to check if a message is a JSON-RPC response.
 *
 * @param message - The message to check.
 * @returns True if the message is a response.
 */
const isResponse = (message: JsonRpcMessage): message is JsonRpcResponse => {
  return 'id' in message && ('result' in message || 'error' in message);
};

describe('makeBackgroundHostVat', () => {
  let mockSupervisor: ReturnType<typeof makeMockSupervisor>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupervisor = makeMockSupervisor();
    vi.mocked(SystemVatSupervisor.make).mockResolvedValue(
      mockSupervisor as never,
    );
  });

  describe('connect', () => {
    it('creates supervisor with internal buildRootObject', async () => {
      const result = makeBackgroundHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(SystemVatSupervisor.make).toHaveBeenCalled();
      });

      const makeCall = vi.mocked(SystemVatSupervisor.make).mock.calls[0];
      expect(makeCall?.[0]).toHaveProperty('buildRootObject');
      expect(makeCall?.[0]).toHaveProperty('executeSyscall');
    });

    it('sends ready notification after supervisor is created', async () => {
      const result = makeBackgroundHostVat();
      const { stream, written } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        const readyMsg = written.find((item) =>
          isNotificationWithMethod(item, 'ready'),
        );
        expect(readyMsg).toBeDefined();
      });

      // Verify the ready message format (JSON-RPC notification)
      const readyMsg = written.find((item) =>
        isNotificationWithMethod(item, 'ready'),
      );
      expect(readyMsg).toStrictEqual({
        jsonrpc: '2.0',
        method: 'ready',
      });
    });

    it('starts draining stream after sending ready', async () => {
      const result = makeBackgroundHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(stream.drain).toHaveBeenCalled();
      });
    });
  });

  describe('kernelFacetPromise', () => {
    it('resolves when bootstrap is called with kernelFacet in services', async () => {
      const mockKernelFacet = { launchSubcluster: vi.fn() };
      let capturedBuildRootObject: (() => object) | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedBuildRootObject =
            options.buildRootObject as typeof capturedBuildRootObject;
          return mockSupervisor as never;
        },
      );

      const result = makeBackgroundHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedBuildRootObject).not.toBeNull();
      });

      // Build root object (liveslots calls this)
      const rootObject = capturedBuildRootObject?.() as {
        bootstrap: (
          roots: Record<string, unknown>,
          services: Record<string, unknown>,
        ) => void;
      };

      // Simulate kernel sending bootstrap message with kernelFacet in services
      rootObject.bootstrap({}, { kernelFacet: mockKernelFacet });

      expect(await result.kernelFacetPromise).toBe(mockKernelFacet);
    });

    it('rejects if kernelFacet is not provided in services', async () => {
      let capturedBuildRootObject: (() => object) | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedBuildRootObject =
            options.buildRootObject as typeof capturedBuildRootObject;
          return mockSupervisor as never;
        },
      );

      const result = makeBackgroundHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedBuildRootObject).not.toBeNull();
      });

      const rootObject = capturedBuildRootObject?.() as {
        bootstrap: (
          roots: Record<string, unknown>,
          services: Record<string, unknown>,
        ) => void;
      };

      // Bootstrap without kernelFacet
      rootObject.bootstrap({}, {});

      await expect(result.kernelFacetPromise).rejects.toThrow(
        'kernelFacet not provided in bootstrap services',
      );
    });
  });

  describe('delivery handling', () => {
    it('delivers to supervisor and sends JSON-RPC response back', async () => {
      const result = makeBackgroundHostVat();
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      // Wait for supervisor to be ready
      await vi.waitFor(() => {
        const readyMsg = written.find((item) =>
          isNotificationWithMethod(item, 'ready'),
        );
        expect(readyMsg).toBeDefined();
      });

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      // Send JSON-RPC request for delivery
      await receiveMessage({
        jsonrpc: '2.0',
        id: 'kernel:123',
        method: 'deliver',
        params: delivery,
      } as JsonRpcRequest);

      expect(mockSupervisor.deliver).toHaveBeenCalledWith(delivery);

      // Check the response - VatDeliveryResult is [checkpoint, error]
      const responseMsg = written.find((item) => isResponse(item));
      expect(responseMsg).toStrictEqual({
        jsonrpc: '2.0',
        id: 'kernel:123',
        result: [[[], []], null],
      });
    });

    it('sends delivery error in response when supervisor.deliver returns error', async () => {
      mockSupervisor.deliver.mockResolvedValue('Something went wrong');

      const result = makeBackgroundHostVat();
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        const readyMsg = written.find((item) =>
          isNotificationWithMethod(item, 'ready'),
        );
        expect(readyMsg).toBeDefined();
      });

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      // Send JSON-RPC request for delivery
      await receiveMessage({
        jsonrpc: '2.0',
        id: 'kernel:456',
        method: 'deliver',
        params: delivery,
      } as JsonRpcRequest);

      // VatDeliveryResult is [checkpoint, error]
      const responseMsg = written.find((item) => isResponse(item));
      expect(responseMsg).toStrictEqual({
        jsonrpc: '2.0',
        id: 'kernel:456',
        result: [[[], []], 'Something went wrong'],
      });
    });
  });

  describe('syscall execution', () => {
    it('sends syscall as JSON-RPC notification over stream', async () => {
      let capturedExecuteSyscall: ((vso: unknown) => unknown) | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedExecuteSyscall =
            options.executeSyscall as typeof capturedExecuteSyscall;
          return mockSupervisor as never;
        },
      );

      const result = makeBackgroundHostVat();
      const { stream, written } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedExecuteSyscall).not.toBeNull();
      });

      const syscall = [
        'send',
        'ko1',
        { methargs: { body: '#{}', slots: [] }, result: 'kp1' },
      ];
      const syscallResult = capturedExecuteSyscall?.(syscall);

      // Should return success immediately (optimistic)
      expect(syscallResult).toStrictEqual(['ok', null]);

      await vi.waitFor(() => {
        const syscallMsg = written.find((item) =>
          isNotificationWithMethod(item, 'syscall'),
        );
        expect(syscallMsg).toBeDefined();
      });

      // Verify the syscall message format (JSON-RPC notification)
      const syscallMsg = written.find((item) =>
        isNotificationWithMethod(item, 'syscall'),
      );
      expect(syscallMsg).toStrictEqual({
        jsonrpc: '2.0',
        method: 'syscall',
        params: syscall,
      });
    });

    it('returns ok immediately without waiting for response', async () => {
      let capturedExecuteSyscall: ((vso: unknown) => unknown) | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedExecuteSyscall =
            options.executeSyscall as typeof capturedExecuteSyscall;
          return mockSupervisor as never;
        },
      );

      const result = makeBackgroundHostVat();
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedExecuteSyscall).not.toBeNull();
      });

      const syscall = ['subscribe', 'kp1'];
      const syscallResult = capturedExecuteSyscall?.(syscall);

      // Result is synchronous, not a promise
      expect(syscallResult).toStrictEqual(['ok', null]);
    });
  });
});

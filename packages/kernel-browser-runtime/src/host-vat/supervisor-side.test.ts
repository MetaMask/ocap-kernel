import { SystemVatSupervisor } from '@metamask/ocap-kernel/vats';
import type { DuplexStream } from '@metamask/streams';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeBackgroundHostVat } from './supervisor-side.ts';
import type {
  KernelToSupervisorMessage,
  SupervisorToKernelMessage,
} from './transport.ts';

// Import after mock

// Mock SystemVatSupervisor
vi.mock('@metamask/ocap-kernel/vats', () => ({
  SystemVatSupervisor: {
    make: vi.fn(),
  },
}));

type TestStream = DuplexStream<
  KernelToSupervisorMessage,
  SupervisorToKernelMessage
>;

const makeMockStream = () => {
  const written: SupervisorToKernelMessage[] = [];
  const messageHandlers: ((
    message: KernelToSupervisorMessage,
  ) => void | Promise<void>)[] = [];
  let drainResolver: (() => void) | null = null;

  const stream: TestStream = {
    write: vi.fn(async (message: SupervisorToKernelMessage) => {
      written.push(message);
      return { done: false, value: undefined };
    }),
    drain: vi.fn(
      async (
        handler: (message: KernelToSupervisorMessage) => void | Promise<void>,
      ) => {
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
    receiveMessage: async (message: KernelToSupervisorMessage) => {
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
    it('creates supervisor with provided buildRootObject', async () => {
      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(SystemVatSupervisor.make).toHaveBeenCalled();
      });

      const makeCall = vi.mocked(SystemVatSupervisor.make).mock.calls[0];
      expect(makeCall?.[0]).toHaveProperty('buildRootObject');
      expect(makeCall?.[0]).toHaveProperty('executeSyscall');
    });

    it('sends ready message after supervisor is created', async () => {
      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream, written } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(written).toContainEqual({ type: 'ready' });
      });
    });

    it('starts draining stream after sending ready', async () => {
      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(stream.drain).toHaveBeenCalled();
      });
    });
  });

  describe('kernelFacetPromise', () => {
    it('resolves when buildRootObject receives kernelFacet in vatPowers', async () => {
      const mockKernelFacet = { launchSubcluster: vi.fn() };
      let capturedBuildRootObject:
        | ((vatPowers: Record<string, unknown>) => object)
        | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedBuildRootObject =
            options.buildRootObject as typeof capturedBuildRootObject;
          return mockSupervisor as never;
        },
      );

      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedBuildRootObject).not.toBeNull();
      });

      // Simulate liveslots calling buildRootObject with kernelFacet
      capturedBuildRootObject?.({ kernelFacet: mockKernelFacet });

      expect(await result.kernelFacetPromise).toBe(mockKernelFacet);
    });

    it('calls user buildRootObject with vatPowers', async () => {
      let capturedBuildRootObject:
        | ((
            vatPowers: Record<string, unknown>,
            parameters: Record<string, unknown> | undefined,
          ) => object)
        | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedBuildRootObject =
            options.buildRootObject as typeof capturedBuildRootObject;
          return mockSupervisor as never;
        },
      );

      const userBuildRootObject = vi
        .fn()
        .mockReturnValue({ myMethod: vi.fn() });
      const result = makeBackgroundHostVat({
        buildRootObject: userBuildRootObject,
      });
      const { stream } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(capturedBuildRootObject).not.toBeNull();
      });

      const vatPowers = { kernelFacet: {}, otherPower: 'test' };
      const rootObject = capturedBuildRootObject?.(vatPowers, {
        param: 'value',
      });

      expect(userBuildRootObject).toHaveBeenCalledWith(vatPowers, {
        param: 'value',
      });
      expect(rootObject).toHaveProperty('myMethod');
    });
  });

  describe('delivery handling', () => {
    it('delivers to supervisor and sends result back', async () => {
      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      // Wait for supervisor to be ready
      await vi.waitFor(() => {
        expect(written).toContainEqual({ type: 'ready' });
      });

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      await receiveMessage({
        type: 'delivery',
        delivery: delivery as never,
        id: '123',
      });

      expect(mockSupervisor.deliver).toHaveBeenCalledWith(delivery);
      expect(written).toContainEqual({
        type: 'delivery-result',
        id: '123',
        error: null,
      });
    });

    it('sends delivery error when supervisor.deliver returns error', async () => {
      mockSupervisor.deliver.mockResolvedValue('Something went wrong');

      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(written).toContainEqual({ type: 'ready' });
      });

      const delivery = [
        'message',
        'o+0',
        { methargs: { body: '', slots: [] } },
      ];

      await receiveMessage({
        type: 'delivery',
        delivery: delivery as never,
        id: '456',
      });

      expect(written).toContainEqual({
        type: 'delivery-result',
        id: '456',
        error: 'Something went wrong',
      });
    });

    it('handles connected message from kernel', async () => {
      const mockLogger = {
        debug: vi.fn(),
        subLogger: vi.fn(() => mockLogger),
      };
      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({
        buildRootObject,
        logger: mockLogger as never,
      });
      const { stream, written, receiveMessage } = makeMockStream();

      result.connect(stream);

      await vi.waitFor(() => {
        expect(written).toContainEqual({ type: 'ready' });
      });

      await receiveMessage({ type: 'connected' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Received connected message from kernel',
      );
    });
  });

  describe('syscall execution', () => {
    it('sends syscall over stream with coerced object', async () => {
      let capturedExecuteSyscall: ((vso: unknown) => unknown) | null = null;

      vi.mocked(SystemVatSupervisor.make).mockImplementation(
        async (options) => {
          capturedExecuteSyscall =
            options.executeSyscall as typeof capturedExecuteSyscall;
          return mockSupervisor as never;
        },
      );

      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
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
        expect(written).toContainEqual({
          type: 'syscall',
          syscall,
        });
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

      const buildRootObject = vi.fn().mockReturnValue({});
      const result = makeBackgroundHostVat({ buildRootObject });
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

import type { JsonRpcCall } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { PostMessageTarget } from '@metamask/streams/browser';
import { PostMessageDuplexStream } from '@metamask/streams/browser';
import type { JsonRpcResponse } from '@metamask/utils';
import { delay } from '@ocap/repo-tools/test-utils';
import { TestDuplexStream } from '@ocap/repo-tools/test-utils/streams';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  establishKernelConnection,
  receiveUiConnections,
  UI_CONTROL_CHANNEL_NAME,
} from './ui-connections.ts';

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-id'),
}));

vi.mock('@metamask/streams/browser', async () => {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { TestDuplexStream } = await import(
    '@ocap/repo-tools/test-utils/streams'
  );

  type MockPostMessageTarget = PostMessageTarget & {
    onmessage: (event: MessageEvent) => void;
  };

  type MockStreamOptions = {
    onEnd: () => void;
    messageTarget: MockPostMessageTarget;
  };

  // @ts-expect-error: We're overriding the static make() method
  class MockStream extends TestDuplexStream {
    static instances: MockStream[] = [];

    messageTarget: MockPostMessageTarget;

    constructor({ onEnd, messageTarget }: MockStreamOptions) {
      super(() => undefined, { readerOnEnd: onEnd, writerOnEnd: onEnd });
      MockStream.instances.push(this);
      this.messageTarget = messageTarget;
      this.messageTarget.onmessage = (event) => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.receiveInput(event.data);
      };
    }

    static async make(options: MockStreamOptions): Promise<MockStream> {
      const stream = new MockStream(options);
      await stream.completeSynchronization();
      return stream;
    }
  }

  return {
    PostMessageDuplexStream: MockStream,
  };
});

const makeClusterConfig = () => ({
  vats: {
    alice: {},
  },
});

// Mock BroadcastChannel
class MockBroadcastChannel {
  static channels: Map<string, MockBroadcastChannel> = new Map();

  onmessage: ((event: MessageEvent) => void) | null = null;

  onmessageerror: ((event: MessageEvent) => void) | null = null;

  name: string;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.channels.set(name, this);
  }

  postMessage(message: unknown): void {
    // Simulate broadcasting to other channels with the same name
    MockBroadcastChannel.channels.forEach((channel) => {
      if (channel !== this && channel.name === this.name && channel.onmessage) {
        channel.onmessage(new MessageEvent('message', { data: message }));
      }
    });
  }

  close(): void {
    MockBroadcastChannel.channels.delete(this.name);
  }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

const makeMockLogger = () =>
  ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }) as unknown as Logger;

describe('ui-connections', () => {
  const streamInstances: PostMessageDuplexStream<unknown, unknown>[] =
    // @ts-expect-error: This class is mocked
    PostMessageDuplexStream.instances;

  beforeEach(() => {
    MockBroadcastChannel.channels.clear();
    streamInstances.length = 0;
  });

  describe('establishKernelConnection', () => {
    it('should establish a connection and return a stream', async () => {
      const logger = makeMockLogger();
      const connectionPromise = establishKernelConnection({ logger });

      // Verify that the control channel receives the init message
      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      expect(controlChannel).toBeDefined();

      const stream = await connectionPromise;
      expect(stream).toBeInstanceOf(TestDuplexStream);
    });

    it('should handle instance channel message errors', async () => {
      const logger = makeMockLogger();
      await establishKernelConnection({ logger });
      expect(MockBroadcastChannel.channels.size).toBe(2);

      const instanceChannel = MockBroadcastChannel.channels.get(
        'ui-instance-test-id',
      );
      expect(instanceChannel).toBeDefined();

      // Trigger message error
      const errorEvent = new MessageEvent('messageerror', {
        data: new Error('Test error'),
      });
      instanceChannel?.onmessageerror?.(errorEvent);

      // Verify instance channel is closed
      expect(MockBroadcastChannel.channels.size).toBe(1);
      expect(MockBroadcastChannel.channels.has(UI_CONTROL_CHANNEL_NAME)).toBe(
        true,
      );
    });

    it('should handle control channel message errors', async () => {
      const logger = makeMockLogger();
      await establishKernelConnection({ logger });
      expect(MockBroadcastChannel.channels.size).toBe(2);

      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      expect(controlChannel).toBeDefined();

      const errorEvent = new MessageEvent('messageerror', {
        data: new Error('Test error'),
      });
      controlChannel?.onmessageerror?.(errorEvent);

      expect(MockBroadcastChannel.channels.size).toBe(2);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/^UI control channel error/u),
      );
    });
  });

  describe('receiveUiConnections', () => {
    const logger = makeMockLogger();

    const mockHandleMessage = vi.fn(
      async (request: JsonRpcCall): Promise<JsonRpcResponse | undefined> =>
        'id' in request
          ? {
              id: 1,
              jsonrpc: '2.0' as const,
              result: { vats: [], clusterConfig: makeClusterConfig() },
            }
          : undefined,
    );

    it('should handle new UI connections', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });

      // Simulate a new UI instance connecting
      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );

      expect(MockBroadcastChannel.channels.size).toBe(2);
      expect(logger.debug).toHaveBeenCalledWith(
        'Connecting to UI instance "test-instance-channel"',
      );
    });

    it('should handle valid message', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });

      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );

      await delay();
      const instanceStream = streamInstances[0]!;
      expect(instanceStream).toBeDefined();
      const instanceStreamWriteSpy = vi.spyOn(instanceStream, 'write');

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      )!;
      instanceChannel.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'getStatus',
            params: null,
            id: 1,
          },
        }),
      );
      await delay();

      expect(mockHandleMessage).toHaveBeenCalledWith({
        method: 'getStatus',
        params: null,
        id: 1,
      });
      expect(instanceStreamWriteSpy).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        id: 1,
        result: { vats: [], clusterConfig: makeClusterConfig() },
      });
    });

    it('should handle JSON-RPC notifications', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });

      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );

      await delay();
      const instanceStream = streamInstances[0]!;
      expect(instanceStream).toBeDefined();
      const instanceStreamWriteSpy = vi.spyOn(instanceStream, 'write');

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      )!;
      instanceChannel.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'notification',
          },
        }),
      );

      await delay();

      expect(mockHandleMessage).toHaveBeenCalledTimes(1);
      expect(mockHandleMessage).toHaveBeenCalledWith({
        method: 'notification',
      });
      expect(instanceStreamWriteSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple simultaneous connections', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });

      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel-1',
          },
        }),
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel-2',
          },
        }),
      );

      expect(MockBroadcastChannel.channels.size).toBe(3);
      expect(logger.debug).toHaveBeenCalledWith(
        'Connecting to UI instance "test-instance-channel-1"',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Connecting to UI instance "test-instance-channel-2"',
      );
    });

    it('should forget ids of closed channels', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });
      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );

      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );
      await delay();
      expect(MockBroadcastChannel.channels.size).toBe(2);

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      );
      instanceChannel?.onmessageerror?.(
        new MessageEvent('messageerror', { data: new Error('Test error') }),
      );
      await delay();
      expect(MockBroadcastChannel.channels.size).toBe(1);

      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );
      await delay();
      expect(MockBroadcastChannel.channels.size).toBe(2);
    });

    it('should reject duplicate connections', () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });
      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );

      // Connect twice with the same channel name
      const duplicateMessage = new MessageEvent('message', {
        data: {
          method: 'init',
          params: 'duplicate-channel',
        },
      });

      controlChannel?.onmessage?.(duplicateMessage);
      controlChannel?.onmessage?.(duplicateMessage);

      expect(logger.error).toHaveBeenCalledWith(
        'Already connected to UI instance "duplicate-channel"',
      );
    });

    it('should reject invalid control commands', () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });
      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );

      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            invalid: 'command',
          },
        }),
      );

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/^Received invalid UI control command/u),
      );
    });

    it('should handle instance channel message errors', async () => {
      receiveUiConnections({
        handleInstanceMessage: mockHandleMessage,
        logger,
      });

      const controlChannel = MockBroadcastChannel.channels.get(
        UI_CONTROL_CHANNEL_NAME,
      );
      controlChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'init',
            params: 'test-instance-channel',
          },
        }),
      );
      await delay();

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      );
      instanceChannel?.onmessageerror?.(
        new MessageEvent('messageerror', { data: new Error('Test error') }),
      );
      await delay();

      expect(logger.error).toHaveBeenCalledWith(
        'Error handling message from UI instance "test-instance-channel":',
        expect.any(Error),
      );
    });
  });
});

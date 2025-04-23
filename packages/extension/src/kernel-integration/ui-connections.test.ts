import type { JsonRpcResponse } from '@metamask/utils';
import { Logger } from '@ocap/logger';
import type { PostMessageTarget } from '@ocap/streams/browser';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { JsonRpcCall } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  establishKernelConnection,
  receiveUiConnections,
  UI_CONTROL_CHANNEL_NAME,
} from './ui-connections.ts';
import clusterConfig from '../vats/default-cluster.json';

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-id'),
}));

vi.mock('@ocap/streams/browser', async () => {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { TestDuplexStream } = await import('@ocap/test-utils/streams');

  type MockPostMessageTarget = PostMessageTarget & {
    onmessage: (event: MessageEvent) => void;
  };

  type MockStreamOptions = {
    onEnd: () => void;
    messageTarget: MockPostMessageTarget;
  };

  // @ts-expect-error: We're overriding the static make() method
  class MockStream extends TestDuplexStream {
    messageTarget: MockPostMessageTarget;

    constructor({ onEnd, messageTarget }: MockStreamOptions) {
      super(() => undefined, { readerOnEnd: onEnd, writerOnEnd: onEnd });
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
  beforeEach(() => {
    MockBroadcastChannel.channels.clear();
  });

  describe('establishKernelConnection', () => {
    it('should establish a connection and return a stream', async () => {
      const logger = makeMockLogger();
      const connectionPromise = establishKernelConnection(logger);

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
      await establishKernelConnection(logger);
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
      await establishKernelConnection(logger);
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
      async (_request: JsonRpcCall): Promise<JsonRpcResponse> => ({
        id: 'foo',
        jsonrpc: '2.0' as const,
        result: { vats: [], clusterConfig },
      }),
    );

    it('should handle new UI connections', async () => {
      receiveUiConnections(mockHandleMessage, logger);

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
      receiveUiConnections(mockHandleMessage, logger);

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

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      );
      instanceChannel?.onmessage?.(
        new MessageEvent('message', {
          data: {
            method: 'getStatus',
            params: null,
          },
        }),
      );
      await delay(10);

      expect(mockHandleMessage).toHaveBeenCalledWith({
        method: 'getStatus',
        params: null,
      });
    });

    it('should handle multiple simultaneous connections', async () => {
      receiveUiConnections(mockHandleMessage, logger);

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

    it('should reject duplicate connections', () => {
      receiveUiConnections(mockHandleMessage, logger);
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
      receiveUiConnections(mockHandleMessage, logger);
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
      receiveUiConnections(mockHandleMessage, logger);

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
      await delay(10);

      const instanceChannel = MockBroadcastChannel.channels.get(
        'test-instance-channel',
      );
      instanceChannel?.onmessageerror?.(
        new MessageEvent('messageerror', { data: new Error('Test error') }),
      );
      await delay(10);

      expect(logger.error).toHaveBeenCalledWith(
        'Error handling message from UI instance "test-instance-channel":',
        expect.any(Error),
      );
    });
  });
});

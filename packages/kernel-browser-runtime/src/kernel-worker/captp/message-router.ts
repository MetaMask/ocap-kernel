import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';
import type { DuplexStream } from '@metamask/streams';
import { hasProperty } from '@metamask/utils';
import type { JsonRpcResponse } from '@metamask/utils';

import type { CapTPMessage } from './kernel-captp.ts';

/**
 * Check if a message is a CapTP JSON-RPC notification.
 *
 * @param message - The message to check.
 * @returns True if the message is a CapTP notification.
 */
export function isCapTPNotification(
  message: JsonRpcMessage,
): message is JsonRpcCall & { method: 'captp'; params: [CapTPMessage] } {
  const { method, params } = message as JsonRpcCall;
  return method === 'captp' && Array.isArray(params) && params.length === 1;
}

/**
 * Create a CapTP JSON-RPC notification.
 *
 * @param captpMessage - The CapTP message to wrap.
 * @returns The JSON-RPC notification.
 */
export function makeCapTPNotification(captpMessage: CapTPMessage): JsonRpcCall {
  return {
    jsonrpc: '2.0',
    method: 'captp',
    params: [captpMessage],
  };
}

/**
 * A queue for messages, allowing async iteration.
 */
class MessageQueue<Item> implements AsyncIterable<Item> {
  readonly #queue: Item[] = [];

  #waitingKit: PromiseKit<void> | null = null;

  #done = false;

  push(value: Item): void {
    if (this.#done) {
      return;
    }
    this.#queue.push(value);
    if (this.#waitingKit) {
      this.#waitingKit.resolve();
      this.#waitingKit = null;
    }
  }

  end(): void {
    this.#done = true;
    if (this.#waitingKit) {
      this.#waitingKit.resolve();
      this.#waitingKit = null;
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Item> {
    while (!this.#done || this.#queue.length > 0) {
      if (this.#queue.length === 0) {
        if (this.#done) {
          return;
        }
        this.#waitingKit = makePromiseKit<void>();
        await this.#waitingKit.promise;
        continue;
      }
      yield this.#queue.shift() as Item;
    }
  }
}

/**
 * A stream wrapper that routes messages between kernel RPC and CapTP.
 *
 * Incoming messages:
 * - CapTP notifications (method: 'captp') are dispatched to the CapTP handler
 * - Other messages are passed to the kernel stream
 *
 * Outgoing messages:
 * - Kernel responses are written to the underlying stream
 * - CapTP messages are wrapped in notifications and written to the underlying stream
 */
export type MessageRouter = {
  /**
   * The stream for the kernel to use. Only sees non-CapTP messages.
   */
  kernelStream: DuplexStream<JsonRpcCall, JsonRpcResponse>;

  /**
   * Set the CapTP dispatch function for incoming CapTP messages.
   *
   * @param dispatch - The dispatch function.
   */
  setCapTPDispatch: (dispatch: (message: CapTPMessage) => boolean) => void;

  /**
   * Send a CapTP message to the background.
   *
   * @param message - The CapTP message to send.
   */
  sendCapTP: (message: CapTPMessage) => void;

  /**
   * Start routing messages. Returns a promise that resolves when the
   * underlying stream ends.
   */
  start: () => Promise<void>;
};

/**
 * Create a message router.
 *
 * @param underlyingStream - The underlying bidirectional message stream.
 * @returns The message router.
 */
export function makeMessageRouter(
  underlyingStream: DuplexStream<JsonRpcMessage, JsonRpcMessage>,
): MessageRouter {
  const kernelMessageQueue = new MessageQueue<JsonRpcCall>();
  let captpDispatch: ((message: CapTPMessage) => boolean) | null = null;

  // Create a stream interface for the kernel
  const kernelStream: DuplexStream<JsonRpcCall, JsonRpcResponse> = {
    async next() {
      const iterator = kernelMessageQueue[Symbol.asyncIterator]();
      const result = await iterator.next();
      return result.done
        ? { done: true, value: undefined }
        : { done: false, value: result.value };
    },

    async write(value: JsonRpcResponse) {
      await underlyingStream.write(value);
      return { done: false, value: undefined };
    },

    async drain(handler: (value: JsonRpcCall) => void | Promise<void>) {
      for await (const value of kernelMessageQueue) {
        await handler(value);
      }
    },

    async pipe<Read2>(sink: DuplexStream<Read2, JsonRpcCall>) {
      await this.drain(async (value) => {
        await sink.write(value);
      });
    },

    async return() {
      kernelMessageQueue.end();
      return { done: true, value: undefined };
    },

    async throw(_error: Error) {
      kernelMessageQueue.end();
      return { done: true, value: undefined };
    },

    async end(error?: Error) {
      return error ? this.throw(error) : this.return();
    },

    [Symbol.asyncIterator]() {
      return this;
    },
  };

  const setCapTPDispatch = (
    dispatch: (message: CapTPMessage) => boolean,
  ): void => {
    if (captpDispatch) {
      throw new Error('CapTP dispatch already set');
    }
    captpDispatch = dispatch;
  };

  const sendCapTP = (message: CapTPMessage): void => {
    const notification = makeCapTPNotification(message);
    underlyingStream.write(notification).catch(() => {
      // Ignore write errors - the stream may have closed
    });
  };

  const start = async (): Promise<void> => {
    try {
      await underlyingStream.drain((message) => {
        if (isCapTPNotification(message)) {
          // Dispatch to CapTP
          const captpMessage = message.params[0];
          if (captpDispatch) {
            captpDispatch(captpMessage);
          }
        } else if (
          hasProperty(message, 'method') &&
          typeof message.method === 'string'
        ) {
          // Pass to kernel as JsonRpcCall
          kernelMessageQueue.push(message as JsonRpcCall);
        }
        // Ignore other message types (e.g., responses that shouldn't come this way)
      });
    } finally {
      kernelMessageQueue.end();
    }
  };

  return harden({
    kernelStream,
    setCapTPDispatch,
    sendCapTP,
    start,
  });
}
harden(makeMessageRouter);

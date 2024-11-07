/**
 * This module provides a class and utilities for multiplexing duplex streams. A
 * multiplexer is not a stream itself, but rather a wrapper around a duplex stream.
 * The multiplexer provides methods for creating "channels" over the underlying stream,
 * which are themselves duplex streams and may have a different message type and
 * validation logic.
 *
 * The multiplexer is constructed in an idle state, and must be explicitly "started"
 * via the `start()` or `drainAll()` methods. All channels must be added before the
 * multiplexer is started.
 *
 * Starting the multiplexer will synchronize the underlying duplex stream, if it is
 * synchronizable. Therefore, in order to prevent message loss, callers **should not**
 * synchronize the underlying duplex stream before passing it to the multiplexer. For
 * the same reason, the multiplexer will throw if any channels are added after it has
 * started.
 *
 * @module StreamMultiplexer
 */

import { isObject } from '@metamask/utils';

import type { DuplexStream } from './BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  ValidateInput,
  ReceiveInput,
} from './BaseStream.js';
import { BaseReader } from './BaseStream.js';
import { makeDoneResult } from './utils.js';

/**
 * A duplex stream that can maybe be synchronized.
 */
type SynchronizableDuplexStream<Read, Write = Read> = DuplexStream<
  Read,
  Write
> & {
  synchronize?: () => Promise<void>;
};

/**
 * The read stream implementation for {@link StreamMultiplexer} channels.
 */
class ChannelReader<Read> extends BaseReader<Read> {
  // eslint-disable-next-line no-restricted-syntax
  private constructor(args: BaseReaderArgs<Read>) {
    super(args);
  }

  static make<Read>(
    args: BaseReaderArgs<Read>,
  ): [ChannelReader<Read>, ReceiveInput] {
    const channel = new ChannelReader<Read>(args);
    return [channel, channel.getReceiveInput()] as const;
  }
}

type ChannelName = string;

/**
 * A multiplex envelope. The wrapper for all values passing through the underlying
 * duplex stream of a {@link StreamMultiplexer}.
 */
export type MultiplexEnvelope<Payload = unknown> = {
  channel: ChannelName;
  payload: Payload;
};

/**
 * Type guard for {@link MultiplexEnvelope}. Only verifies that the `payload` property
 * is not `undefined`, assuming that multiplexer channels will be responsible for
 * performing further validation.
 *
 * @param value - The value to check.
 * @returns Whether the value is a {@link MultiplexEnvelope}.
 */
export const isMultiplexEnvelope = (
  value: unknown,
): value is MultiplexEnvelope =>
  isObject(value) &&
  typeof value.channel === 'string' &&
  typeof value.payload !== 'undefined';

type HandleRead<Read> = (value: Read) => void | Promise<void>;

/**
 * A duplex stream whose `drain` method does not accept a callback. We say it is
 * "handled" because in practice the callback is bound to the `drain` method.
 */
export type HandledDuplexStream<Read, Write> = Omit<
  DuplexStream<Read, Write>,
  'drain'
> & {
  drain: () => Promise<void>;
};

enum MultiplexerStatus {
  Idle = 0,
  Running = 1,
  Done = 2,
}

type ChannelRecord<Read, Write = Read> = {
  channelName: ChannelName;
  stream: HandledDuplexStream<Read, Write>;
  receiveInput: ReceiveInput;
};

export class StreamMultiplexer<Payload = unknown> {
  #status: MultiplexerStatus;

  readonly #name: string;

  readonly #channels: Map<ChannelName, ChannelRecord<unknown, unknown>>;

  readonly #stream: SynchronizableDuplexStream<
    MultiplexEnvelope<Payload>,
    MultiplexEnvelope<Payload>
  >;

  /**
   * Creates a new multiplexer over the specified duplex stream. If the duplex stream
   * is synchronizable, it will be synchronized by the multiplexer and **should not**
   * be synchronized by the caller.
   *
   * @param stream - The underlying duplex stream.
   * @param name - The multiplexer name.
   */
  constructor(
    stream: SynchronizableDuplexStream<
      MultiplexEnvelope<Payload>,
      MultiplexEnvelope<Payload>
    >,
    name?: string,
  ) {
    this.#status = MultiplexerStatus.Idle;
    this.#channels = new Map();
    this.#name = name ?? this.constructor.name;
    this.#stream = stream;
  }

  /**
   * Starts the multiplexer and drains all of its channels. Use either this method or
   * {@link start} to drain the multiplexer.
   *
   * @returns A promise resolves when the multiplexer and its channels have ended.
   */
  async drainAll(): Promise<void> {
    if (this.#channels.size === 0) {
      throw new Error(`${this.#name} has no channels`);
    }

    const promise = Promise.all([
      this.start(),
      ...Array.from(this.#channels.values()).map(async ({ stream }) =>
        stream.drain(),
      ),
    ]).then(async () => this.#end());

    // Set up cleanup and prevent unhandled rejections. The caller is still expected to
    // handle rejections.
    promise.catch(async (error) => this.#end(error));

    return promise;
  }

  /**
   * Idempotently starts the multiplexer by draining the underlying duplex stream and
   * forwarding messages to the appropriate channels. Ends the multiplexer if the duplex
   * stream ends. Use either this method or {@link drainAll} to drain the multiplexer.
   *
   * If the duplex stream is synchronizable, it will be synchronized by the multiplexer
   * and **should not** be synchronized by the caller.
   */
  async start(): Promise<void> {
    if (this.#status !== MultiplexerStatus.Idle) {
      return;
    }
    this.#status = MultiplexerStatus.Running;

    await this.#stream.synchronize?.();

    for await (const envelope of this.#stream) {
      const channel = this.#channels.get(envelope.channel);
      if (channel === undefined) {
        await this.#end(
          new Error(
            `${this.#name} received message for unknown channel: ${envelope.channel}`,
          ),
        );
        return;
      }
      await channel.receiveInput(envelope.payload);
    }
    await this.#end();
  }

  /**
   * Adds a channel to the multiplexer. Must be called before starting the
   * multiplexer.
   *
   * @param channelName - The channel name. Must be unique.
   * @param handleRead - The channel's drain handler.
   * @param validateInput - The channel's input validator.
   * @returns The channel stream.
   */
  addChannel<Read extends Payload, Write extends Payload = Read>(
    channelName: ChannelName,
    handleRead: HandleRead<Read>,
    validateInput?: ValidateInput<Read>,
  ): HandledDuplexStream<Read, Write> {
    if (this.#status !== MultiplexerStatus.Idle) {
      throw new Error('Channels must be added before starting the multiplexer');
    }
    if (this.#channels.has(channelName)) {
      throw new Error(`Channel "${channelName}" already exists.`);
    }

    const { stream, receiveInput } = this.#makeChannel<Read, Write>(
      channelName,
      handleRead,
      validateInput,
    );

    // We downcast some properties in order to store all records in one place.
    this.#channels.set(channelName, {
      channelName,
      stream: stream as HandledDuplexStream<unknown, unknown>,
      receiveInput,
    });

    return stream;
  }

  /**
   * Constructs a channel. Channels are objects that implement the {@link HandledDuplexStream}
   * interface. Internally, they are backed up by a {@link ChannelReader} and a wrapped
   * write method that forwards messages to the underlying duplex stream.
   *
   * @param channelName - The channel name. Must be unique.
   * @param handleRead - The channel's drain handler.
   * @param validateInput - The channel's input validator.
   * @returns The channel stream and its `receiveInput` method.
   */
  #makeChannel<Read extends Payload, Write extends Payload = Read>(
    channelName: ChannelName,
    handleRead: HandleRead<Read>,
    validateInput?: ValidateInput<Read>,
  ): {
    stream: HandledDuplexStream<Read, Write>;
    receiveInput: ReceiveInput;
  } {
    let isDone = false;

    const [reader, receiveInput] = ChannelReader.make<Read>({
      validateInput,
      name: `${this.#name}#${channelName}`,
      onEnd: async () => {
        isDone = true;
        await this.#end();
      },
    });

    const write = async (
      payload: Write,
    ): Promise<IteratorResult<undefined, undefined>> => {
      if (isDone) {
        return makeDoneResult();
      }

      const writeP = this.#stream.write({
        channel: channelName,
        payload,
      });
      writeP.catch(async (error) => {
        isDone = true;
        await reader.throw(error);
      });
      return writeP;
    };

    const drain = async (): Promise<void> => {
      for await (const value of reader) {
        await handleRead(value);
      }
    };

    // Create and return the DuplexStream interface
    const stream: HandledDuplexStream<Read, Write> = {
      next: reader.next.bind(reader),
      return: reader.return.bind(reader),
      throw: reader.throw.bind(reader),
      write,
      drain,
      [Symbol.asyncIterator]() {
        return stream;
      },
    };

    return { stream, receiveInput };
  }

  /**
   * Ends the multiplexer and its channels.
   */
  async return(): Promise<void> {
    await this.#end();
  }

  async #end(error?: Error): Promise<void> {
    if (this.#status === MultiplexerStatus.Done) {
      return;
    }
    this.#status = MultiplexerStatus.Done;

    const end = async <Read, Write>(
      stream: DuplexStream<Read, Write>,
    ): Promise<unknown> =>
      error === undefined ? stream.return() : stream.throw(error);

    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([
      end(this.#stream),
      ...Array.from(this.#channels.values()).map(async (channel) =>
        end(channel.stream),
      ),
    ]);
  }
}

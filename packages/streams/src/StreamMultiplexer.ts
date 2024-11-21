/**
 * This module provides a class and utilities for multiplexing duplex streams. A
 * multiplexer is not a stream itself, but rather a wrapper around a duplex stream.
 * The multiplexer provides methods for creating "channels" over the underlying stream,
 * which are themselves duplex streams and may have a different message type and
 * validation logic.
 *
 * The multiplexer is constructed in an idle state, and must be explicitly "started"
 * via the `start()` method. Channels are backed up by the same implementation as other
 * duplex streams, and are synchronized in the same way. Consequently, channels can be
 * added at any time before  the multiplexer has ended, without message loss. Attempting
 * to add channels after the multiplexer has ended will throw.
 *
 * While channels can be added in arbitrary order, the multiplexer and its channels end
 * jointly or not at all. This is to say, if the underlying duplex stream or a channel
 * ends, all streams associated with the multiplexer will end.
 *
 * @module StreamMultiplexer
 */

import { isObject } from '@metamask/utils';

import {
  isSyn,
  makeDuplexStreamInputValidator,
  SynchronizableDuplexStream,
} from './BaseDuplexStream.js';
import type { DuplexStream } from './BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  ValidateInput,
  ReceiveInput,
} from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import type { Dispatchable } from './utils.js';

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

class ChannelWriter<Write> extends BaseWriter<Write> {}

class Channel<Read, Write>
  extends SynchronizableDuplexStream<Read, Write>
  implements DuplexStream<Read, Write>
{
  constructor(reader: ChannelReader<Read>, writer: ChannelWriter<Write>) {
    super(reader, writer);
    // Forgive us for this async side effect
    this.synchronize().catch(async (error) => this.throw(error));
  }

  async drain(handler: (value: Read) => void | Promise<void>): Promise<void> {
    return this.synchronize().then(async () => super.drain(handler));
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

enum MultiplexerStatus {
  Idle = 0,
  Running = 1,
  Done = 2,
}

type ChannelRecord<Read, Write = Read> = {
  channelName: ChannelName;
  stream: DuplexStream<Read, Write>;
  receiveInput: ReceiveInput;
};

export class StreamMultiplexer<Payload = unknown> {
  #status: MultiplexerStatus;

  readonly #name: string;

  readonly #channels: Map<ChannelName, ChannelRecord<unknown, unknown>>;

  readonly #stream: SynchronizableDuplexStream<
    MultiplexEnvelope<Payload>,
    MultiplexEnvelope<Payload | Dispatchable<Payload>>
  >;

  /**
   * Creates a new multiplexer over the specified duplex stream.
   *
   * @param stream - The underlying duplex stream.
   * @param name - The multiplexer name.
   */
  constructor(
    stream: SynchronizableDuplexStream<
      MultiplexEnvelope<Payload>,
      MultiplexEnvelope<Payload | Dispatchable<Payload>>
    >,
    name?: string,
  ) {
    this.#status = MultiplexerStatus.Idle;
    this.#channels = new Map();
    this.#name = name ?? this.constructor.name;
    this.#stream = stream;
  }

  /**
   * Idempotently starts the multiplexer by draining the underlying duplex stream and
   * forwarding messages to the appropriate channels. Ends the multiplexer if the duplex
   * stream ends.
   *
   * If the duplex stream is synchronizable, it will be synchronized by the multiplexer.
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
        // The other side is trying to establish a channel before us.
        if (isSyn(envelope.payload)) {
          continue;
        }

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
   * Adds a channel to the multiplexer.
   *
   * @param channelName - The channel name. Must be unique.
   * @param validateInput - The channel's input validator.
   * @returns The channel stream.
   */
  createChannel<Read extends Payload, Write extends Payload = Read>(
    channelName: ChannelName,
    validateInput?: ValidateInput<Read>,
  ): DuplexStream<Read, Write> {
    if (this.#status === MultiplexerStatus.Done) {
      throw new Error('Multiplexer has ended');
    }
    if (this.#channels.has(channelName)) {
      throw new Error(`Channel "${channelName}" already exists.`);
    }

    const { stream, receiveInput } = this.#makeChannel<Read, Write>(
      channelName,
      validateInput,
    );

    // We downcast some properties in order to store all records in one place.
    this.#channels.set(channelName, {
      channelName,
      stream: stream as DuplexStream<unknown, unknown>,
      receiveInput,
    });

    return stream;
  }

  /**
   * Constructs a channel. Channels are synchronized {@link DuplexStream} objects.
   *
   * @param channelName - The channel name. Must be unique.
   * @param validateInput - The channel's input validator.
   * @returns The channel stream and its `receiveInput` method.
   */
  #makeChannel<Read extends Payload, Write extends Payload = Read>(
    channelName: ChannelName,
    validateInput?: ValidateInput<Read>,
  ): {
    stream: DuplexStream<Read, Write>;
    receiveInput: ReceiveInput;
  } {
    const [reader, receiveInput] = ChannelReader.make<Read>({
      validateInput: makeDuplexStreamInputValidator(validateInput),
      name: `${this.#name}#${channelName}`,
      onEnd: async (error) => {
        await this.#end(error);
      },
    });

    const writer = new ChannelWriter<Write>({
      name: `${this.#name}#${channelName}`,
      onDispatch: async (payload) => {
        await this.#stream.write({
          channel: channelName,
          payload,
        });
      },
      onEnd: async (error) => {
        await this.#end(error);
      },
    });

    return {
      stream: new Channel(reader, writer),
      receiveInput,
    };
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

    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([
      this.#stream.end(error),
      ...Array.from(this.#channels.values()).map(async (channel) =>
        channel.stream.end(error),
      ),
    ]);
  }
}

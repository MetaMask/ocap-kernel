import type { Json } from '@metamask/utils';

import type { DuplexStream } from './BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  ValidateInput,
  ReceiveInput,
} from './BaseStream.js';
import { BaseReader } from './BaseStream.js';
import { makeDoneResult } from './utils.js';

type SynchronizableDuplexStream<
  Read extends Json,
  Write extends Json = Read,
> = DuplexStream<Read, Write> & {
  synchronize?: () => Promise<void>;
};

class ChannelReader<Read extends Json> extends BaseReader<Read> {
  // eslint-disable-next-line no-restricted-syntax
  private constructor(args: BaseReaderArgs<Read>) {
    super(args);
  }

  static make<Read extends Json>(
    args: BaseReaderArgs<Read>,
  ): [ChannelReader<Read>, ReceiveInput] {
    const channel = new ChannelReader<Read>(args);
    return [channel, channel.getReceiveInput()] as const;
  }
}

type ChannelName = string;

export type MultiplexEnvelope = {
  channel: ChannelName;
  payload: Json;
};

type HandleRead<Read extends Json> = (value: Read) => void | Promise<void>;

type ChannelRecord<Read extends Json, Write extends Json = Read> = {
  channelName: ChannelName;
  stream: HandledDuplexStream<Read, Write>;
  receiveInput: ReceiveInput;
};

export type HandledDuplexStream<Read extends Json, Write extends Json> = Omit<
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

export class StreamMultiplexer {
  #status: MultiplexerStatus;

  readonly #name: string;

  readonly #channels: Map<ChannelName, ChannelRecord<Json, Json>>;

  readonly #stream: SynchronizableDuplexStream<
    MultiplexEnvelope,
    MultiplexEnvelope
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
    stream: SynchronizableDuplexStream<MultiplexEnvelope, MultiplexEnvelope>,
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
   * Adds a channel to the multiplexer.
   *
   * @param channelName - The channel name.
   * @param validateInput - The input validator.
   * @param handleRead - The channel stream's drain handler.
   * @returns The channel stream.
   */
  addChannel<Read extends Json, Write extends Json>(
    channelName: ChannelName,
    validateInput: ValidateInput<Read>,
    handleRead: HandleRead<Read>,
  ): HandledDuplexStream<Read, Write> {
    if (this.#status !== MultiplexerStatus.Idle) {
      throw new Error('Channels must be added before starting the multiplexer');
    }
    if (this.#channels.has(channelName)) {
      throw new Error(`Channel "${channelName}" already exists.`);
    }

    const { stream, receiveInput } = this.#makeChannel<Read, Write>(
      channelName,
      validateInput,
      handleRead,
    );

    // We downcast some properties in order to store all records in one place.
    this.#channels.set(channelName, {
      channelName,
      stream: stream as unknown as HandledDuplexStream<Json, Json>,
      receiveInput,
    });

    return stream;
  }

  /**
   * Constructs a channel.
   *
   * @param channelName - The channel name.
   * @param validateInput - The input validator.
   * @param handleRead - The channel stream's drain handler.
   * @returns The channel stream and its receiveInput method.
   */
  #makeChannel<Read extends Json, Write extends Json>(
    channelName: ChannelName,
    validateInput: ValidateInput<Read>,
    handleRead: HandleRead<Read>,
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
      payload: Json,
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

    const end = async <Read extends Json, Write extends Json>(
      stream: DuplexStream<Read, Write>,
    ): Promise<unknown> =>
      error === undefined ? stream.return() : stream.throw(error);

    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([
      end(this.#stream),
      ...Array.from(this.#channels.values()).map(async (channel) =>
        end(channel.stream),
      ),
    ]).catch(() => undefined);
  }
}

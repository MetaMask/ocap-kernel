import type { Json } from '@metamask/utils';

import type {
  DuplexStream,
  SynchronizableDuplexStream,
} from './BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  ValidateInput,
  ReceiveInput,
} from './BaseStream.js';
import { BaseReader } from './BaseStream.js';
import { makeDoneResult } from './utils.js';

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

export type ChannelParameters<Read extends Json, Write extends Json> = {
  channelName: ChannelName;
  handleRead: HandleRead<Read>;
  validateInput: ValidateInput<Read>;
} & { _write: Write };

export const makeChannelParams = <Read extends Json, Write extends Json = Read>(
  channelName: ChannelName,
  handleRead: HandleRead<Read>,
  validateInput: ValidateInput<Read>,
): ChannelParameters<Read, Write> =>
  ({
    channelName,
    handleRead,
    validateInput,
  }) as ChannelParameters<Read, Write>;

type ChannelRecord<Read extends Json, Write extends Json = Read> = {
  channelName: ChannelName;
  stream: DuplexStream<Read, Write>;
  handleRead: HandleRead<Read>;
  receiveInput: ReceiveInput;
};

type MappedChannels<Channels extends readonly ChannelParameters<Json, Json>[]> =
  Readonly<{
    [K in keyof Channels]: DuplexStream<
      // We need to use `any` for the types to actually be inferred, and our
      // usage should ensure that we avoid polluting the outside world.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      Channels[K] extends ChannelParameters<infer Read, any> ? Read : never,
      Channels[K] extends ChannelParameters<any, infer Write> ? Write : never
      /* eslint-enable @typescript-eslint/no-explicit-any */
    >;
  }>;

export class StreamMultiplexer {
  #isDone: boolean;

  readonly #name: string;

  readonly #channels: Map<ChannelName, ChannelRecord<Json, Json>>;

  readonly #stream: SynchronizableDuplexStream<
    MultiplexEnvelope,
    MultiplexEnvelope
  >;

  constructor(
    stream: SynchronizableDuplexStream<MultiplexEnvelope, MultiplexEnvelope>,
    name?: string,
  ) {
    this.#isDone = false;
    this.#channels = new Map();
    this.#name = name ?? this.constructor.name;
    this.#stream = stream;
  }

  /**
   * Starts the multiplexer and drains all of its channels. Waits for the underlying
   * duplex stream to be synchronized before reading from it.
   *
   * @returns A promise resolves when the multiplexer and its channels have ended.
   */
  async drainAll(): Promise<void> {
    if (this.#channels.size === 0) {
      throw new Error(`${this.#name} has no channels`);
    }
    await this.#stream.synchronize();

    const promise = Promise.all([
      this.#drain(),
      ...Array.from(this.#channels.values()).map(
        async ({ stream, handleRead }) => stream.drain(handleRead),
      ),
    ]).then(async () => this.#end());

    // Set up cleanup and prevent unhandled rejections. The caller is still expected to
    // handle rejections.
    promise.catch(async (error) => this.#end(error));

    return promise;
  }

  async #drain(): Promise<void> {
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
   * Adds a set of channels. To avoid messages loss, the underlying duplex stream must not
   * be synchronized until all channels have been created.
   *
   * @param channels - The channels to add.
   * @returns The added channels.
   */
  // See MappedChannels for why we need to use `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addChannels<Channels extends ChannelParameters<any, any>[]>(
    ...channels: Channels
  ): MappedChannels<Channels> {
    if (this.#isDone) {
      throw new Error(`${this.#name} has already ended`);
    }

    return channels.map((params) =>
      this.#addChannel(params),
    ) as MappedChannels<Channels>;
  }

  #addChannel<Read extends Json, Write extends Json>({
    channelName,
    handleRead,
    validateInput,
  }: ChannelParameters<Read, Write>): DuplexStream<Read, Write> {
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
      handleRead: handleRead as HandleRead<Json>,
      stream: stream as unknown as DuplexStream<Json, Json>,
      receiveInput,
    });

    return stream;
  }

  #makeChannel<Read extends Json, Write extends Json>(
    channelName: ChannelName,
    validateInput: ValidateInput<Read>,
  ): {
    stream: DuplexStream<Read, Write>;
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

    const drain = async (handler: HandleRead<Read>): Promise<void> => {
      for await (const value of reader) {
        await handler(value);
      }
    };

    // Create and return the DuplexStream interface
    const stream: DuplexStream<Read, Write> = {
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

  async #end(error?: Error): Promise<void> {
    if (this.#isDone) {
      return;
    }
    this.#isDone = true;

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

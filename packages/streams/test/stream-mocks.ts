import {
  BaseDuplexStream,
  makeAck,
  makeDuplexStreamInputValidator,
} from '../src/BaseDuplexStream.js';
import type { DuplexStream } from '../src/BaseDuplexStream.js';
import type {
  Dispatch,
  ReceiveInput,
  BaseReaderArgs,
  ValidateInput,
  BaseWriterArgs,
} from '../src/BaseStream.js';
import { BaseReader, BaseWriter } from '../src/BaseStream.js';
import type { MultiplexEnvelope } from '../src/StreamMultiplexer.js';
import { StreamMultiplexer } from '../src/StreamMultiplexer.js';

export type { MultiplexEnvelope } from '../src/StreamMultiplexer.js';

export class TestReader<Read = number> extends BaseReader<Read> {
  readonly #receiveInput: ReceiveInput;

  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  constructor(args: BaseReaderArgs<Read> = {}) {
    super(args);
    this.#receiveInput = super.getReceiveInput();
  }

  getReceiveInput(): ReceiveInput {
    return super.getReceiveInput();
  }
}

export class TestWriter<Write = number> extends BaseWriter<Write> {
  readonly #onDispatch: Dispatch<Write>;

  get onDispatch(): Dispatch<Write> {
    return this.#onDispatch;
  }

  constructor(args: BaseWriterArgs<Write>) {
    super(args);
    this.#onDispatch = args.onDispatch;
  }
}

type TestDuplexStreamOptions<Read = number> = {
  validateInput?: ValidateInput<Read> | undefined;
  readerOnEnd?: () => void;
  writerOnEnd?: () => void;
};

export class TestDuplexStream<
  Read = number,
  Write = Read,
> extends BaseDuplexStream<Read, TestReader<Read>, Write, TestWriter<Write>> {
  readonly #onDispatch: Dispatch<Write>;

  readonly #receiveInput: ReceiveInput;

  get onDispatch(): Dispatch<Write> {
    return this.#onDispatch;
  }

  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  constructor(
    onDispatch: Dispatch<Write>,
    {
      validateInput,
      readerOnEnd,
      writerOnEnd,
    }: TestDuplexStreamOptions<Read> = {},
  ) {
    const reader = new TestReader<Read>({
      name: 'TestDuplexStream',
      onEnd: readerOnEnd,
      validateInput: makeDuplexStreamInputValidator(validateInput),
    });
    super(
      reader,
      new TestWriter<Write>({
        name: 'TestDuplexStream',
        onDispatch,
        onEnd: writerOnEnd,
      }),
    );
    this.#onDispatch = onDispatch;
    this.#receiveInput = reader.receiveInput;
  }

  async synchronize(): Promise<void> {
    return super.synchronize();
  }

  /**
   * Synchronize the stream by receiving an ack.
   *
   * @returns A promise that resolves when the stream is synchronized.
   */
  async completeSynchronization(): Promise<void> {
    const syncP = super.synchronize().catch(() => undefined);
    await this.receiveInput(makeAck());
    return syncP;
  }

  /**
   * Make a new TestDuplexStream and synchronize it.
   *
   * @param onDispatch - The dispatch function to use.
   * @param opts - The options to use.
   * @returns A synchronized TestDuplexStream.
   */
  static async make<Read = number, Write = Read>(
    onDispatch: Dispatch<Write>,
    opts: TestDuplexStreamOptions<Read> = {},
  ): Promise<TestDuplexStream<Read, Write>> {
    const stream = new TestDuplexStream<Read, Write>(onDispatch, opts);
    await stream.completeSynchronization();
    return stream;
  }
}

export class TestMultiplexer extends StreamMultiplexer {
  constructor(
    duplex: DuplexStream<MultiplexEnvelope> = new TestDuplexStream(
      () => undefined,
    ),
  ) {
    super(duplex);
  }

  static async make(
    duplex?: TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>,
  ): Promise<
    [TestMultiplexer, TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>]
  > {
    // We can't use the async factory for a parameter default
    // eslint-disable-next-line no-param-reassign
    duplex ??= await TestDuplexStream.make<
      MultiplexEnvelope,
      MultiplexEnvelope
    >(() => undefined);
    return [new TestMultiplexer(duplex), duplex] as const;
  }
}

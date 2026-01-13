import {
  BaseDuplexStream,
  makeAck,
  makeDuplexStreamInputValidator,
} from '../src/BaseDuplexStream.ts';
import type {
  Dispatch,
  ReceiveInput,
  BaseReaderArgs,
  ValidateInput,
  BaseWriterArgs,
} from '../src/BaseStream.ts';
import { BaseReader, BaseWriter } from '../src/BaseStream.ts';

/**
 * A test reader that exposes the receiveInput method for testing purposes.
 */
export class TestReader<Read = number> extends BaseReader<Read> {
  readonly #receiveInput: ReceiveInput;

  /**
   * Gets the receive input function for this reader.
   *
   * @returns The receive input function.
   */
  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  /**
   * Constructs a new {@link TestReader}.
   *
   * @param args - Options bag for configuring the reader.
   */
  constructor(args: BaseReaderArgs<Read> = {}) {
    super(args);
    this.#receiveInput = super.getReceiveInput();
  }

  /**
   * Gets the receive input function. Overrides the protected method for testing.
   *
   * @returns The receive input function.
   */
  getReceiveInput(): ReceiveInput {
    return super.getReceiveInput();
  }

  /**
   * Closes the underlying transport and returns.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Read, undefined>> {
    return super.return();
  }

  /**
   * Closes the stream with an error.
   *
   * @param error - The error to close the stream with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    return super.throw(error);
  }
}

/**
 * A test writer that exposes the onDispatch function for testing purposes.
 */
export class TestWriter<Write = number> extends BaseWriter<Write> {
  readonly #onDispatch: Dispatch<Write>;

  /**
   * Gets the dispatch function for this writer.
   *
   * @returns The dispatch function.
   */
  get onDispatch(): Dispatch<Write> {
    return this.#onDispatch;
  }

  /**
   * Constructs a new {@link TestWriter}.
   *
   * @param args - Options bag for configuring the writer.
   */
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

/**
 * A test duplex stream that exposes internal methods for testing purposes.
 */
export class TestDuplexStream<
  Read = number,
  Write = Read,
> extends BaseDuplexStream<Read, TestReader<Read>, Write, TestWriter<Write>> {
  readonly #onDispatch: Dispatch<Write>;

  readonly #receiveInput: ReceiveInput;

  /**
   * Gets the dispatch function for the underlying writer.
   *
   * @returns The dispatch function.
   */
  get onDispatch(): Dispatch<Write> {
    return this.#onDispatch;
  }

  /**
   * Gets the receive input function for the underlying reader.
   *
   * @returns The receive input function.
   */
  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  /**
   * Constructs a new {@link TestDuplexStream}.
   *
   * @param onDispatch - The dispatch function to use for writing.
   * @param options - Options bag for configuring the stream.
   * @param options.validateInput - A function that validates input from the transport.
   * @param options.readerOnEnd - A function that is called when the reader ends.
   * @param options.writerOnEnd - A function that is called when the writer ends.
   */
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

  /**
   * Synchronizes the stream with its remote counterpart.
   *
   * @returns A promise that resolves when the stream is synchronized.
   */
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

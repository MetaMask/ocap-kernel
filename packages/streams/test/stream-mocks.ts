import type { Json } from '@metamask/utils';

import { BaseDuplexStream, makeAck } from '../src/BaseDuplexStream.js';
import type {
  Dispatch,
  ReceiveInput,
  BaseReaderArgs,
  InputValidator,
} from '../src/BaseStream.js';
import { BaseReader, BaseWriter } from '../src/BaseStream.js';

export class TestReader<Read extends Json = number> extends BaseReader<Read> {
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

export class TestWriter<Write extends Json = number> extends BaseWriter<Write> {
  readonly #onDispatch: Dispatch<Write>;

  get onDispatch(): Dispatch<Write> {
    return this.#onDispatch;
  }

  constructor(onDispatch: Dispatch<Write>, onEnd?: () => void) {
    super('TestWriter', onDispatch, onEnd);
    this.#onDispatch = onDispatch;
  }
}

type TestDuplexStreamOptions<Read extends Json = number> = {
  inputValidator?: InputValidator<Read> | undefined;
  readerOnEnd?: () => void;
  writerOnEnd?: () => void;
};

export class TestDuplexStream<
  Read extends Json = number,
  Write extends Json = Read,
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
      inputValidator,
      readerOnEnd,
      writerOnEnd,
    }: TestDuplexStreamOptions<Read> = {},
  ) {
    const reader = new TestReader<Read>({ inputValidator, onEnd: readerOnEnd });
    super(reader, new TestWriter<Write>(onDispatch, writerOnEnd));
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
    this.receiveInput(makeAck());
    return syncP;
  }

  /**
   * Make a new TestDuplexStream and synchronize it.
   *
   * @param onDispatch - The dispatch function to use.
   * @param opts - The options to use.
   * @returns A synchronized TestDuplexStream.
   */
  static async make<Read extends Json = number, Write extends Json = Read>(
    onDispatch: Dispatch<Write>,
    opts: TestDuplexStreamOptions = {},
  ): Promise<TestDuplexStream<Read, Write>> {
    const stream = new TestDuplexStream<Read, Write>(onDispatch, opts);
    await stream.completeSynchronization();
    return stream;
  }
}

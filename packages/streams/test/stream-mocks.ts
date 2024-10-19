import { BaseDuplexStream, makeAck } from '../src/BaseDuplexStream.js';
import type { Dispatch, ReceiveInput } from '../src/BaseStream.js';
import { BaseReader, BaseWriter } from '../src/BaseStream.js';

export class TestReader extends BaseReader<number> {
  readonly #receiveInput: ReceiveInput;

  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  constructor(onEnd?: () => void) {
    super(onEnd);
    this.#receiveInput = super.getReceiveInput();
  }

  getReceiveInput(): ReceiveInput {
    return super.getReceiveInput();
  }
}

export class TestWriter extends BaseWriter<number> {
  readonly #onDispatch: Dispatch<number>;

  get onDispatch(): Dispatch<number> {
    return this.#onDispatch;
  }

  constructor(onDispatch: Dispatch<number>, onEnd?: () => void) {
    super('TestWriter', onDispatch, onEnd);
    this.#onDispatch = onDispatch;
  }
}

type TestDuplexStreamOptions = {
  readerOnEnd?: () => void;
  writerOnEnd?: () => void;
};

export class TestDuplexStream extends BaseDuplexStream<
  number,
  TestReader,
  number,
  TestWriter
> {
  readonly #onDispatch: Dispatch<number>;

  readonly #receiveInput: ReceiveInput;

  get onDispatch(): Dispatch<number> {
    return this.#onDispatch;
  }

  get receiveInput(): ReceiveInput {
    return this.#receiveInput;
  }

  constructor(
    onDispatch: Dispatch<number>,
    { readerOnEnd, writerOnEnd }: TestDuplexStreamOptions = {},
  ) {
    const reader = new TestReader(readerOnEnd);
    super(reader, new TestWriter(onDispatch, writerOnEnd));
    this.#onDispatch = onDispatch;
    this.#receiveInput = reader.receiveInput;
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
  static async make(
    onDispatch: Dispatch<number>,
    opts: TestDuplexStreamOptions = {},
  ): Promise<TestDuplexStream> {
    const stream = new TestDuplexStream(onDispatch, opts);
    await stream.completeSynchronization();
    return stream;
  }
}

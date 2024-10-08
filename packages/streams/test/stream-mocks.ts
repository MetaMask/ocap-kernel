import { BaseDuplexStream } from '../src/BaseDuplexStream.js';
import type { Dispatch, ReceiveInput } from '../src/BaseStream.js';
import { BaseReader, BaseWriter } from '../src/BaseStream.js';

export class TestReader extends BaseReader<number> {
  receiveInput: ReceiveInput;

  constructor(onEnd?: () => void) {
    super(onEnd);
    this.receiveInput = super.getReceiveInput();
  }

  getReceiveInput(): ReceiveInput {
    return super.getReceiveInput();
  }
}

export class TestWriter extends BaseWriter<number> {
  onDispatch: Dispatch<number>;

  constructor(onDispatch: Dispatch<number>, onEnd?: () => void) {
    super('TestWriter', onDispatch, onEnd);
    this.onDispatch = onDispatch;
  }
}

export class TestDuplexStream extends BaseDuplexStream<
  number,
  TestReader,
  number,
  TestWriter
> {
  onDispatch: Dispatch<number>;

  receiveInput: ReceiveInput;

  constructor(
    onDispatch: Dispatch<number>,
    {
      readerOnEnd,
      writerOnEnd,
    }: { readerOnEnd?: () => void; writerOnEnd?: () => void } = {},
  ) {
    const reader = new TestReader(readerOnEnd);
    super(reader, new TestWriter(onDispatch, writerOnEnd));
    this.onDispatch = onDispatch;
    this.receiveInput = reader.receiveInput;
  }
}

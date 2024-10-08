import type { Reader } from '@endo/stream';
import type { Json } from '@metamask/utils';

import type { BaseReader, BaseWriter } from './BaseStream.js';
import { makeDoneResult } from './utils.js';

/**
 * The base of a duplex stream. Essentially a {@link BaseReader} with a `write()` method.
 * Backed up by separate {@link BaseReader} and {@link BaseWriter} instances under the hood.
 */
export abstract class BaseDuplexStream<
  Read extends Json,
  ReadStream extends BaseReader<Read>,
  Write extends Json = Read,
  WriteStream extends BaseWriter<Write> = BaseWriter<Write>,
> implements Reader<Read>
{
  readonly #reader: ReadStream;

  readonly #writer: WriteStream;

  /**
   * Reads the next value from the stream.
   *
   * @returns The next value from the stream.
   */
  next: () => Promise<IteratorResult<Read, undefined>>;

  /**
   * Writes a value to the stream.
   *
   * @param value - The next value to write to the stream.
   * @returns The result of writing the value.
   */
  write: (value: Write) => Promise<IteratorResult<undefined, undefined>>;

  constructor(reader: ReadStream, writer: WriteStream) {
    this.#reader = reader;
    this.#writer = writer;
    this.next = this.#reader.next.bind(this.#reader);
    this.write = this.#writer.next.bind(this.#writer);
    harden(this);
  }

  [Symbol.asyncIterator](): typeof this {
    return this;
  }

  /**
   * Drains the stream by passing each value to a handler function.
   *
   * @param handler - The function that will receive each value from the stream.
   */
  async drain(handler: (value: Read) => void | Promise<void>): Promise<void> {
    for await (const value of this.#reader) {
      await handler(value);
    }
  }

  /**
   * Closes the stream. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Read, undefined>> {
    return Promise.all([this.#writer.return(), this.#reader.return()]).then(
      () => makeDoneResult(),
    );
  }

  /**
   * Writes the error to the stream, and closes the stream. Idempotent.
   *
   * @param error - The error to write.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    return Promise.all([this.#writer.throw(error), this.#reader.return()]).then(
      () => makeDoneResult(),
    );
  }
}
harden(BaseDuplexStream);

/**
 * A duplex stream. Essentially a {@link Reader} with a `write()` method.
 */
export type DuplexStream<
  Read extends Json,
  Write extends Json = Read,
> = BaseDuplexStream<Read, BaseReader<Read>, Write, BaseWriter<Write>>;

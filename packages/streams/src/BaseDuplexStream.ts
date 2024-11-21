import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import { is, literal, object } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { stringify } from '@ocap/utils';

import type { Reader, Writer, ValidateInput } from './BaseStream.js';
import { makeDoneResult } from './utils.js';

export enum DuplexStreamSentinel {
  Syn = '@@Syn',
  Ack = '@@Ack',
}

const SynStruct = object({
  [DuplexStreamSentinel.Syn]: literal(true),
});

type DuplexStreamSyn = Infer<typeof SynStruct>;

export const isSyn = (value: unknown): value is DuplexStreamSyn =>
  is(value, SynStruct);

export const makeSyn = (): DuplexStreamSyn => ({
  [DuplexStreamSentinel.Syn]: true,
});

const AckStruct = object({
  [DuplexStreamSentinel.Ack]: literal(true),
});

type DuplexStreamAck = Infer<typeof AckStruct>;

export const isAck = (value: unknown): value is DuplexStreamAck =>
  is(value, AckStruct);

export const makeAck = (): DuplexStreamAck => ({
  [DuplexStreamSentinel.Ack]: true,
});

type DuplexStreamSignal = DuplexStreamSyn | DuplexStreamAck;

const isDuplexStreamSignal = (value: unknown): value is DuplexStreamSignal =>
  isSyn(value) || isAck(value);

/**
 * Make a validator for input to a duplex stream. Constructor helper for concrete
 * duplex stream implementations.
 *
 * Validators passed in by consumers must be augmented such that errors aren't
 * thrown for {@link DuplexStreamSignal} values.
 *
 * @param validateInput - The validator for the stream's input type.
 * @returns A validator for the stream's input type, or `undefined` if no
 * validation is desired.
 */
export const makeDuplexStreamInputValidator = <Read>(
  validateInput?: ValidateInput<Read>,
): ((value: unknown) => value is Read) | undefined =>
  validateInput &&
  ((value: unknown): value is Read =>
    isDuplexStreamSignal(value) || validateInput(value));

enum SynchronizationStatus {
  Idle = 0,
  Pending = 1,
  Complete = 2,
  Failed = 3,
}

const isEnded = (status: SynchronizationStatus): boolean =>
  status === SynchronizationStatus.Complete ||
  status === SynchronizationStatus.Failed;

/**
 * The base of a duplex stream. Essentially a {@link Reader} with a `write()` method.
 * Backed up by separate {@link BaseReader} and {@link BaseWriter} instances under the hood.
 */
export abstract class BaseDuplexStream<Read, Write = Read>
  implements Reader<Read>
{
  /**
   * The underlying reader for the duplex stream.
   */
  protected readonly reader: Reader<Read>;

  /**
   * The underlying writer for the duplex stream.
   */
  protected readonly writer: Writer<Write>;

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

  constructor(reader: Reader<Read>, writer: Writer<Write>) {
    this.next = reader.next.bind(reader);
    this.write = writer.next.bind(writer);
    this.reader = reader;
    this.writer = writer;
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
    for await (const value of this.reader) {
      await handler(value);
    }
  }

  /**
   * Pipes the stream to another duplex stream.
   *
   * @param sink - The duplex stream to pipe to.
   */
  async pipe<Read2>(sink: DuplexStream<Read2, Read>): Promise<void> {
    await this.drain(async (value) => {
      await sink.write(value);
    });
  }

  /**
   * Closes the stream. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Read, undefined>> {
    await Promise.all([this.writer.return(), this.reader.return()]);
    return makeDoneResult();
  }

  /**
   * Closes the stream with an error. Idempotent.
   *
   * @param error - The error to close the stream with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([this.writer.throw(error), this.reader.throw(error)]);
    return makeDoneResult();
  }

  /**
   * Closes the stream. Syntactic sugar for `throw(error)` or `return()`. Idempotent.
   *
   * @param error - The error to close the stream with.
   * @returns The final result for this stream.
   */
  async end(error?: Error): Promise<IteratorResult<Read, undefined>> {
    return error ? this.throw(error) : this.return();
  }
}
harden(BaseDuplexStream);

/**
 * A duplex stream that synchronizes with its remote counterpart before allowing reads/writes.
 */
export class SynchronizableDuplexStream<
  Read,
  Write = Read,
> extends BaseDuplexStream<Read, Write> {
  /**
   * The promise for the synchronization of the stream with its remote
   * counterpart.
   */
  readonly #syncKit: PromiseKit<void>;

  /**
   * Whether the stream is synchronized with its remote counterpart.
   */
  #synchronizationStatus: SynchronizationStatus;

  constructor(reader: Reader<Read>, writer: Writer<Write>) {
    super(reader, writer);
    this.#synchronizationStatus = SynchronizationStatus.Idle;
    this.#syncKit = makePromiseKit<void>();
    // Set a catch handler to avoid unhandled rejection errors. The promise may
    // reject before reads or writes occur, in which case there are no handlers.
    this.#syncKit.promise.catch(() => undefined);

    // Override next and write to only work if synchronization completes
    this.next = async () =>
      this.#synchronizationStatus === SynchronizationStatus.Complete
        ? this.reader.next()
        : this.#syncKit.promise.then(async () => this.reader.next());

    this.write = async (value: Write) =>
      this.#synchronizationStatus === SynchronizationStatus.Complete
        ? this.writer.next(value)
        : this.#syncKit.promise.then(async () => this.writer.next(value));
  }

  /**
   * Synchronizes the duplex stream with its remote counterpart. Must be awaited
   * before values can be read from or written to the stream. Idempotent.
   *
   * @returns A promise that resolves when the stream is synchronized.
   */
  async synchronize(): Promise<void> {
    if (this.#synchronizationStatus !== SynchronizationStatus.Idle) {
      return this.#syncKit.promise;
    }

    try {
      await this.#performSynchronization();
    } catch (error) {
      this.#syncKit.reject(error);
    }

    return this.#syncKit.promise;
  }

  /**
   * Performs the synchronization protocol.
   *
   * **ATTN:** The synchronization protocol requires sending values that do not
   * conform to the read and write types of the stream. We do not currently have
   * the type system to express this, so we just override TypeScript and do it
   * anyway. This is far from ideal, but it works because (1) the streams do not
   * check the values they receive at runtime, and (2) the special values cannot
   * be observed by users of the stream. We will improve this situation in the
   * near future.
   */
  async #performSynchronization(): Promise<void> {
    this.#synchronizationStatus = SynchronizationStatus.Pending;
    let receivedSyn = false;

    // @ts-expect-error See docstring.
    await this.writer.next(makeSyn());

    while (this.#synchronizationStatus === SynchronizationStatus.Pending) {
      const result = await this.reader.next();
      if (isAck(result.value)) {
        this.#completeSynchronization();
      } else if (isSyn(result.value)) {
        if (receivedSyn) {
          this.#failSynchronization(
            new Error('Received duplicate SYN message during synchronization'),
          );
        } else {
          receivedSyn = true;
          // @ts-expect-error See docstring.
          await this.writer.next(makeAck());
        }
      } else {
        this.#failSynchronization(
          new Error(
            `Received unexpected message during synchronization: ${stringify(result)}`,
          ),
        );
        break;
      }
    }
  }

  #completeSynchronization(): void {
    if (isEnded(this.#synchronizationStatus)) {
      return;
    }

    this.#synchronizationStatus = SynchronizationStatus.Complete;
    this.#syncKit.resolve();
  }

  #failSynchronization(error: Error): void {
    if (isEnded(this.#synchronizationStatus)) {
      return;
    }

    this.#synchronizationStatus = SynchronizationStatus.Failed;
    this.#syncKit.reject(error);
  }

  override async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    this.#failSynchronization(error);
    return super.throw(error);
  }

  override async return(): Promise<IteratorResult<Read, undefined>> {
    this.#completeSynchronization();
    return super.return();
  }
}
harden(SynchronizableDuplexStream);

/**
 * A duplex stream. Essentially a {@link Reader} with a `write()` method.
 */
export type DuplexStream<Read, Write = Read> = Pick<
  BaseDuplexStream<Read, Write>,
  'next' | 'write' | 'drain' | 'pipe' | 'return' | 'throw' | 'end'
> & {
  [Symbol.asyncIterator]: () => DuplexStream<Read, Write>;
};

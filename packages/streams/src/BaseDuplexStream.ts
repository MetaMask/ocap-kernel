import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import type { Reader } from '@endo/stream';
import { is, literal, object } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { stringify } from '@ocap/utils';

import type { BaseReader, BaseWriter, ValidateInput } from './BaseStream.js';
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
 * The base of a duplex stream. Essentially a {@link BaseReader} with a `write()` method.
 * Backed up by separate {@link BaseReader} and {@link BaseWriter} instances under the hood.
 */
export abstract class BaseDuplexStream<
  Read,
  ReadStream extends BaseReader<Read>,
  Write = Read,
  WriteStream extends BaseWriter<Write> = BaseWriter<Write>,
> implements Reader<Read>
{
  /**
   * The underlying reader for the duplex stream.
   */
  readonly #reader: ReadStream;

  /**
   * The underlying writer for the duplex stream.
   */
  readonly #writer: WriteStream;

  /**
   * The promise for the synchronization of the stream with its remote
   * counterpart.
   */
  readonly #syncKit: PromiseKit<void>;

  /**
   * Whether the stream is synchronized with its remote counterpart.
   */
  #synchronizationStatus: SynchronizationStatus;

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
    this.#synchronizationStatus = SynchronizationStatus.Idle;
    this.#syncKit = makePromiseKit<void>();
    // Set a catch handler to avoid unhandled rejection errors. The promise may
    // reject before reads or writes occur, in which case there are no handlers.
    this.#syncKit.promise.catch(() => undefined);

    // Next and write only work if synchronization completes.
    this.next = async () =>
      this.#synchronizationStatus === SynchronizationStatus.Complete
        ? reader.next()
        : this.#syncKit.promise.then(async () => reader.next());

    this.write = async (value: Write) =>
      this.#synchronizationStatus === SynchronizationStatus.Complete
        ? writer.next(value)
        : this.#syncKit.promise.then(async () => writer.next(value));

    this.#reader = reader;
    this.#writer = writer;

    harden(this);
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
    await this.#writer.next(makeSyn());

    while (this.#synchronizationStatus === SynchronizationStatus.Pending) {
      const result = await this.#reader.next();
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
          await this.#writer.next(makeAck());
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
    this.#completeSynchronization();
    await Promise.all([this.#writer.return(), this.#reader.return()]);
    return makeDoneResult();
  }

  /**
   * Closes the stream with an error. Idempotent.
   *
   * @param error - The error to close the stream with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    this.#failSynchronization(error);
    // eslint-disable-next-line promise/no-promise-in-callback
    await Promise.all([this.#writer.throw(error), this.#reader.throw(error)]);
    return makeDoneResult();
  }
}
harden(BaseDuplexStream);

/**
 * A duplex stream. Essentially a {@link Reader} with a `write()` method.
 */
export type DuplexStream<Read, Write = Read> = Pick<
  BaseDuplexStream<Read, BaseReader<Read>, Write, BaseWriter<Write>>,
  'next' | 'write' | 'drain' | 'return' | 'throw'
> & {
  [Symbol.asyncIterator]: () => DuplexStream<Read, Write>;
};

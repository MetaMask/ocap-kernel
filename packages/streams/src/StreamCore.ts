import { makePromiseKit } from '@endo/promise-kit';

import type { PromiseCallbacks } from './shared.js';
import { isIteratorResult, makeDoneResult } from './shared.js';

/**
 * The core of a readable stream. Intended for use as a private instance field of a readable
 * async iterator stream.
 */
export class ReaderCore<Yield> {
  #isDone: boolean;

  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  readonly #inputBuffer: IteratorResult<unknown, unknown>[];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  readonly #outputBuffer: PromiseCallbacks[];

  /**
   * A function that is called when the stream ends.
   */
  readonly #onEnd: (() => void) | undefined;

  /**
   * Constructs a {@link ReaderCore}.
   *
   * @param onEnd - A function that is called when the stream ends. For any cleanup that
   * should happen when the stream ends, such as closing a message port.
   */
  constructor(onEnd?: () => void) {
    this.#inputBuffer = [];
    this.#isDone = false;
    this.#onEnd = onEnd;
    this.#outputBuffer = [];
    harden(this);
  }

  receiveInput(input: IteratorResult<Yield, undefined>): void {
    if (!isIteratorResult(input)) {
      this.#throw(
        new Error(
          `Received unexpected message via message port:\n${JSON.stringify(
            input,
            null,
            2,
          )}`,
        ),
      );
      return;
    }

    if (input.done === true) {
      this.#return();
      return;
    }

    if (this.#outputBuffer.length > 0) {
      const { resolve } = this.#outputBuffer.shift() as PromiseCallbacks;
      resolve({ ...input });
    } else {
      this.#inputBuffer.push(input);
    }
  }

  /**
   * Reads the next message from the port.
   *
   * @returns The next message from the port.
   */
  async next(): Promise<IteratorResult<Yield, undefined>> {
    if (this.#isDone) {
      return makeDoneResult();
    }

    const { promise, resolve, reject } = makePromiseKit();
    if (this.#inputBuffer.length > 0) {
      const message = this.#inputBuffer.shift() as IteratorResult<
        unknown,
        unknown
      >;
      resolve({ ...message });
    } else {
      this.#outputBuffer.push({ resolve, reject });
    }
    return promise as Promise<IteratorResult<Yield, undefined>>;
  }

  /**
   * Closes the underlying port and returns. Any unread messages will be lost.
   *
   * @returns The final result for this stream.
   */
  return(): IteratorResult<Yield, undefined> {
    if (!this.#isDone) {
      this.#return();
    }
    return makeDoneResult();
  }

  #return(): void {
    while (this.#outputBuffer.length > 0) {
      const { resolve } = this.#outputBuffer.shift() as PromiseCallbacks;
      resolve(makeDoneResult());
    }
    this.#end();
  }

  /**
   * Rejects all pending reads with the specified error, closes the underlying port,
   * and returns.
   *
   * @param error - The error to reject pending reads with.
   * @returns The final result for this stream.
   */
  throw(error: Error): IteratorResult<Yield, undefined> {
    if (!this.#isDone) {
      this.#throw(error);
    }
    return makeDoneResult();
  }

  #throw(error: Error): void {
    while (this.#outputBuffer.length > 0) {
      const { reject } = this.#outputBuffer.shift() as PromiseCallbacks;
      reject(error);
    }
    this.#end();
  }

  #end(): void {
    this.#isDone = true;
    // Drop all pending messages by clearing the input buffer
    this.#inputBuffer.length = 0;
    this.#onEnd?.();
  }
}
harden(ReaderCore);

type Dispatch<Yield> = (
  value: IteratorResult<Yield, undefined> | Error,
) => void | Promise<void>;

/**
 * The core of a writable stream. Intended for use as a private instance field of a
 * writable async iterator stream.
 */
export class WriterCore<Yield> {
  #isDone: boolean;

  /**
   * The name of the stream, for logging purposes.
   */
  readonly #logName: string;

  /**
   * A function that is called when the stream ends. For any cleanup that should happen
   * when the stream ends, such as closing a message port.
   */
  readonly #onEnd: (() => void) | undefined;

  /**
   * A function that dispatches messages over the underlying transport mechanism.
   */
  readonly #onDispatch: Dispatch<Yield>;

  /**
   * Constructs a {@link WriterCore}.
   *
   * @param logName - The name of the stream, for logging purposes.
   * @param dispatch - A function that dispatches messages over the underlying transport mechanism.
   * @param onEnd - A function that is called when the stream ends. For any cleanup that
   * should happen when the stream ends, such as closing a message port.
   */
  constructor(logName: string, dispatch: Dispatch<Yield>, onEnd?: () => void) {
    this.#isDone = false;
    this.#logName = logName;
    this.#onEnd = onEnd;
    this.#onDispatch = dispatch;

    harden(this);
  }

  /**
   * Writes the next message to the port.
   *
   * @param value - The next message to write to the port.
   * @returns The result of writing the message.
   */
  async next(value: Yield): Promise<IteratorResult<undefined, undefined>> {
    if (this.#isDone) {
      return makeDoneResult();
    }
    return this.#dispatch({ done: false, value });
  }

  /**
   * Closes the underlying port and returns. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    if (!this.#isDone) {
      await this.#onDispatch(makeDoneResult());
      this.#end();
    }
    return makeDoneResult();
  }

  /**
   * Forwards the error to the port and closes this stream. Idempotent.
   *
   * @param error - The error to forward to the port.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<undefined, undefined>> {
    if (!this.#isDone) {
      await this.#throw(error);
    }
    return makeDoneResult();
  }

  /**
   * Dispatches the error and calls `#end()`. Mutually recursive with `dispatch()`.
   * For this reason, includes a flag indicating past failure, so that `dispatch()`
   * can avoid infinite recursion. See `dispatch()` for more details.
   *
   * @param error - The error to forward.
   * @param hasFailed - Whether dispatching has failed previously.
   * @returns The final result for this stream.
   */
  async #throw(
    error: Error,
    hasFailed = false,
  ): Promise<IteratorResult<undefined, undefined>> {
    const result = this.#dispatch(error, hasFailed);
    if (!this.#isDone) {
      this.#end();
    }
    return result;
  }

  /**
   * Dispatches the value, via the dispatch function registered in the constructor.
   * If dispatching fails, calls `#throw()`, and is therefore mutually recursive with
   * that method. For this reason, includes a flag indicating past failure to dispatch
   * a value, which is used to avoid infinite recursion. If dispatching succeeds, returns a
   * `{ done: true }` result if the value was an {@link Error} or itself a "done" result,
   * otherwise returns `{ done: false }`.
   *
   * @param value - The value to dispatch.
   * @param hasFailed - Whether dispatching has failed previously.
   * @returns The result of dispatching the value.
   */
  async #dispatch(
    value: IteratorResult<Yield, undefined> | Error,
    hasFailed = false,
  ): Promise<IteratorResult<undefined, undefined>> {
    try {
      await this.#onDispatch(value);
      return value instanceof Error || value.done === true
        ? makeDoneResult()
        : { done: false, value: undefined };
    } catch (error) {
      console.error(`${this.#logName} experienced a dispatch failure:`, error);

      if (hasFailed) {
        // Break out of repeated failure to dispatch an error. It is unclear how this would occur
        // in practice, but it's the kind of failure mode where it's better to be sure.
        const repeatedFailureError = new Error(
          'MessagePortWriter experienced repeated dispatch failures.',
          { cause: error },
        );
        // TODO: Error handling
        await this.#onDispatch(repeatedFailureError);
        throw repeatedFailureError;
      } else {
        // TODO: Error handling
        await this.#throw(error as Error, true);
      }
      return makeDoneResult();
    }
  }

  #end(): void {
    this.#isDone = true;
    this.#onEnd?.();
  }
}
harden(WriterCore);

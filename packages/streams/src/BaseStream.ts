import { makePromiseKit } from '@endo/promise-kit';
import type { Reader as EndoReader, Writer as EndoWriter } from '@endo/stream';
import { type Json } from '@metamask/utils';
import { stringify } from '@ocap/utils';

import type { Dispatchable, PromiseCallbacks, Writable } from './utils.js';
import {
  assertIsWritable,
  isDispatchable,
  makeDoneResult,
  makePendingResult,
  marshal,
  unmarshal,
} from './utils.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeStreamBuffer = <Value extends IteratorResult<Json, undefined>>() => {
  const inputBuffer: (Value | Error)[] = [];
  const outputBuffer: PromiseCallbacks[] = [];
  let done = false;

  const end = (error?: Error): void => {
    if (done) {
      return;
    }

    done = true;
    if (outputBuffer.length > 0) {
      while (outputBuffer.length > 0) {
        const { resolve, reject } = outputBuffer.shift() as PromiseCallbacks;
        error ? reject(error) : resolve(makeDoneResult() as Value);
      }
    }
  };

  return {
    /**
     * Flushes pending reads with a value or error, and causes subsequent writes to be ignored.
     * Subsequent reads will exhaust any puts, then return the error (if any), and finally a `done` result.
     * Idempotent.
     *
     * @param error - The error to end the stream with. A `done` result is used if not provided.
     */
    end,

    hasPendingReads() {
      return outputBuffer.length > 0;
    },

    /**
     * Puts a value or error into the buffer.
     *
     * @see `end()` for behavior when the stream ends.
     * @param value - The value or error to put.
     */
    put(value: Value | Error) {
      if (done) {
        return;
      }

      if (outputBuffer.length > 0) {
        const { resolve } = outputBuffer.shift() as PromiseCallbacks;
        resolve(value);
        return;
      }
      inputBuffer.push(value);
    },

    async get() {
      if (inputBuffer.length > 0) {
        const value = inputBuffer.shift() as Value;
        return value instanceof Error
          ? Promise.reject(value)
          : Promise.resolve(value);
      }

      if (done) {
        return makeDoneResult() as Value;
      }

      const { promise, resolve, reject } = makePromiseKit<Value>();
      outputBuffer.push({
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      return promise;
    },
  };
};
harden(makeStreamBuffer);

/**
 * A function that is called when a stream ends. Useful for cleanup, such as closing a
 * message port.
 */
export type OnEnd = () => void | Promise<void>;

/**
 * A function that receives input from a transport mechanism to a readable stream.
 * Validates that the input is an {@link IteratorResult}, and throws if it is not.
 */
export type ReceiveInput = (input: unknown) => void;

/**
 * The base of a readable async iterator stream.
 *
 * Subclasses must forward input received from the transport mechanism via the function
 * returned by `getReceiveInput()`. Any cleanup required by subclasses should be performed
 * in a callback passed to `setOnEnd()`.
 *
 * The result of any value received before the stream ends is guaranteed to be observable
 * by the consumer.
 */
export class BaseReader<Read extends Json> implements EndoReader<Read> {
  /**
   * A buffer for managing backpressure (writes > reads) and "suction" (reads > writes) for a stream.
   * Modeled on `AsyncQueue` from `@endo/stream`, but with arrays under the hood instead of a promise chain.
   */
  readonly #buffer = makeStreamBuffer<IteratorResult<Read, undefined>>();

  #onEnd?: OnEnd | undefined;

  #didExposeReceiveInput: boolean = false;

  /**
   * Constructs a {@link BaseReader}.
   *
   * @param onEnd - A function that is called when the stream ends. For any cleanup that
   * should happen when the stream ends, such as closing a message port.
   */
  constructor(onEnd?: () => void) {
    this.#onEnd = onEnd;
    harden(this);
  }

  /**
   * Returns the `receiveInput()` method, which is used to receive input from the stream.
   * Attempting to call this method more than once will throw an error.
   *
   * @returns The `receiveInput()` method.
   */
  protected getReceiveInput(): ReceiveInput {
    if (this.#didExposeReceiveInput) {
      throw new Error('receiveInput has already been accessed');
    }
    this.#didExposeReceiveInput = true;
    return this.#receiveInput.bind(this);
  }

  readonly #receiveInput: ReceiveInput = async (input) => {
    if (!isDispatchable(input)) {
      const error = new Error(
        `Received invalid message from transport:\n${stringify(input)}`,
      );
      if (!this.#buffer.hasPendingReads()) {
        this.#buffer.put(error);
      }
      await this.#end(error);
      return;
    }

    const unmarshaled = unmarshal(input);
    if (unmarshaled instanceof Error) {
      if (!this.#buffer.hasPendingReads()) {
        this.#buffer.put(unmarshaled);
      }
      await this.#end(unmarshaled);
      return;
    }

    if (unmarshaled.done === true) {
      await this.#end();
      return;
    }

    this.#buffer.put(unmarshaled as IteratorResult<Read, undefined>);
  };

  /**
   * Ends the stream. Calls and then unsets the `#onEnd` method.
   * Idempotent.
   *
   * @param error - The error to end the stream with. A `done` result is used if not provided.
   */
  async #end(error?: Error): Promise<void> {
    this.#buffer.end(error);
    await this.#onEnd?.();
    this.#onEnd = undefined;
  }

  [Symbol.asyncIterator](): typeof this {
    return this;
  }

  /**
   * Reads the next message from the transport.
   *
   * @returns The next message from the transport.
   */
  async next(): Promise<IteratorResult<Read, undefined>> {
    return this.#buffer.get();
  }

  /**
   * Closes the underlying transport and returns. Any unread messages will be lost.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Read, undefined>> {
    await this.#end();
    return makeDoneResult();
  }

  /**
   * Rejects all pending reads with the specified error, closes the underlying transport,
   * and returns.
   *
   * @param error - The error to reject pending reads with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Read, undefined>> {
    await this.#end(error);
    return makeDoneResult();
  }
}
harden(BaseReader);

export type Dispatch<Yield extends Json> = (
  value: Dispatchable<Yield>,
) => void | Promise<void>;

/**
 * The base of a writable async iterator stream.
 */
export class BaseWriter<Write extends Json> implements EndoWriter<Write> {
  #isDone: boolean = false;

  readonly #logName: string = 'BaseWriter';

  readonly #onDispatch: Dispatch<Write>;

  #onEnd: OnEnd | undefined;

  /**
   * Constructs a {@link BaseWriter}.
   *
   * @param logName - The name of the stream, for logging purposes.
   * @param onDispatch - A function that dispatches messages over the underlying transport mechanism.
   * @param onEnd - A function that is called when the stream ends. For any cleanup that
   * should happen when the stream ends, such as closing a message port.
   */
  constructor(
    logName: string,
    onDispatch: Dispatch<Write>,
    onEnd?: () => void,
  ) {
    this.#logName = logName;
    this.#onDispatch = onDispatch;
    this.#onEnd = onEnd;
    harden(this);
  }

  /**
   * Dispatches the value, via the dispatch function registered in the constructor.
   * If dispatching fails, calls `#throw()`, and is therefore mutually recursive with
   * that method. For this reason, includes a flag indicating past failure to dispatch
   * a value, which is used to avoid infinite recursion. If dispatching succeeds, returns a
   * `{ done: true }` result if the value was an {@link Error} or itself a `done` result,
   * otherwise returns `{ done: false }`.
   *
   * @param value - The value to dispatch.
   * @param hasFailed - Whether dispatching has failed previously.
   * @returns The result of dispatching the value.
   */
  async #dispatch(
    value: Writable<Write>,
    hasFailed = false,
  ): Promise<IteratorResult<undefined, undefined>> {
    assertIsWritable(value);
    try {
      await this.#onDispatch(marshal(value));
      return value instanceof Error || value.done === true
        ? makeDoneResult()
        : makePendingResult(undefined);
    } catch (error) {
      console.error(`${this.#logName} experienced a dispatch failure:`, error);

      if (hasFailed) {
        // Break out of repeated failure to dispatch an error. It is unclear how this would occur
        // in practice, but it's the kind of failure mode where it's better to be sure.
        const repeatedFailureError = new Error(
          `${this.#logName} experienced repeated dispatch failures.`,
          { cause: error },
        );
        await this.#onDispatch(marshal(repeatedFailureError));
        throw repeatedFailureError;
      } else {
        await this.#throw(
          /* v8 ignore next: The ternary is mostly to please TypeScript */
          error instanceof Error ? error : new Error(String(error)),
          true,
        );
      }
      return makeDoneResult();
    }
  }

  async #end(): Promise<void> {
    this.#isDone = true;
    await this.#onEnd?.();
    this.#onEnd = undefined;
  }

  [Symbol.asyncIterator](): typeof this {
    return this;
  }

  /**
   * Writes the next message to the transport.
   *
   * @param value - The next message to write to the transport.
   * @returns The result of writing the message.
   */
  async next(value: Write): Promise<IteratorResult<undefined, undefined>> {
    if (this.#isDone) {
      return makeDoneResult();
    }
    return this.#dispatch(makePendingResult(value));
  }

  /**
   * Closes the underlying transport and returns. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    if (!this.#isDone) {
      await this.#onDispatch(makeDoneResult());
      await this.#end();
    }
    return makeDoneResult();
  }

  /**
   * Forwards the error to the transport and closes this stream. Idempotent.
   *
   * @param error - The error to forward to the transport.
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
      await this.#end();
    }
    return result;
  }
}
harden(BaseWriter);

/**
 * The base of a duplex async iterator stream. Does not implement the async iterator
 * protocol, since iterating over a duplex stream with a single `next()` method is
 * difficult to reason about.
 */
export abstract class BaseDuplexStream<
  Read extends Json,
  Reader extends BaseReader<Read>,
  Write extends Json = Read,
  Writer extends BaseWriter<Write> = BaseWriter<Write>,
> {
  readonly reader: Reader;

  readonly writer: Writer;

  constructor(reader: Reader, writer: Writer) {
    this.reader = reader;
    this.writer = writer;
    harden(this);
  }

  /**
   * Reads the next value from the stream.
   *
   * @returns The next value from the stream.
   */
  async read(): Promise<IteratorResult<Read, undefined>> {
    return this.reader.next();
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
   * Writes a value to the stream.
   *
   * @param value - The next value to write to the stream.
   * @returns The result of writing the value.
   */
  async write(value: Write): Promise<IteratorResult<undefined, undefined>> {
    return this.writer.next(value);
  }

  /**
   * Closes the stream. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    return Promise.all([this.writer.return(), this.reader.return()]).then(() =>
      makeDoneResult(),
    );
  }

  /**
   * Writes the error to the stream, and closes the stream. Idempotent.
   *
   * @param error - The error to write.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<undefined, undefined>> {
    return Promise.all([this.writer.throw(error), this.reader.return()]).then(
      () => makeDoneResult(),
    );
  }
}
harden(BaseDuplexStream);

export type DuplexStream<
  Read extends Json,
  Write extends Json = Read,
> = BaseDuplexStream<Read, BaseReader<Read>, Write, BaseWriter<Write>>;

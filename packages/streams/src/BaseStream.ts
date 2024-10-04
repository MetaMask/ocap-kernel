import { makePromiseKit } from '@endo/promise-kit';
import type { Reader, Writer } from '@endo/stream';
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

/**
 * A buffer for managing backpressure (writes > reads) and "suction" (reads > writes) for a stream.
 * Modeled on `AsyncQueue` from `@endo/stream`, but with arrays under the hood instead of a promise chain.
 */
type StreamBuffer<Value extends IteratorResult<Json, undefined>> = {
  /**
   * Flushes pending reads with a value or error, and causes subsequent writes to be ignored.
   * Subsequent reads will exhaust any puts, then return the error (if any), and finally a `done` result.
   * Idempotent.
   *
   * @param error - The error to end the stream with. A `done` result is used if not provided.
   */
  end: (error?: Error) => void;

  /**
   * Checks if there are pending reads.
   *
   * @returns Whether there are pending reads.
   */
  hasPendingReads: () => boolean;

  /**
   * Puts a value or error into the buffer.
   *
   * @see `end()` for behavior when the stream ends.
   * @param value - The value or error to put.
   */
  put: (value: Value | Error) => void;

  /**
   * Gets a value from the buffer.
   *
   * @see `end()` for behavior when the stream ends.
   * @returns The value from the buffer.
   */
  get: () => Promise<Value>;
};

const makeStreamBuffer = <
  Value extends IteratorResult<Json, undefined>,
>(): StreamBuffer<Value> => {
  const inputBuffer: (Value | Error)[] = [];
  const outputBuffer: PromiseCallbacks[] = [];
  let done = false;

  return {
    end: (error?: Error): void => {
      if (done) {
        return;
      }

      done = true;
      for (const { resolve, reject } of outputBuffer) {
        error ? reject(error) : resolve(makeDoneResult() as Value);
      }
      outputBuffer.length = 0;
    },

    hasPendingReads() {
      return outputBuffer.length > 0;
    },

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
export class BaseReader<Read extends Json> implements Reader<Read> {
  readonly #buffer: StreamBuffer<IteratorResult<Read, undefined>> =
    makeStreamBuffer();

  #onEnd?: (() => void) | undefined;

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

  readonly #receiveInput: ReceiveInput = (input) => {
    if (!isDispatchable(input)) {
      const error = new Error(
        `Received invalid message from transport:\n${stringify(input)}`,
      );
      if (!this.#buffer.hasPendingReads()) {
        this.#buffer.put(error);
      }
      this.#end(error);
      return;
    }

    const unmarshaled = unmarshal(input);
    if (unmarshaled instanceof Error) {
      if (!this.#buffer.hasPendingReads()) {
        this.#buffer.put(unmarshaled);
      }
      this.#end(unmarshaled);
      return;
    }

    if (unmarshaled.done === true) {
      this.#end();
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
  #end(error?: Error): void {
    this.#buffer.end(error);
    this.#onEnd?.();
    this.#onEnd = undefined;
  }

  [Symbol.asyncIterator](): Reader<Read> {
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
    this.#end();
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
    this.#end(error);
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
export class BaseWriter<Write extends Json> implements Writer<Write> {
  #isDone: boolean = false;

  /**
   * The name of the stream, for logging purposes.
   */
  readonly #logName: string = 'BaseWriter';

  /**
   * A function that is called when the stream ends. For any cleanup that should happen
   * when the stream ends, such as closing a message port.
   */
  #onEnd: (() => void) | undefined;

  #didSetOnEnd: boolean = false;

  /**
   * A function that dispatches messages over the underlying transport mechanism.
   */
  #onDispatch: Dispatch<Write> = () => {
    throw new Error('onDispatch has not been set');
  };

  #didSetOnDispatch: boolean = false;

  /**
   * Constructs a {@link BaseWriter}.
   *
   * @param logName - The name of the stream, for logging purposes.
   */
  constructor(logName: string) {
    this.#logName = logName;
    harden(this);
  }

  /**
   * Sets the `onDispatch` method, which is called when a message is received from the
   * transport mechanism. Attempting to call this method more than once will throw an error.
   *
   * @param onDispatch - A function that dispatches messages over the underlying transport mechanism.
   */
  protected setOnDispatch(onDispatch: Dispatch<Write>): void {
    if (this.#didSetOnDispatch) {
      throw new Error('onDispatch has already been set');
    }
    this.#didSetOnDispatch = true;
    this.#onDispatch = onDispatch;
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

  /**
   * Sets the `onEnd` method, which is called when the stream ends. Attempting to call
   * this method more than once will throw an error.
   *
   * @param onEnd - A function that is called when the stream ends. For any cleanup that
   * should happen when the stream ends, such as closing a message port.
   */
  protected setOnEnd(onEnd: () => void): void {
    if (this.#didSetOnEnd) {
      throw new Error('onEnd has already been set');
    }
    this.#didSetOnEnd = true;
    this.#onEnd = onEnd;
  }

  #end(): void {
    this.#isDone = true;
    this.#onEnd?.();
  }

  [Symbol.asyncIterator](): Writer<Write> {
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
      this.#end();
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
      this.#end();
    }
    return result;
  }
}
harden(BaseWriter);

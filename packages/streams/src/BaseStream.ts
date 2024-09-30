import { makePromiseKit } from '@endo/promise-kit';
import type { Reader, Writer } from '@endo/stream';

import type { PromiseCallbacks } from './shared.js';
import { isIteratorResult, makeDoneResult } from './shared.js';

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
 */
export class BaseReader<Yield> implements Reader<Yield> {
  #isDone: boolean = false;

  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  readonly #inputBuffer: IteratorResult<unknown, unknown>[] = [];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  readonly #outputBuffer: PromiseCallbacks[] = [];

  #didSetOnEnd: boolean = false;

  /**
   * A function that is called when the stream ends.
   */
  #onEnd: (() => void) | undefined;

  #didExposeReceiveInput: boolean = false;

  /**
   * Constructs a {@link BaseReader}.
   */
  constructor() {
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
    if (!isIteratorResult(input)) {
      this.#throw(
        new Error(
          `Received unexpected message from transport:\n${JSON.stringify(
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
  };

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
    // Drop all pending messages by clearing the input buffer
    this.#inputBuffer.length = 0;
    this.#onEnd?.();
  }

  [Symbol.asyncIterator](): Reader<Yield> {
    return this;
  }

  /**
   * Reads the next message from the transport.
   *
   * @returns The next message from the transport.
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
   * Closes the underlying transport and returns. Any unread messages will be lost.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Yield, undefined>> {
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
   * Rejects all pending reads with the specified error, closes the underlying transport,
   * and returns.
   *
   * @param error - The error to reject pending reads with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Yield, undefined>> {
    return this.throwSync(error);
  }

  /**
   * As {@link throw()}, but synchronous. For the purpose of avoiding Promise handling
   * in subclasses.
   *
   * @param error - The error to reject pending reads with.
   * @returns The final result for this stream.
   */
  protected throwSync(error: Error): IteratorResult<Yield, undefined> {
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
}
harden(BaseReader);

export type Dispatch<Yield> = (
  value: IteratorResult<Yield, undefined> | Error,
) => void | Promise<void>;

/**
 * The base of a writable async iterator stream.
 */
export class BaseWriter<Yield> implements Writer<Yield> {
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
  #onDispatch: Dispatch<Yield> = () => {
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
  protected setOnDispatch(onDispatch: Dispatch<Yield>): void {
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
          `${this.#logName} experienced repeated dispatch failures.`,
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

  [Symbol.asyncIterator](): Writer<Yield> {
    return this;
  }

  /**
   * Writes the next message to the transport.
   *
   * @param value - The next message to write to the transport.
   * @returns The result of writing the message.
   */
  async next(value: Yield): Promise<IteratorResult<undefined, undefined>> {
    if (this.#isDone) {
      return makeDoneResult();
    }
    return this.#dispatch({ done: false, value });
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

import { makePromiseKit } from '@endo/promise-kit';
import type { Reader, Writer } from '@endo/stream';

type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const makeDoneResult = () =>
  ({ done: true, value: undefined } as { done: true; value: undefined });

/**
 * A readable stream over a {@link MessagePort}.
 */
export class MessagePortReader<Yield> implements Reader<Yield> {
  #port: MessagePort;

  /**
   * For buffering messages to manage backpressure.
   */
  #messageQueue: MessageEvent[];

  /**
   * For buffering reads to manage drain.
   */
  #readQueue: PromiseCallbacks[];

  constructor(port: MessagePort) {
    this.#port = port;
    this.#messageQueue = [];
    this.#readQueue = [];

    // Assigning to the `onmessage` property initializes the port's message queue.
    this.#port.onmessage = this.#handleMessage.bind(this);
    harden(this);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  #handleMessage(message: MessageEvent): void {
    if (this.#readQueue.length > 0) {
      const { resolve } = this.#readQueue.shift() as PromiseCallbacks;
      resolve({ done: false, value: message.data });
    } else {
      this.#messageQueue.push(message);
    }
  }

  /**
   * Reads the next message from the port.
   * @returns The next message from the port.
   */
  async next(): Promise<IteratorResult<Yield, undefined>> {
    const { promise, resolve, reject } = makePromiseKit();
    if (this.#messageQueue.length > 0) {
      const message = this.#messageQueue.shift() as MessageEvent;
      resolve({ done: false, value: message.data });
    } else {
      this.#readQueue.push({ resolve, reject });
    }
    return promise as Promise<IteratorResult<Yield, undefined>>;
  }

  /**
   * Closes the underlying port and returns.
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Yield, undefined>> {
    while (this.#readQueue.length > 0) {
      const { resolve } = this.#readQueue.shift() as PromiseCallbacks;
      resolve(makeDoneResult());
    }
    return this.#end();
  }

  /**
   * Rejects all pending reads from this stream with the specified error, closes
   * the underlying port, and returns.
   * @param error - The error to throw.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Yield, undefined>> {
    while (this.#readQueue.length > 0) {
      const { reject } = this.#readQueue.shift() as PromiseCallbacks;
      reject(error);
    }
    return this.#end();
  }

  #end(): IteratorResult<Yield, undefined> {
    this.#port.close();
    this.#port.onmessage = null;
    return makeDoneResult();
  }
}
harden(MessagePortReader);

/**
 * A writable stream over a {@link MessagePort}.
 */
export class MessagePortWriter<Yield> implements Writer<Yield> {
  #port: MessagePort;

  constructor(port: MessagePort) {
    this.#port = port;
    harden(this);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  /**
   * Writes the next message to the port.
   * @param value - The next message to write to the port.
   * @returns The result of writing the message.
   */
  async next(value: Yield): Promise<IteratorResult<undefined, undefined>> {
    this.#port.postMessage(value);
    return { done: false, value: undefined };
  }

  /**
   * Closes the underlying port and returns.
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    return this.#end();
  }

  /**
   * Essentially an alias for `return()`. Errors intended for the other side are
   * delegated to a higher level of abstraction.
   * @returns The final result for this stream.
   */
  async throw(): Promise<IteratorResult<undefined, undefined>> {
    return this.#end();
  }

  #end(): IteratorResult<undefined, undefined> {
    this.#port.close();
    return makeDoneResult();
  }
}
harden(MessagePortWriter);

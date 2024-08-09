/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort).
 * The classes are naive passthrough mechanisms for data. Because there is no ergonomic
 * way to detect the closure of a message port at the time of writing, closure must be
 * handled at a higher level of abstraction. The lifetime of the underlying message port
 * is expected to be coextensive with "the other side".
 *
 * In addition, the message port mechanism is assumed to be 100% reliable, and the classes
 * therefore have no concept of errors or error handling. This is instead also delegated
 * to a higher level of abstraction.
 *
 * Regarding limitations around detecting `MessagePort` closure, see:
 * - https://github.com/fergald/explainer-messageport-close
 * - https://github.com/whatwg/html/issues/10201
 * @module MessagePort streams
 */

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
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. The message port mechanism is assumed to be completely reliable, and this
 * class therefore has no concept of errors or error handling. Errors and closure
 * are expected to be handled at a higher level of abstraction.
 *
 * @see
 * - {@link MessagePortWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class MessagePortReader<Yield> implements Reader<Yield> {
  #port: MessagePort;

  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  #messageQueue: MessageEvent[];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  #readQueue: PromiseCallbacks[];

  constructor(port: MessagePort) {
    this.#port = port;
    this.#messageQueue = [];
    this.#readQueue = [];

    // Assigning to the `onmessage` property initializes the port's message queue.
    // https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
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
   * Alias for {@link return}.
   * @deprecated This method only exists for interface conformance. Due to limitations
   * of the underlying communication mechanism, this class has no concept of errors.
   * Use {@link return} instead.
   * @returns The final result for this stream.
   */
  async throw(): Promise<IteratorResult<Yield, undefined>> {
    return this.return();
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
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. The message port mechanism is assumed to be completely reliable, and this
 * class therefore has no concept of errors or error handling. Errors and closure
 * are expected to be handled at a higher level of abstraction.
 *
 * @see
 * - {@link MessagePortReader} for the corresponding readable stream.
 * - The module-level documentation for more details.
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
   * Alias for {@link return}.
   * @deprecated This method only exists for interface conformance. Due to limitations
   * of the underlying communication mechanism, this class has no concept of errors.
   * Use {@link return} instead.
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

export type MessagePortStreams<Value> = Readonly<{
  reader: MessagePortReader<Value>;
  writer: MessagePortWriter<Value>;
}>;

export const makeMessagePortStreams = <Value>(
  port: MessagePort,
): MessagePortStreams<Value> =>
  harden({
    reader: new MessagePortReader(port),
    writer: new MessagePortWriter(port),
  });

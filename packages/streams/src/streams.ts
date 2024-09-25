/**
 * This module provides a pair of classes for creating readable and writable streams
 * over a [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort).
 * The classes are naive passthrough mechanisms for data that assume exclusive access
 * to their ports. The lifetime of the underlying message port is expected to be
 * coextensive with "the other side".
 *
 * At the time of writing, there is no ergonomic way to detect the closure of a port. For
 * this reason, ports have to be ended manually via `.return()` or `.throw()`. Ending a
 * {@link MessagePortWriter} will end any {@link MessagePortReader} reading from the
 * remote port and close the entangled ports, but it will not affect any other streams
 * connected to the remote or local port, which must also be ended manually.
 *
 * Regarding limitations around detecting `MessagePort` closure, see:
 * - https://github.com/fergald/explainer-messageport-close
 * - https://github.com/whatwg/html/issues/10201
 *
 * @module MessagePort streams
 */

import { makePromiseKit } from '@endo/promise-kit';
import type { Reader, Writer } from '@endo/stream';
import { hasProperty, isObject } from '@metamask/utils';
import { stringify } from '@ocap/utils';

export type { Reader, Writer };

type PromiseCallbacks = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const isIteratorResult = (
  value: unknown,
): value is IteratorResult<unknown, unknown> =>
  isObject(value) &&
  (!hasProperty(value, 'done') || typeof value.done === 'boolean') &&
  hasProperty(value, 'value');

export const makeDoneResult = (): { done: true; value: undefined } => ({
  done: true,
  value: undefined,
});

/**
 * A readable stream over a {@link MessagePort}.
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. Expects exclusive access to its port.
 *
 * @see
 * - {@link MessagePortWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class MessagePortReader<Yield> implements Reader<Yield> {
  #isDone: boolean;

  readonly #port: MessagePort;

  /**
   * For buffering messages to manage backpressure, i.e. the input rate exceeding the
   * read rate.
   */
  #messageQueue: MessageEvent<IteratorResult<unknown, unknown>>[];

  /**
   * For buffering reads to manage "suction", i.e. the read rate exceeding the input rate.
   */
  readonly #readQueue: PromiseCallbacks[];

  constructor(port: MessagePort) {
    this.#isDone = false;
    this.#port = port;
    this.#messageQueue = [];
    this.#readQueue = [];

    // Assigning to the `onmessage` property initializes the port's message queue.
    // https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
    this.#port.onmessage = this.#handleMessage.bind(this);
    harden(this);
  }

  [Symbol.asyncIterator](): MessagePortReader<Yield> {
    return this;
  }

  #handleMessage(message: MessageEvent): void {
    if (message.data instanceof Error) {
      this.#throw(message.data);
      return;
    }

    if (!isIteratorResult(message.data)) {
      this.#throw(
        new Error(
          `Received unexpected message via message port:\n${stringify(
            message.data,
          )}`,
        ),
      );
      return;
    }

    if (message.data.done === true) {
      this.#return();
      return;
    }

    if (this.#readQueue.length > 0) {
      const { resolve } = this.#readQueue.shift() as PromiseCallbacks;
      resolve({ ...message.data });
    } else {
      this.#messageQueue.push(message);
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
    if (this.#messageQueue.length > 0) {
      const message = this.#messageQueue.shift() as MessageEvent<
        IteratorResult<unknown, unknown>
      >;
      resolve({ ...message.data });
    } else {
      this.#readQueue.push({ resolve, reject });
    }
    return promise as Promise<IteratorResult<Yield, undefined>>;
  }

  /**
   * Closes the underlying port and returns. Any unread messages will be lost.
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
    while (this.#readQueue.length > 0) {
      const { resolve } = this.#readQueue.shift() as PromiseCallbacks;
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
  async throw(error: Error): Promise<IteratorResult<Yield, undefined>> {
    if (!this.#isDone) {
      this.#throw(error);
    }
    return makeDoneResult();
  }

  #throw(error: Error): void {
    while (this.#readQueue.length > 0) {
      const { reject } = this.#readQueue.shift() as PromiseCallbacks;
      reject(error);
    }
    this.#end();
  }

  #end(): void {
    this.#isDone = true;
    this.#messageQueue = [];
    this.#port.close();
    this.#port.onmessage = null;
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
  #isDone: boolean;

  readonly #port: MessagePort;

  constructor(port: MessagePort) {
    this.#isDone = false;
    this.#port = port;
    harden(this);
  }

  [Symbol.asyncIterator](): MessagePortWriter<Yield> {
    return this;
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
    return this.#send({ done: false, value });
  }

  /**
   * Closes the underlying port and returns. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    if (!this.#isDone) {
      this.#send(makeDoneResult());
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
      this.#throw(error);
    }
    return makeDoneResult();
  }

  /**
   * Forwards the error the port and calls `#finish()`. Mutually recursive with `#send()`.
   * For this reason, includes a flag indicating past failure, so that `#send()` can avoid
   * infinite recursion. See `#send()` for more details.
   *
   * @param error - The error to forward.
   * @param hasFailed - Whether sending has failed previously.
   * @returns The final result for this stream.
   */
  #throw(
    error: Error,
    hasFailed = false,
  ): IteratorResult<undefined, undefined> {
    const result = this.#send(error, hasFailed);
    !this.#isDone && this.#end();
    return result;
  }

  /**
   * Sends the value over the port. If sending the value fails, calls `#throw()`, and is
   * therefore mutually recursive with this method. For this reason, includes a flag
   * indicating past failure to send a value, which is used to avoid infinite recursion.
   * If sending the value succeeds, returns a finished result (`{ done: true }`) if the
   * value was an {@link Error} or itself a finished result, otherwise returns an
   * unfinished result (`{ done: false }`).
   *
   * @param value - The value to send over the port.
   * @param hasFailed - Whether sending has failed previously.
   * @returns The result of sending the value.
   */
  #send(
    value: IteratorResult<Yield, undefined> | Error,
    hasFailed = false,
  ): IteratorResult<undefined, undefined> {
    try {
      this.#port.postMessage(value);
      return value instanceof Error || value.done === true
        ? makeDoneResult()
        : { done: false, value: undefined };
    } catch (error) {
      console.error('MessagePortWriter experienced a send failure:', error);

      if (hasFailed) {
        // Break out of repeated failure to send an error. It is unclear how this would occur
        // in practice, but it's the kind of failure mode where it's better to be sure.
        const repeatedFailureError = new Error(
          'MessagePortWriter experienced repeated send failures.',
          { cause: error },
        );
        this.#port.postMessage(repeatedFailureError);
        throw repeatedFailureError;
      } else {
        // postMessage throws only DOMExceptions, which inherit from Error
        this.#throw(error as Error, true);
      }
      return makeDoneResult();
    }
  }

  #end(): void {
    this.#isDone = true;
    this.#port.close();
  }
}
harden(MessagePortWriter);

export type StreamPair<Read, Write> = Readonly<{
  reader: Reader<Read>;
  writer: Writer<Write>;
  /**
   * Calls `.return()` on both streams.
   */
  return: () => Promise<void>;
  /**
   * Calls `.throw()` on the writer, forwarding the error to the other side. Returns
   * the reader.
   *
   * @param error - The error to forward.
   */
  throw: (error: Error) => Promise<void>;
}>;

/**
 * Makes a reader / writer pair over the same port, and provides convenience methods
 * for cleaning them up.
 *
 * @param port - The message port to make the streams over.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makeMessagePortStreamPair = <Read, Write = Read>(
  port: MessagePort,
): StreamPair<Read, Write> => {
  const reader = new MessagePortReader<Read>(port);
  const writer = new MessagePortWriter<Write>(port);

  return harden({
    reader,
    writer,
    return: async () =>
      Promise.all([writer.return(), reader.return()]).then(() => undefined),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()]).then(() => undefined),
  });
};

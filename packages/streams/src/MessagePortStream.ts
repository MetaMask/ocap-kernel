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

import type { Reader, Writer } from '@endo/stream';

import type { StreamPair } from './shared.js';
import { ReaderCore, WriterCore } from './StreamCore.js';

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
  readonly #core: ReaderCore<Yield>;

  readonly #port: MessagePort;

  constructor(port: MessagePort) {
    this.#core = new ReaderCore(this.#end.bind(this));
    this.#port = port;
    // Assigning to the `onmessage` property initializes the port's message queue.
    // https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
    this.#port.onmessage = this.#handleMessage.bind(this);
    harden(this);
  }

  #end(): void {
    this.#port.close();
    this.#port.onmessage = null;
  }

  #handleMessage(messageEvent: MessageEvent): void {
    if (messageEvent.data instanceof Error) {
      this.#core.throw(messageEvent.data);
      return;
    }

    this.#core.receiveInput(messageEvent.data);
  }

  [Symbol.asyncIterator](): MessagePortReader<Yield> {
    return this;
  }

  /**
   * Reads the next message from the port.
   *
   * @returns The next message from the port.
   */
  async next(): Promise<IteratorResult<Yield, undefined>> {
    return this.#core.next();
  }

  /**
   * Closes the underlying port and returns. Any unread messages will be lost.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<Yield, undefined>> {
    return this.#core.return();
  }

  /**
   * Rejects all pending reads with the specified error, closes the underlying port,
   * and returns.
   *
   * @param error - The error to reject pending reads with.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<Yield, undefined>> {
    return this.#core.throw(error);
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
  readonly #core: WriterCore<Yield>;

  readonly #port: MessagePort;

  constructor(port: MessagePort) {
    this.#core = new WriterCore(
      'MessagePortWriter',
      this.#dispatch.bind(this),
      this.#end.bind(this),
    );
    this.#port = port;
    harden(this);
  }

  #end(): void {
    this.#port.close();
  }

  #dispatch(value: IteratorResult<Yield, undefined> | Error): void {
    this.#port.postMessage(value);
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
    return this.#core.next(value);
  }

  /**
   * Closes the underlying port and returns. Idempotent.
   *
   * @returns The final result for this stream.
   */
  async return(): Promise<IteratorResult<undefined, undefined>> {
    return this.#core.return();
  }

  /**
   * Forwards the error to the port and closes this stream. Idempotent.
   *
   * @param error - The error to forward to the port.
   * @returns The final result for this stream.
   */
  async throw(error: Error): Promise<IteratorResult<undefined, undefined>> {
    return this.#core.throw(error);
  }
}
harden(MessagePortWriter);

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

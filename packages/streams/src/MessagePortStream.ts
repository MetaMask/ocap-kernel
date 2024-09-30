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
 * connected to the remote or local port, which must also be ended manually. Use
 * {@link makeMessagePortStreamPair} to make a pair of streams that share a local port
 * and can be ended together.
 *
 * Regarding limitations around detecting `MessagePort` closure, see:
 * - https://github.com/fergald/explainer-messageport-close
 * - https://github.com/whatwg/html/issues/10201
 *
 * @module MessagePort streams
 */

import type { ReceiveInput } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import type { StreamPair } from './shared.js';

/**
 * A readable stream over a {@link MessagePort}.
 *
 * This class is a naive passthrough mechanism for data over a pair of linked message
 * ports. Expects exclusive read access to its port.
 *
 * @see
 * - {@link MessagePortWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class MessagePortReader<Yield> extends BaseReader<Yield> {
  readonly #port: MessagePort;

  readonly #receiveInput: ReceiveInput;

  constructor(port: MessagePort) {
    super();
    super.setOnEnd(this.#closePort.bind(this));

    this.#receiveInput = super.getReceiveInput();
    this.#port = port;

    // Assigning to the `onmessage` property initializes the port's message queue.
    // https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
    this.#port.onmessage = this.#onMessage.bind(this);

    harden(this);
  }

  #closePort(): void {
    this.#port.close();
    this.#port.onmessage = null;
  }

  #onMessage(messageEvent: MessageEvent<unknown>): void {
    if (messageEvent.data instanceof Error) {
      this.throwSync(messageEvent.data);
      return;
    }

    this.#receiveInput(messageEvent.data);
  }
}
harden(MessagePortReader);

/**
 * A writable stream over a {@link MessagePort}.
 *
 * @see
 * - {@link MessagePortReader} for the corresponding readable stream.
 * - The module-level documentation for more details.
 */
export class MessagePortWriter<Yield> extends BaseWriter<Yield> {
  readonly #port: MessagePort;

  constructor(port: MessagePort) {
    super('MessagePortWriter');
    super.setOnDispatch(this.#postMessage.bind(this));
    super.setOnEnd(this.#closePort.bind(this));
    this.#port = port;
    harden(this);
  }

  #closePort(): void {
    this.#port.close();
  }

  #postMessage(value: IteratorResult<Yield, undefined> | Error): void {
    this.#port.postMessage(value);
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

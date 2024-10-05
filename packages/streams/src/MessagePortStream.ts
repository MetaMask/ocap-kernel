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
 * {@link MessagePortDuplexStream} to create a duplex stream over a single port.
 *
 * Regarding limitations around detecting `MessagePort` closure, see:
 * - https://github.com/fergald/explainer-messageport-close
 * - https://github.com/whatwg/html/issues/10201
 *
 * @module MessagePort streams
 */

import type { Json } from '@metamask/utils';

import type { OnEnd } from './BaseStream.js';
import { BaseDuplexStream, BaseReader, BaseWriter } from './BaseStream.js';
import type { Dispatchable } from './utils.js';

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
export class MessagePortReader<Read extends Json> extends BaseReader<Read> {
  readonly #port: MessagePort;

  constructor(port: MessagePort, onEnd?: OnEnd) {
    super(async () => {
      port.close();
      port.onmessage = null;
      await onEnd?.();
    });

    const receiveInput = super.getReceiveInput();
    this.#port = port;

    // Assigning to the `onmessage` property initializes the port's message queue.
    // https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/message_event
    this.#port.onmessage = (messageEvent) => receiveInput(messageEvent.data);

    harden(this);
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
export class MessagePortWriter<Write extends Json> extends BaseWriter<Write> {
  constructor(port: MessagePort, onEnd?: OnEnd) {
    super(
      'MessagePortWriter',
      (value: Dispatchable<Write>) => port.postMessage(value),
      async () => {
        port.close();
        await onEnd?.();
      },
    );
    harden(this);
  }
}
harden(MessagePortWriter);

export class MessagePortDuplexStream<
  Read extends Json,
  Write extends Json = Read,
> extends BaseDuplexStream<
  Read,
  MessagePortReader<Read>,
  Write,
  MessagePortWriter<Write>
> {
  constructor(port: MessagePort) {
    let writer: MessagePortWriter<Write>; // eslint-disable-line prefer-const
    const reader = new MessagePortReader<Read>(port, async () => {
      await writer.return();
    });
    writer = new MessagePortWriter<Write>(port, async () => {
      await reader.return();
    });
    super(reader, writer);
  }
}
harden(MessagePortDuplexStream);

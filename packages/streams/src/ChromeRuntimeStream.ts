/**
 * This module provides a pair of classes for creating readable and writable streams
 * over the Chrome Extension Runtime messaging API.
 * The classes are naive passthrough mechanisms for data that assume exclusive access
 * to the messaging API. The lifetime of the underlying messaging connection is expected to be
 * coextensive with the extension's runtime.
 *
 * These streams utilize `chrome.runtime.sendMessage` for sending data and
 * `chrome.runtime.onMessage.addListener` for receiving data. This allows for
 * communication between different parts of a Chrome extension (e.g., background scripts,
 * content scripts, and popup pages).
 *
 * Note that unlike e.g. the `MessagePort` API, the Chrome Extension Runtime messaging API
 * doesn't have a built-in way to close the connection. The streams will continue to operate
 * as long as the extension is running, unless manually ended.
 *
 * @module ChromeRuntime streams
 */

import type { Json } from '@metamask/utils';

import type { ReceiveInput } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import type { ChromeRuntime, ChromeMessageSender } from './chrome.js';
import type { Dispatchable, StreamPair } from './utils.js';

export enum ChromeRuntimeStreamTarget {
  Background = 'background',
  Offscreen = 'offscreen',
}

export type MessageEnvelope<Payload> = {
  target: ChromeRuntimeStreamTarget;
  payload: Payload;
};

const isMessageEnvelope = (
  message: unknown,
): message is MessageEnvelope<unknown> =>
  typeof message === 'object' &&
  message !== null &&
  'target' in message &&
  'payload' in message;

/**
 * A readable stream over the Chrome Extension Runtime messaging API.
 *
 * This class is a naive passthrough mechanism for data using chrome.runtime.onMessage.
 * Expects exclusive read access to the messaging API.
 *
 * @see
 * - {@link ChromeRuntimeWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class ChromeRuntimeReader<Read extends Json> extends BaseReader<Read> {
  readonly #receiveInput: ReceiveInput;

  readonly #target: ChromeRuntimeStreamTarget;

  readonly #extensionId: string;

  constructor(runtime: ChromeRuntime, target: ChromeRuntimeStreamTarget) {
    super();

    this.#receiveInput = super.getReceiveInput();
    this.#target = target;
    this.#extensionId = runtime.id;
    const messageListener = this.#onMessage.bind(this);

    const removeListener = (): void =>
      runtime.onMessage.removeListener(messageListener);
    super.setOnEnd(removeListener);

    // Begin listening for messages from the Chrome runtime.
    runtime.onMessage.addListener(messageListener);

    harden(this);
  }

  #onMessage(message: unknown, sender: ChromeMessageSender): void {
    if (sender.id !== this.#extensionId) {
      return;
    }

    if (!isMessageEnvelope(message)) {
      console.debug(
        `ChromeRuntimeReader received unexpected message: ${JSON.stringify(
          message,
          null,
          2,
        )}`,
      );
      return;
    }

    if (message.target !== this.#target) {
      console.warn(
        `ChromeRuntimeReader received message for unexpected target: ${JSON.stringify(
          message,
          null,
          2,
        )}`,
      );
      return;
    }

    this.#receiveInput(message.payload);
  }
}
harden(ChromeRuntimeReader);

/**
 * A writable stream over the Chrome Extension Runtime messaging API.
 *
 * This class is a naive passthrough mechanism for data using `chrome.runtime.sendMessage`.
 *
 * @see
 * - {@link ChromeRuntimeReader} for the corresponding readable stream.
 * - The module-level documentation for more details.
 */
export class ChromeRuntimeWriter<Write extends Json> extends BaseWriter<Write> {
  constructor(runtime: ChromeRuntime, target: ChromeRuntimeStreamTarget) {
    super('ChromeRuntimeWriter');
    super.setOnDispatch(async (value: Dispatchable<Write>) => {
      await runtime.sendMessage({
        target,
        payload: value,
      });
    });
    harden(this);
  }
}
harden(ChromeRuntimeWriter);

/**
 * Makes a reader / writer pair over the Chrome Extension Runtime messaging API, and provides convenience methods
 * for cleaning them up.
 *
 * @param runtime - The Chrome runtime instance to use for messaging.
 * @param localTarget - The local target of the stream pair, i.e. how the remote side
 * addresses messages to this side.
 * @param remoteTarget - The remote target of the stream pair, i.e. how this side
 * addresses messages to the remote side.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makeChromeRuntimeStreamPair = <
  Read extends Json,
  Write extends Json = Read,
>(
  runtime: ChromeRuntime,
  localTarget: ChromeRuntimeStreamTarget,
  remoteTarget: ChromeRuntimeStreamTarget,
): StreamPair<Read, Write> => {
  if (localTarget === remoteTarget) {
    throw new Error('localTarget and remoteTarget must be different');
  }
  const reader = new ChromeRuntimeReader<Read>(runtime, localTarget);
  const writer = new ChromeRuntimeWriter<Write>(runtime, remoteTarget);

  return harden({
    reader,
    writer,
    return: async () =>
      Promise.all([writer.return(), reader.return()]).then(() => undefined),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()]).then(() => undefined),
  });
};

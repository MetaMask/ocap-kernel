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

import type { ReceiveInput } from './BaseStream.js';
import { BaseReader, BaseWriter } from './BaseStream.js';
import type { ChromeRuntime } from './chrome.js';
import type { StreamPair } from './shared.js';

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
export class ChromeRuntimeReader<Yield> extends BaseReader<Yield> {
  readonly #receiveInput: ReceiveInput;

  readonly #runtime: ChromeRuntime;

  readonly #messageListener: (message: unknown) => void;

  constructor(runtime: ChromeRuntime) {
    super();
    super.setOnEnd(this.#removeListener.bind(this));

    this.#receiveInput = super.getReceiveInput();
    this.#runtime = runtime;
    this.#messageListener = this.#onMessage.bind(this);

    // Begin listening for messages from the Chrome runtime.
    this.#runtime.onMessage.addListener(this.#messageListener);

    harden(this);
  }

  #removeListener(): void {
    this.#runtime.onMessage.removeListener(this.#messageListener);
  }

  #onMessage(message: unknown): void {
    if (message instanceof Error) {
      this.throwSync(message);
      return;
    }

    this.#receiveInput(message);
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
export class ChromeRuntimeWriter<Yield> extends BaseWriter<Yield> {
  readonly #runtime: ChromeRuntime;

  constructor(runtime: ChromeRuntime) {
    super('ChromeRuntimeWriter');
    super.setOnDispatch(this.#sendMessage.bind(this));
    this.#runtime = runtime;
    harden(this);
  }

  async #sendMessage(
    value: IteratorResult<Yield, undefined> | Error,
  ): Promise<void> {
    await this.#runtime.sendMessage(value);
  }
}
harden(ChromeRuntimeWriter);

/**
 * Makes a reader / writer pair over the Chrome Extension Runtime messaging API, and provides convenience methods
 * for cleaning them up.
 *
 * @param runtime - The Chrome runtime instance to use for messaging.
 * @returns The reader and writer streams, and cleanup methods.
 */
export const makeChromeRuntimeStreamPair = <Read, Write = Read>(
  runtime: ChromeRuntime,
): StreamPair<Read, Write> => {
  const reader = new ChromeRuntimeReader<Read>(runtime);
  const writer = new ChromeRuntimeWriter<Write>(runtime);

  return harden({
    reader,
    writer,
    return: async () =>
      Promise.all([writer.return(), reader.return()]).then(() => undefined),
    throw: async (error: Error) =>
      Promise.all([writer.throw(error), reader.return()]).then(() => undefined),
  });
};

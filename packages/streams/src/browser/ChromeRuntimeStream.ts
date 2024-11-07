/**
 * This module provides a pair of classes for creating readable and writable streams
 * over the Chrome Extension Runtime messaging API.
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
import { stringify } from '@ocap/utils';

import {
  BaseDuplexStream,
  makeDuplexStreamInputValidator,
} from '../BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  ValidateInput,
  BaseWriterArgs,
  ReceiveInput,
} from '../BaseStream.js';
import { BaseReader, BaseWriter } from '../BaseStream.js';
import type { ChromeRuntime, ChromeMessageSender } from '../chrome.js';
import {
  isMultiplexEnvelope,
  StreamMultiplexer,
} from '../StreamMultiplexer.js';
import type { MultiplexEnvelope } from '../StreamMultiplexer.js';
import { isJsonUnsafe } from '../utils.js';
import type { Dispatchable } from '../utils.js';

export enum ChromeRuntimeStreamTarget {
  Background = 'background',
  Offscreen = 'offscreen',
  Popup = 'popup',
}

export type MessageEnvelope<Payload> = {
  target: ChromeRuntimeStreamTarget;
  source: ChromeRuntimeStreamTarget;
  payload: Payload;
};

const isMessageEnvelope = (
  message: unknown,
): message is MessageEnvelope<unknown> =>
  typeof message === 'object' &&
  message !== null &&
  'target' in message &&
  'source' in message &&
  'payload' in message;

/**
 * A readable stream over the Chrome Extension Runtime messaging API.
 *
 * This class is a naive passthrough mechanism for data using `chrome.runtime.onMessage`.
 * Expects exclusive read access to the messaging API.
 *
 * @see
 * - {@link ChromeRuntimeWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class ChromeRuntimeReader<Read extends Json> extends BaseReader<Read> {
  readonly #receiveInput: ReceiveInput;

  readonly #target: ChromeRuntimeStreamTarget;

  readonly #source: ChromeRuntimeStreamTarget;

  readonly #extensionId: string;

  constructor(
    runtime: ChromeRuntime,
    target: ChromeRuntimeStreamTarget,
    source: ChromeRuntimeStreamTarget,
    { validateInput, onEnd }: BaseReaderArgs<Read> = {},
  ) {
    // eslint-disable-next-line prefer-const
    let messageListener: (
      message: unknown,
      sender: ChromeMessageSender,
    ) => void;

    super({
      validateInput,
      onEnd: async () => {
        runtime.onMessage.removeListener(messageListener);
        await onEnd?.();
      },
    });

    this.#receiveInput = super.getReceiveInput();
    this.#target = target;
    this.#source = source;
    this.#extensionId = runtime.id;

    messageListener = this.#onMessage.bind(this);
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
        `ChromeRuntimeReader received unexpected message: ${stringify(
          message,
        )}`,
      );
      return;
    }

    if (message.target !== this.#target || message.source !== this.#source) {
      console.debug(
        `ChromeRuntimeReader received message with incorrect target or source: ${stringify(message)}`,
        `Expected target: ${this.#target}`,
        `Expected source: ${this.#source}`,
      );
      return;
    }

    this.#receiveInput(message.payload).catch(async (error) =>
      this.throw(error),
    );
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
  constructor(
    runtime: ChromeRuntime,
    target: ChromeRuntimeStreamTarget,
    source: ChromeRuntimeStreamTarget,
    { name, onEnd }: Omit<BaseWriterArgs<Write>, 'onDispatch'> = {},
  ) {
    super({
      name,
      onDispatch: async (value: Dispatchable<Write>) => {
        await runtime.sendMessage({
          target,
          source,
          payload: value,
        });
      },
      onEnd,
    });
    harden(this);
  }
}
harden(ChromeRuntimeWriter);

/**
 * A duplex stream over the Chrome Extension Runtime messaging API.
 *
 * This class is a naive passthrough mechanism for data using `chrome.runtime.onMessage`.
 *
 * @see
 * - {@link ChromeRuntimeReader} for the corresponding readable stream.
 * - {@link ChromeRuntimeWriter} for the corresponding writable stream.
 */
export class ChromeRuntimeDuplexStream<
  Read extends Json,
  Write extends Json = Read,
> extends BaseDuplexStream<
  Read,
  ChromeRuntimeReader<Read>,
  Write,
  ChromeRuntimeWriter<Write>
> {
  constructor(
    runtime: ChromeRuntime,
    localTarget: ChromeRuntimeStreamTarget,
    remoteTarget: ChromeRuntimeStreamTarget,
    validateInput?: ValidateInput<Read>,
  ) {
    let writer: ChromeRuntimeWriter<Write>; // eslint-disable-line prefer-const
    const reader = new ChromeRuntimeReader<Read>(
      runtime,
      localTarget,
      remoteTarget,
      {
        name: 'ChromeRuntimeDuplexStream',
        validateInput: makeDuplexStreamInputValidator(validateInput),
        onEnd: async () => {
          await writer.return();
        },
      },
    );
    writer = new ChromeRuntimeWriter<Write>(
      runtime,
      remoteTarget,
      localTarget,
      {
        name: 'ChromeRuntimeDuplexStream',
        onEnd: async () => {
          await reader.return();
        },
      },
    );
    super(reader, writer);
    harden(this);
  }

  static async make<Read extends Json, Write extends Json = Read>(
    runtime: ChromeRuntime,
    localTarget: ChromeRuntimeStreamTarget,
    remoteTarget: ChromeRuntimeStreamTarget,
    validateInput?: ValidateInput<Read>,
  ): Promise<ChromeRuntimeDuplexStream<Read, Write>> {
    if (localTarget === remoteTarget) {
      throw new Error('localTarget and remoteTarget must be different');
    }

    const stream = new ChromeRuntimeDuplexStream<Read, Write>(
      runtime,
      localTarget,
      remoteTarget,
      validateInput,
    );
    await stream.synchronize();
    return stream;
  }
}
harden(ChromeRuntimeDuplexStream);

const isJsonMultiplexEnvelope = (
  value: unknown,
): value is MultiplexEnvelope<Json> =>
  isMultiplexEnvelope(value) && isJsonUnsafe(value.payload);

export class ChromeRuntimeMultiplexer extends StreamMultiplexer<Json> {
  constructor(
    runtime: ChromeRuntime,
    localTarget: ChromeRuntimeStreamTarget,
    remoteTarget: ChromeRuntimeStreamTarget,
    name?: string,
  ) {
    super(
      new ChromeRuntimeDuplexStream<
        MultiplexEnvelope<Json>,
        MultiplexEnvelope<Json>
      >(runtime, localTarget, remoteTarget, isJsonMultiplexEnvelope),
      name,
    );
    harden(this);
  }
}
harden(ChromeRuntimeMultiplexer);
